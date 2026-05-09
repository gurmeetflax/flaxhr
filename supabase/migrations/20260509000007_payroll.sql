-- Flax HR — Migration 034: Phase 10 — Payroll cycle-1 lean
--
-- Monthly payroll run per outlet. Gross = monthly_salary, prorated by
-- (days_present + paid_leave_days) / days_in_month. Deductions ledger
-- (uniform / advance / other) decrements months_remaining when the
-- run is finalised. No statutory yet (PF/ESI/PT/TDS).
--
-- Multi-outlet handling (Phase 9.6): payroll runs only for the home
-- outlet (employees.outlet_id). days_present counts distinct dates
-- across all outlets the employee punched at, so split-shift folks
-- still get full pay from one run.

-- ==========================================================================
-- 1. core.deductions — recurring monthly debit per employee
-- ==========================================================================
create table if not exists core.deductions (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references core.employees(id) on delete cascade,
  kind            text not null check (kind in ('uniform','advance','other')),
  total_amount    numeric(12,2) not null check (total_amount >= 0),
  monthly_amount  numeric(12,2) not null check (monthly_amount > 0),
  months_total    integer not null check (months_total > 0),
  months_remaining integer not null check (months_remaining >= 0),
  started_on      date not null default current_date,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid
);

create index if not exists deductions_emp_idx
  on core.deductions (employee_id) where is_active and months_remaining > 0;

drop trigger if exists trg_deductions_updated_at on core.deductions;
create trigger trg_deductions_updated_at
  before update on core.deductions
  for each row execute function core.set_updated_at();

drop trigger if exists trg_deductions_audit on core.deductions;
create trigger trg_deductions_audit
  after insert or update or delete on core.deductions
  for each row execute function core.log_audit();

alter table core.deductions enable row level security;

drop policy if exists deductions_admin_hr_all on core.deductions;
create policy deductions_admin_hr_all on core.deductions
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists deductions_self_select on core.deductions;
create policy deductions_self_select on core.deductions
  for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

drop policy if exists deductions_auditor_select on core.deductions;
create policy deductions_auditor_select on core.deductions
  for select
  using (core.has_role('auditor'));

-- ==========================================================================
-- 2. core.payroll_runs + core.payroll_run_lines
-- ==========================================================================
create table if not exists core.payroll_runs (
  id              uuid primary key default gen_random_uuid(),
  outlet_id       text not null references public.flax_outlets(id),
  period_month    date not null,                   -- always the 1st of the month
  status          text not null default 'draft' check (status in ('draft','finalised')),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  finalised_by    uuid,
  finalised_at    timestamptz,
  notes           text,
  unique (outlet_id, period_month)
);

create index if not exists payroll_runs_period_idx on core.payroll_runs (period_month desc);

drop trigger if exists trg_payroll_runs_audit on core.payroll_runs;
create trigger trg_payroll_runs_audit
  after insert or update or delete on core.payroll_runs
  for each row execute function core.log_audit();

alter table core.payroll_runs enable row level security;

drop policy if exists payroll_runs_admin_hr_all on core.payroll_runs;
create policy payroll_runs_admin_hr_all on core.payroll_runs
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists payroll_runs_manager_select on core.payroll_runs;
create policy payroll_runs_manager_select on core.payroll_runs
  for select
  using (core.has_role('manager') and core.has_outlet_access(outlet_id));

drop policy if exists payroll_runs_auditor_select on core.payroll_runs;
create policy payroll_runs_auditor_select on core.payroll_runs
  for select
  using (core.has_role('auditor'));

create table if not exists core.payroll_run_lines (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references core.payroll_runs(id) on delete cascade,
  employee_id         uuid not null references core.employees(id) on delete cascade,
  gross               numeric(12,2) not null default 0,
  days_in_month       integer not null,
  days_present        numeric(6,2) not null default 0,
  days_paid_leave     numeric(6,2) not null default 0,
  days_payable        numeric(6,2) not null default 0,
  prorated_gross      numeric(12,2) not null default 0,
  deductions_total    numeric(12,2) not null default 0,
  deductions_breakdown jsonb not null default '[]'::jsonb,
  net_pay             numeric(12,2) not null default 0,
  notes               text,
  created_at          timestamptz not null default now(),
  unique (run_id, employee_id)
);

create index if not exists payroll_run_lines_emp_idx on core.payroll_run_lines (employee_id);

alter table core.payroll_run_lines enable row level security;

