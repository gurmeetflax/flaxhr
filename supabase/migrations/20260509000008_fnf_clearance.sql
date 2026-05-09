-- Flax HR — Migration 035: Phase 11 — FnF & Clearance
--
-- When an employee's exit_date is set, auto-create a Full-and-Final
-- record + a default clearance checklist. Settlement = last-month
-- prorated salary + leave encashment − outstanding deductions.

-- ==========================================================================
-- 1. core.fnf_records
-- ==========================================================================
create table if not exists core.fnf_records (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null unique references core.employees(id) on delete cascade,
  exit_date       date not null,
  fnf_target_date date not null,
  status          text not null default 'open'
                  check (status in ('open','clearance_done','settled','closed')),
  final_amount    numeric(12,2),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  settled_at      timestamptz,
  settled_by      uuid
);

create index if not exists fnf_records_status_idx on core.fnf_records (status, fnf_target_date);

drop trigger if exists trg_fnf_records_updated_at on core.fnf_records;
create trigger trg_fnf_records_updated_at
  before update on core.fnf_records
  for each row execute function core.set_updated_at();

drop trigger if exists trg_fnf_records_audit on core.fnf_records;
create trigger trg_fnf_records_audit
  after insert or update or delete on core.fnf_records
  for each row execute function core.log_audit();

alter table core.fnf_records enable row level security;

drop policy if exists fnf_records_admin_hr_all on core.fnf_records;
create policy fnf_records_admin_hr_all on core.fnf_records
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists fnf_records_self_select on core.fnf_records;
create policy fnf_records_self_select on core.fnf_records
  for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

drop policy if exists fnf_records_auditor_select on core.fnf_records;
create policy fnf_records_auditor_select on core.fnf_records
  for select using (core.has_role('auditor'));

-- ==========================================================================
-- 2. core.clearance_items
-- ==========================================================================
create table if not exists core.clearance_items (
  id              uuid primary key default gen_random_uuid(),
  fnf_id          uuid not null references core.fnf_records(id) on delete cascade,
  code            text not null,
  label           text not null,
  owner_role      text not null check (owner_role in ('it','manager','hr','employee')),
  status          text not null default 'pending'
                  check (status in ('pending','done','waived')),
  notes           text,
  completed_at    timestamptz,
  completed_by    uuid,
  created_at      timestamptz not null default now(),
  unique (fnf_id, code)
);

create index if not exists clearance_items_fnf_idx on core.clearance_items (fnf_id);

drop trigger if exists trg_clearance_items_audit on core.clearance_items;
create trigger trg_clearance_items_audit
  after insert or update or delete on core.clearance_items
  for each row execute function core.log_audit();

alter table core.clearance_items enable row level security;

drop policy if exists clearance_items_admin_hr_all on core.clearance_items;
create policy clearance_items_admin_hr_all on core.clearance_items
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists clearance_items_manager on core.clearance_items;
create policy clearance_items_manager on core.clearance_items
  for all
  using (core.has_role('manager'))
  with check (core.has_role('manager'));

drop policy if exists clearance_items_self_select on core.clearance_items;
create policy clearance_items_self_select on core.clearance_items
  for select
  using (
    fnf_id in (
      select id from core.fnf_records
       where employee_id in (select id from core.employees where user_id = auth.uid())
    )
  );

-- ==========================================================================
-- 3. Default items + trigger to auto-create on exit_date
-- ==========================================================================
insert into core.app_settings (key, value)
  values ('fnf_default_items', jsonb_build_array(
    jsonb_build_object('code', 'it_assets',       'label', 'Return IT assets',           'owner_role', 'it'),
    jsonb_build_object('code', 'uniform_return',  'label', 'Return uniform',              'owner_role', 'manager'),
    jsonb_build_object('code', 'dues_clear',      'label', 'Clear pending dues',          'owner_role', 'hr'),
    jsonb_build_object('code', 'handover',        'label', 'Knowledge / handover',        'owner_role', 'manager'),
    jsonb_build_object('code', 'acknowledgement', 'label', 'Final acknowledgement signed', 'owner_role', 'employee')
  ))
  on conflict (key) do nothing;

