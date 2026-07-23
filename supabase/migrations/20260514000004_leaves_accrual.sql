-- Flax HR — Leave accrual (opening balance on hire + monthly accrual + audit)
--
-- Before this migration:
--   * core.leave_types.accrual_per_month existed but nothing read it.
--   * core.leave_balances was only touched on approval (subtract).
--   * A new employee started with 0 in every bucket, so every paid-leave
--     request failed with INSUFFICIENT_BALANCE.
--
-- After:
--   * On employee INSERT, we credit the "opening bucket" for each paid
--     leave type (accrual_per_month × 12, capped by max_balance) — one
--     row per (employee, leave_type) in core.leave_balances.
--   * Every credit / debit / manual tweak writes an audit row to
--     core.leave_balance_adjustments with the actor, reason, and delta.
--   * public.accrue_monthly_leaves(period) tops up every active
--     employee's paid balances by accrual_per_month, respecting
--     max_balance. Safe to re-run — it skips periods already credited.
--   * public.adjust_leave_balance(emp, type, delta, reason) is the HR
--     handle for corrections, encash, comp-off etc.
--   * public.backfill_opening_leave_balances() grants openings to
--     existing employees who don't yet have any leave_balances row.
--   * If pg_cron is available in the extensions schema, we schedule the
--     monthly accrual for the 1st of every month at 02:00 IST. Fail-soft
--     if pg_cron isn't enabled — HR can run the RPC manually.

----------------------------------------------------------------------------
-- 1) Audit table for every balance change
----------------------------------------------------------------------------
create table if not exists core.leave_balance_adjustments (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references core.employees(id) on delete cascade,
  leave_type_id  uuid not null references core.leave_types(id) on delete cascade,
  delta          numeric(6,2) not null,           -- +/-, e.g. +12.00 or -0.50
  balance_after  numeric(6,2) not null,           -- resulting balance
  reason         text not null,
  source         text not null check (source in (
                   'opening','accrual','manual_adjust','approval_debit','carry_forward','encash'
                 )),
  effective_on   date not null default current_date,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists lba_emp_idx
  on core.leave_balance_adjustments (employee_id, effective_on desc);
create index if not exists lba_type_idx
  on core.leave_balance_adjustments (leave_type_id, effective_on desc);

alter table core.leave_balance_adjustments enable row level security;

drop policy if exists lba_admin_hr on core.leave_balance_adjustments;
create policy lba_admin_hr on core.leave_balance_adjustments for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists lba_self on core.leave_balance_adjustments;
create policy lba_self on core.leave_balance_adjustments for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

drop trigger if exists trg_lba_audit on core.leave_balance_adjustments;
create trigger trg_lba_audit
  after insert or update or delete on core.leave_balance_adjustments
  for each row execute function core.log_audit();

----------------------------------------------------------------------------
-- 2) Internal helper: apply a delta and write the audit row atomically
----------------------------------------------------------------------------
create or replace function core.apply_leave_balance_delta(
  p_employee    uuid,
  p_leave_type  uuid,
  p_delta       numeric,
  p_source      text,
  p_reason      text,
  p_effective   date default current_date,
  p_actor       uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = core, public
as $$
declare
  new_balance numeric(6,2);
  max_bal numeric(6,2);
  cur numeric(6,2);
begin
  select max_balance into max_bal from core.leave_types lt where lt.id = p_leave_type;
  select coalesce(balance, 0) into cur
    from core.leave_balances
    where employee_id = p_employee and leave_type_id = p_leave_type;
  new_balance := cur + p_delta;

  if max_bal is not null and new_balance > max_bal then
    new_balance := max_bal;
  end if;

  insert into core.leave_balances (employee_id, leave_type_id, balance, as_of)
    values (p_employee, p_leave_type, new_balance, p_effective)
    on conflict (employee_id, leave_type_id)
    do update set balance = excluded.balance, as_of = excluded.as_of;

  insert into core.leave_balance_adjustments
    (employee_id, leave_type_id, delta, balance_after, reason, source, effective_on, created_by)
    values (p_employee, p_leave_type, new_balance - cur, new_balance,
            p_reason, p_source, p_effective, coalesce(p_actor, auth.uid()));

  return new_balance;
end;
$$;

----------------------------------------------------------------------------
-- 3) Opening balance on hire — trigger on core.employees insert
----------------------------------------------------------------------------
create or replace function core.grant_opening_leave_balance()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  lt record;
  opening numeric(6,2);