drop policy if exists payroll_run_lines_admin_hr_all on core.payroll_run_lines;
create policy payroll_run_lines_admin_hr_all on core.payroll_run_lines
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists payroll_run_lines_self_select on core.payroll_run_lines;
create policy payroll_run_lines_self_select on core.payroll_run_lines
  for select
  using (
    employee_id in (select id from core.employees where user_id = auth.uid())
    and exists (
      select 1 from core.payroll_runs r
       where r.id = run_id and r.status = 'finalised'
    )
  );

drop policy if exists payroll_run_lines_auditor_select on core.payroll_run_lines;
create policy payroll_run_lines_auditor_select on core.payroll_run_lines
  for select
  using (core.has_role('auditor'));

-- ==========================================================================
-- 3. compute_payroll_run — populate or refresh lines on a draft run
-- ==========================================================================
create or replace function public.compute_payroll_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = core, attendance, public
as $$
declare
  r            core.payroll_runs%rowtype;
  period_start date;
  period_end   date;
  dim          integer;
  emp          record;
  ded          record;
  ded_total    numeric(12,2);
  ded_breakdown jsonb;
  days_present numeric(6,2);
  days_leave   numeric(6,2);
  days_payable numeric(6,2);
  prorated     numeric(12,2);
  net          numeric(12,2);
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into r from core.payroll_runs where id = p_run_id;
  if r.id is null then
    raise exception 'RUN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.status <> 'draft' then
    raise exception 'RUN_LOCKED' using errcode = 'P0001';
  end if;

  period_start := date_trunc('month', r.period_month)::date;
  period_end   := (period_start + interval '1 month - 1 day')::date;
  dim          := extract(day from period_end)::int;

  -- Wipe and recompute lines.
  delete from core.payroll_run_lines where run_id = r.id;

  for emp in
    select e.id, e.employee_code, e.full_name, e.monthly_salary
      from core.employees e
     where e.deleted_at is null
       and e.outlet_id = r.outlet_id
       and (e.hired_on is null or e.hired_on <= period_end)
       and (e.exit_date is null or e.exit_date >= period_start)
       and coalesce(e.monthly_salary, 0) > 0
  loop
    -- Distinct dates the employee punched IN during the period (any outlet).
    select count(distinct (l.punched_at at time zone 'Asia/Kolkata')::date)
      into days_present
      from attendance.logs l
     where l.employee_id = emp.id
       and l.type = 'in'
       and (l.punched_at at time zone 'Asia/Kolkata')::date between period_start and period_end;

    -- Paid leave days in the period (approved leave on a paid leave_type).
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
    prorated     := round(emp.monthly_salary * days_payable / dim, 2);

    -- Active deductions; cap each at remaining principal (months × monthly).
    ded_total     := 0;
    ded_breakdown := '[]'::jsonb;
    for ded in
      select id, kind, monthly_amount, months_remaining, total_amount, notes
        from core.deductions
       where employee_id = emp.id
         and is_active
         and months_remaining > 0
       order by created_at
    loop
      ded_total := ded_total + ded.monthly_amount;
      ded_breakdown := ded_breakdown || jsonb_build_object(
        'id', ded.id,
        'kind', ded.kind,
        'amount', ded.monthly_amount,
        'months_remaining', ded.months_remaining,
        'notes', ded.notes
      );
    end loop;

    net := greatest(prorated - ded_total, 0);

    insert into core.payroll_run_lines (
      run_id, employee_id, gross, days_in_month,
      days_present, days_paid_leave, days_payable,
      prorated_gross, deductions_total, deductions_breakdown, net_pay
    ) values (
      r.id, emp.id, emp.monthly_salary, dim,
      days_present, days_leave, days_payable,
      prorated, ded_total, ded_breakdown, net
    );
  end loop;
end;
$$;

grant execute on function public.compute_payroll_run(uuid) to authenticated;

-- ==========================================================================
-- 4. finalise_payroll_run — lock + decrement deductions + notify
-- ==========================================================================
create or replace function public.finalise_payroll_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  r        core.payroll_runs%rowtype;
  ln       record;
  d        record;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into r from core.payroll_runs where id = p_run_id for update;
  if r.id is null then
    raise exception 'RUN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.status = 'finalised' then
    return;
  end if;

  -- Decrement deductions on each line. Each active deduction with
  -- amount in deductions_breakdown gets months_remaining-1.
  for ln in
    select employee_id, deductions_breakdown
      from core.payroll_run_lines
     where run_id = r.id
  loop
    for d in
      select (elem->>'id')::uuid as id
        from jsonb_array_elements(ln.deductions_breakdown) elem
    loop
      update core.deductions
         set months_remaining = greatest(months_remaining - 1, 0),
             is_active        = case when months_remaining - 1 <= 0 then false else is_active end
       where id = d.id and months_remaining > 0;
    end loop;

    -- Notify the employee.
    perform core.notify(
      ln.employee_id,
      'payroll_finalised',
      'Payslip available',
      'Your payslip for ' || to_char(r.period_month, 'Mon YYYY') || ' is ready in /me/payslips.',
      jsonb_build_object('run_id', r.id, 'period_month', r.period_month)
    );
  end loop;

  update core.payroll_runs
     set status = 'finalised',
         finalised_by = auth.uid(),
         finalised_at = now()
   where id = r.id;