create or replace function core.create_fnf_for_exit()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  fnf_id uuid;
  defaults jsonb;
  item jsonb;
begin
  if (new.exit_date is null) or (old.exit_date is not distinct from new.exit_date) then
    return new;
  end if;
  if exists (select 1 from core.fnf_records where employee_id = new.id) then
    return new;
  end if;

  insert into core.fnf_records (employee_id, exit_date, fnf_target_date)
  values (new.id, new.exit_date, new.exit_date + 7)
  returning id into fnf_id;

  defaults := coalesce(core.get_app_setting('fnf_default_items'), '[]'::jsonb);
  for item in select * from jsonb_array_elements(defaults)
  loop
    insert into core.clearance_items (fnf_id, code, label, owner_role)
    values (fnf_id,
            item->>'code',
            item->>'label',
            coalesce(item->>'owner_role', 'hr'));
  end loop;

  -- Notify HR (find any admin/hr user via user_roles).
  perform core.notify(
    new.id,
    'fnf_created',
    'FnF process started',
    'Your separation has been initiated. Target settlement: ' || (new.exit_date + 7)::text || '.',
    jsonb_build_object('fnf_id', fnf_id, 'exit_date', new.exit_date)
  );

  return new;
end;
$$;

drop trigger if exists trg_employees_create_fnf on core.employees;
create trigger trg_employees_create_fnf
  after update of exit_date on core.employees
  for each row execute function core.create_fnf_for_exit();

-- ==========================================================================
-- 4. compute_fnf_settlement RPC
-- ==========================================================================
create or replace function public.compute_fnf_settlement(p_fnf_id uuid)
returns numeric
language plpgsql
security definer
set search_path = core, attendance, public
as $$
declare
  r           core.fnf_records%rowtype;
  emp         core.employees%rowtype;
  period_start date;
  period_end   date;
  dim          integer;
  days_present numeric(6,2);
  days_leave   numeric(6,2);
  days_payable numeric(6,2);
  prorated     numeric(12,2);
  encashable   numeric(12,2);
  out_ded      numeric(12,2);
  net          numeric(12,2);
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into r from core.fnf_records where id = p_fnf_id;
  if r.id is null then raise exception 'FNF_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into emp from core.employees where id = r.employee_id;

  period_start := date_trunc('month', r.exit_date)::date;
  period_end   := r.exit_date;
  dim          := extract(day from (period_start + interval '1 month - 1 day'))::int;

  select count(distinct (l.punched_at at time zone 'Asia/Kolkata')::date)
    into days_present
    from attendance.logs l
   where l.employee_id = emp.id
     and l.type = 'in'
     and (l.punched_at at time zone 'Asia/Kolkata')::date between period_start and period_end;

  select coalesce(sum(
          least(coalesce(lr.end_date, period_end), period_end) -
          greatest(coalesce(lr.start_date, period_start), period_start) + 1
         ), 0)
    into days_leave
    from core.leave_requests lr
    join core.leave_types lt on lt.id = lr.leave_type_id
   where lr.employee_id = emp.id
     and lr.status = 'approved'
     and coalesce(lt.is_paid, true)
     and lr.start_date <= period_end
     and lr.end_date   >= period_start;
  days_leave := coalesce(days_leave, 0);

  days_payable := least(days_present + days_leave, dim);
  prorated     := round(coalesce(emp.monthly_salary, 0) * days_payable / dim, 2);

  -- Leave encashment: total positive paid-leave balance × per-day rate.
  select coalesce(sum(
          greatest(b.balance, 0) * (coalesce(emp.monthly_salary, 0) / dim)
         ), 0)
    into encashable
    from core.leave_balances b
    join core.leave_types lt on lt.id = b.leave_type_id
   where b.employee_id = emp.id
     and coalesce(lt.is_paid, true)
     and coalesce(lt.is_encashable, false);
  encashable := coalesce(encashable, 0);

  -- Outstanding deductions: sum monthly_amount × months_remaining.
  select coalesce(sum(monthly_amount * months_remaining), 0)
    into out_ded
    from core.deductions
   where employee_id = emp.id and is_active and months_remaining > 0;
  out_ded := coalesce(out_ded, 0);

  net := round(prorated + encashable - out_ded, 2);

  update core.fnf_records
     set final_amount = net
   where id = p_fnf_id;

  return net;