begin
  -- Only grant on freshly-created active employees.
  if new.deleted_at is not null or new.is_active = false then
    return new;
  end if;
  for lt in select * from core.leave_types
             where is_active and is_paid and accrual_per_month > 0 loop
    -- Opening bucket = a full year's worth of accrual, capped by max_balance.
    opening := lt.accrual_per_month * 12;
    if lt.max_balance is not null and opening > lt.max_balance then
      opening := lt.max_balance;
    end if;
    perform core.apply_leave_balance_delta(
      new.id, lt.id, opening,
      'opening',
      'Opening balance on hire',
      coalesce(new.hired_on, current_date),
      null
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_grant_opening_balance on core.employees;
create trigger trg_grant_opening_balance
  after insert on core.employees
  for each row execute function core.grant_opening_leave_balance();

----------------------------------------------------------------------------
-- 4) HR RPC: adjust a balance (manual correction, encash, comp-off …)
----------------------------------------------------------------------------
create or replace function public.adjust_leave_balance(
  p_employee    uuid,
  p_leave_type  uuid,
  p_delta       numeric,
  p_reason      text,
  p_source      text default 'manual_adjust'
) returns numeric
language plpgsql
security definer
set search_path = core, public
as $$
declare
  final numeric;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_delta = 0 then
    raise exception 'DELTA_ZERO' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if p_source not in ('manual_adjust','encash','carry_forward') then
    raise exception 'INVALID_SOURCE' using errcode = 'P0001';
  end if;
  final := core.apply_leave_balance_delta(
    p_employee, p_leave_type, p_delta,
    p_source, p_reason, current_date, auth.uid()
  );
  return final;
end;
$$;

grant execute on function public.adjust_leave_balance(uuid, uuid, numeric, text, text) to authenticated;

----------------------------------------------------------------------------
-- 5) Monthly accrual — HR-callable RPC + idempotent
----------------------------------------------------------------------------
create or replace function public.accrue_monthly_leaves(
  p_period_month date default null
) returns int
language plpgsql
security definer
set search_path = core, public
as $$
declare
  period date;
  emp record;
  lt record;
  already boolean;
  credits int := 0;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  period := date_trunc('month', coalesce(p_period_month, current_date))::date;

  for emp in select id from core.employees
              where is_active and deleted_at is null
                and hired_on <= period loop
    for lt in select * from core.leave_types
               where is_active and is_paid and accrual_per_month > 0 loop
      -- Skip if we've already credited this employee + type for this month.
      select true into already
        from core.leave_balance_adjustments
       where employee_id = emp.id and leave_type_id = lt.id
         and source = 'accrual' and effective_on = period
       limit 1;
      if not already then
        perform core.apply_leave_balance_delta(
          emp.id, lt.id, lt.accrual_per_month,
          'accrual',
          'Monthly accrual for ' || to_char(period, 'FMMonth YYYY'),
          period, null
        );
        credits := credits + 1;
      end if;
      already := null;
    end loop;
  end loop;
  return credits;
end;
$$;

grant execute on function public.accrue_monthly_leaves(date) to authenticated;