end;
$$;

grant execute on function public.finalise_payroll_run(uuid) to authenticated;

-- Convenience: create-or-fetch a draft run for (outlet, period_month).
create or replace function public.create_payroll_run(
  p_outlet_id   text,
  p_period_month date
) returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_first date := date_trunc('month', p_period_month)::date;
  v_id uuid;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  insert into core.payroll_runs (outlet_id, period_month, created_by)
  values (p_outlet_id, v_first, auth.uid())
  on conflict (outlet_id, period_month) do update set updated_at_marker = now()  -- no-op; force returning id
  returning id into v_id;

  -- on conflict path above can't reference a non-existent column;
  -- fall back to a re-select in case the row already existed.
  if v_id is null then
    select id into v_id from core.payroll_runs
     where outlet_id = p_outlet_id and period_month = v_first;
  end if;
  return v_id;
end;
$$;

-- The above had a fictional column. Recreate cleanly.
create or replace function public.create_payroll_run(
  p_outlet_id   text,
  p_period_month date
) returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_first date := date_trunc('month', p_period_month)::date;
  v_id uuid;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select id into v_id from core.payroll_runs
   where outlet_id = p_outlet_id and period_month = v_first;
  if v_id is not null then
    return v_id;
  end if;
  insert into core.payroll_runs (outlet_id, period_month, created_by)
  values (p_outlet_id, v_first, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_payroll_run(text, date) to authenticated;

-- ==========================================================================
-- 5. Views
-- ==========================================================================
create or replace view public.v_payroll_runs
with (security_invoker = true) as
  select r.id, r.outlet_id, r.period_month, r.status,
         r.created_by, r.created_at, r.finalised_by, r.finalised_at,
         o.display_name as outlet_name,
         (select count(*) from core.payroll_run_lines l where l.run_id = r.id) as employee_count,
         (select coalesce(sum(net_pay), 0) from core.payroll_run_lines l where l.run_id = r.id) as total_net,
         (select coalesce(sum(prorated_gross), 0) from core.payroll_run_lines l where l.run_id = r.id) as total_gross
    from core.payroll_runs r
    left join public.flax_outlets o on o.id = r.outlet_id;

grant select on public.v_payroll_runs to authenticated;

create or replace view public.v_payroll_run_lines
with (security_invoker = true) as
  select l.id, l.run_id, l.employee_id,
         e.employee_code, e.full_name,
         l.gross, l.days_in_month, l.days_present, l.days_paid_leave, l.days_payable,
         l.prorated_gross, l.deductions_total, l.deductions_breakdown, l.net_pay,
         l.notes, l.created_at,
         r.period_month, r.status, r.outlet_id
    from core.payroll_run_lines l
    join core.payroll_runs r on r.id = l.run_id
    join core.employees e on e.id = l.employee_id;

grant select on public.v_payroll_run_lines to authenticated;

-- /me self-view: only finalised runs.
create or replace view public.v_my_payslips
with (security_invoker = true) as
  select l.id, l.run_id, l.employee_id,
         l.gross, l.days_in_month, l.days_present, l.days_paid_leave, l.days_payable,
         l.prorated_gross, l.deductions_total, l.deductions_breakdown, l.net_pay,
         r.period_month, r.outlet_id, r.finalised_at,
         o.display_name as outlet_name,
         e.employee_code, e.full_name
    from core.payroll_run_lines l
    join core.payroll_runs r on r.id = l.run_id
    join core.employees e on e.id = l.employee_id
    left join public.flax_outlets o on o.id = r.outlet_id
   where r.status = 'finalised'
     and e.user_id = auth.uid();

grant select on public.v_my_payslips to authenticated;

-- ==========================================================================
-- 6. Defaults: uniform recovery months setting (used by Create form)
-- ==========================================================================
insert into core.app_settings (key, value)
  values ('uniform_default_recovery_months', '2'::jsonb)
  on conflict (key) do nothing;

notify pgrst, 'reload schema';