end;
$$;

grant execute on function public.compute_fnf_settlement(uuid) to authenticated;

-- Add is_encashable to leave_types if it doesn't exist (idempotent).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'leave_types' and column_name = 'is_encashable'
  ) then
    alter table core.leave_types add column is_encashable boolean not null default false;
  end if;
end $$;

-- ==========================================================================
-- 5. Mark item RPC (notifies + checks if all done)
-- ==========================================================================
create or replace function public.update_clearance_item(
  p_id     uuid,
  p_status text,
  p_notes  text default null
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  it core.clearance_items%rowtype;
  remaining int;
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_status not in ('pending','done','waived') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  update core.clearance_items
     set status = p_status,
         notes  = coalesce(p_notes, notes),
         completed_at = case when p_status = 'pending' then null else now() end,
         completed_by = case when p_status = 'pending' then null else auth.uid() end
   where id = p_id
   returning * into it;

  -- If all items done/waived, flip FnF status to clearance_done.
  select count(*) into remaining
    from core.clearance_items
   where fnf_id = it.fnf_id and status = 'pending';

  if remaining = 0 then
    update core.fnf_records
       set status = 'clearance_done'
     where id = it.fnf_id and status = 'open';
  end if;
end;
$$;

grant execute on function public.update_clearance_item(uuid, text, text) to authenticated;

-- ==========================================================================
-- 6. Mark settled RPC
-- ==========================================================================
create or replace function public.settle_fnf(p_fnf_id uuid)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  r core.fnf_records%rowtype;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into r from core.fnf_records where id = p_fnf_id for update;
  if r.id is null then raise exception 'FNF_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.status not in ('open','clearance_done') then return; end if;

  update core.fnf_records
     set status = 'settled',
         settled_by = auth.uid(),
         settled_at = now()
   where id = p_fnf_id;

  perform core.notify(
    r.employee_id,
    'fnf_settled',
    'FnF settled',
    'Your full and final settlement has been processed. Final amount: ₹' || coalesce(r.final_amount::text, '—'),
    jsonb_build_object('fnf_id', r.id, 'final_amount', r.final_amount)
  );
end;
$$;

grant execute on function public.settle_fnf(uuid) to authenticated;

-- ==========================================================================
-- 7. Views
-- ==========================================================================
create or replace view public.v_fnf_records
with (security_invoker = true) as
  select r.id, r.employee_id, r.exit_date, r.fnf_target_date, r.status,
         r.final_amount, r.notes, r.created_at, r.updated_at,
         r.settled_at, r.settled_by,
         e.employee_code, e.full_name, e.outlet_id,
         o.display_name as outlet_name,
         (select count(*) from core.clearance_items i where i.fnf_id = r.id) as items_total,
         (select count(*) from core.clearance_items i where i.fnf_id = r.id and i.status <> 'pending') as items_done
    from core.fnf_records r
    join core.employees e on e.id = r.employee_id
    left join public.flax_outlets o on o.id = e.outlet_id;

grant select on public.v_fnf_records to authenticated;

create or replace view public.v_clearance_items
with (security_invoker = true) as
  select i.id, i.fnf_id, i.code, i.label, i.owner_role, i.status,
         i.notes, i.completed_at, i.completed_by, i.created_at,
         r.employee_id
    from core.clearance_items i
    join core.fnf_records r on r.id = i.fnf_id;

grant select on public.v_clearance_items to authenticated;

notify pgrst, 'reload schema';