----------------------------------------------------------------------------
-- 6) One-shot backfill of opening balances for pre-existing employees
----------------------------------------------------------------------------
create or replace function public.backfill_opening_leave_balances()
returns int
language plpgsql
security definer
set search_path = core, public
as $$
declare
  emp record;
  lt record;
  granted int := 0;
  opening numeric(6,2);
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  for emp in
    select e.id, e.hired_on from core.employees e
    where e.is_active and e.deleted_at is null
      and not exists (
        select 1 from core.leave_balance_adjustments
        where employee_id = e.id and source = 'opening'
      )
  loop
    for lt in select * from core.leave_types
               where is_active and is_paid and accrual_per_month > 0 loop
      opening := lt.accrual_per_month * 12;
      if lt.max_balance is not null and opening > lt.max_balance then
        opening := lt.max_balance;
      end if;
      perform core.apply_leave_balance_delta(
        emp.id, lt.id, opening,
        'opening',
        'Backfilled opening balance',
        coalesce(emp.hired_on, current_date),
        null
      );
      granted := granted + 1;
    end loop;
  end loop;
  return granted;
end;
$$;

grant execute on function public.backfill_opening_leave_balances() to authenticated;

----------------------------------------------------------------------------
-- 7) Update decide_leave_request to use the delta helper (audit trail!)
----------------------------------------------------------------------------
create or replace function public.decide_leave_request(
  p_id     uuid,
  p_status text,
  p_note   text default null
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  lr core.leave_requests%rowtype;
  lt core.leave_types%rowtype;
  is_authorised boolean;
begin
  if p_status not in ('approved','rejected') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  select * into lr from core.leave_requests where id = p_id for update;
  if lr.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if lr.status <> 'pending' then
    raise exception 'ALREADY_DECIDED' using errcode = 'P0001';
  end if;
  is_authorised := core.is_admin() or core.has_role('hr')
    or (core.has_role('manager') and exists (
         select 1 from core.employees e
         where e.id = lr.employee_id
           and (e.outlet_id is null or core.has_outlet_access(e.outlet_id))
       ));
  if not is_authorised then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update core.leave_requests
    set status = p_status, decided_by = auth.uid(), decided_at = now(),
        decision_note = p_note
    where id = p_id;

  if p_status = 'approved' then
    select * into lt from core.leave_types where id = lr.leave_type_id;
    if lt.is_paid then
      perform core.apply_leave_balance_delta(
        lr.employee_id, lr.leave_type_id, -lr.days,
        'approval_debit',
        'Leave approved: ' || coalesce(lr.reason, '(no reason)'),
        current_date, auth.uid()
      );
    end if;
  end if;

  return jsonb_build_object('id', lr.id, 'status', p_status);
end $$;

grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;

----------------------------------------------------------------------------
-- 8) Admin/HR view of every employee's balances
----------------------------------------------------------------------------
drop view if exists public.v_employee_leave_balances;
create view public.v_employee_leave_balances
with (security_invoker = true) as
select
  e.id           as employee_id,
  e.employee_code,
  e.full_name    as employee_name,
  e.outlet_id,
  lt.id          as leave_type_id,
  lt.code        as leave_code,
  lt.name        as leave_name,
  lt.is_paid,
  coalesce(lb.balance, 0)::numeric(6,2) as balance,
  lb.as_of
from core.employees e
cross join core.leave_types lt
left join core.leave_balances lb
       on lb.employee_id = e.id and lb.leave_type_id = lt.id
where e.deleted_at is null and lt.is_active;

grant select on public.v_employee_leave_balances to authenticated;

----------------------------------------------------------------------------
-- 9) Schedule the monthly accrual via pg_cron — fail-soft
----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 02:00 IST on the 1st of every month == 20:30 UTC previous day
    perform cron.schedule(
      'leaves-monthly-accrual',
      '30 20 L * *',  -- last day of month, 20:30 UTC → 02:00 IST next day (1st)
      $sql$select public.accrue_monthly_leaves(current_date + interval '1 day')$sql$
    );
    raise notice 'Scheduled leaves-monthly-accrual via pg_cron';
  else
    raise notice 'pg_cron not enabled — HR must call public.accrue_monthly_leaves() manually or externally on the 1st';
  end if;
end $$;

notify pgrst, 'reload schema';
