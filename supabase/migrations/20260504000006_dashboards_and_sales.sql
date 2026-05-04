-- Flax HR — Migration 022: Dashboards + sales input
--
-- Adds the minimum data model required by the new admin/employee dashboards:
--   1. core.employees: monthly_salary, exit_date, exit_reason (+ trigger to
--      auto-deactivate on exit_date set).
--   2. core.outlet_monthly_sales: per-outlet, per-month revenue input.
--   3. public.v_outlet_monthly_sales (security_invoker view).
--   4. public.upsert_outlet_sales(p_outlet_id, p_period_month, p_amount) RPC.
--   5. public.admin_dashboard_summary(p_period_month, p_outlet_id) RPC —
--      headcount, attrition_pct, manpower_cost, sales, manpower_cost_pct,
--      and today's present/late/absent/on-leave counts. security definer,
--      gated on admin/hr/manager.
--   6. public.roster_vs_attendance(p_date, p_outlet_id) RPC — per-employee
--      roster vs first in-punch with on_time/late/missed flags.
--   7. public.v_my_dashboard_summary view — current user's month present/
--      absent/late counts, total leave balance, today shift, last punch,
--      next rostered date.

-- ==========================================================================
-- 1. core.employees: compensation + exit fields
-- ==========================================================================
alter table core.employees
  add column if not exists monthly_salary numeric(12,2),
  add column if not exists exit_date      date,
  add column if not exists exit_reason    text;

create index if not exists employees_exit_date_idx
  on core.employees (exit_date)
  where exit_date is not null;

-- Setting exit_date implies the employee is no longer active.
create or replace function core.apply_exit_date()
returns trigger
language plpgsql
as $$
begin
  if new.exit_date is not null and (old.exit_date is null or new.exit_date <> old.exit_date) then
    new.is_active := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_exit on core.employees;
create trigger trg_employees_exit
  before update of exit_date on core.employees
  for each row execute function core.apply_exit_date();

-- ==========================================================================
-- 2. core.outlet_monthly_sales
-- ==========================================================================
create table if not exists core.outlet_monthly_sales (
  outlet_id     text not null references public.flax_outlets(id) on delete cascade,
  period_month  date not null,
  amount        numeric(14,2) not null check (amount >= 0),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (outlet_id, period_month),
  check (period_month = date_trunc('month', period_month)::date)
);

create index if not exists outlet_monthly_sales_period_idx
  on core.outlet_monthly_sales (period_month);

drop trigger if exists trg_oms_touch on core.outlet_monthly_sales;
create trigger trg_oms_touch
  before update on core.outlet_monthly_sales
  for each row execute function core.set_updated_at();

drop trigger if exists trg_oms_audit on core.outlet_monthly_sales;
create trigger trg_oms_audit
  after insert or update or delete on core.outlet_monthly_sales
  for each row execute function core.log_audit();

alter table core.outlet_monthly_sales enable row level security;

drop policy if exists oms_admin_hr on core.outlet_monthly_sales;
create policy oms_admin_hr on core.outlet_monthly_sales for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists oms_manager on core.outlet_monthly_sales;
create policy oms_manager on core.outlet_monthly_sales for select
  using (core.has_role('manager') and core.has_outlet_access(outlet_id));

create or replace view public.v_outlet_monthly_sales
with (security_invoker = true) as
  select s.outlet_id, s.period_month, s.amount, s.updated_at,
         o.display_name as outlet_name
  from core.outlet_monthly_sales s
  left join public.flax_outlets o on o.id = s.outlet_id
  order by s.period_month desc, o.display_name;

grant select on public.v_outlet_monthly_sales to authenticated;

-- RPC: upsert sales for an outlet/month. Only admin/hr.
create or replace function public.upsert_outlet_sales(
  p_outlet_id    text,
  p_period_month date,
  p_amount       numeric
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  insert into core.outlet_monthly_sales (outlet_id, period_month, amount, created_by)
    values (p_outlet_id, date_trunc('month', p_period_month)::date, p_amount, auth.uid())
    on conflict (outlet_id, period_month) do update
      set amount = excluded.amount, updated_at = now();
end;
$$;

grant execute on function public.upsert_outlet_sales(text, date, numeric) to authenticated;

-- ==========================================================================
-- 3. Admin dashboard summary
-- ==========================================================================
create or replace function public.admin_dashboard_summary(
  p_period_month date default current_date,
  p_outlet_id    text default null
) returns table (
  period_month       date,
  outlet_id          text,
  headcount          int,
  joiners            int,
  leavers            int,
  attrition_pct      numeric,
  manpower_cost      numeric,
  sales              numeric,
  manpower_cost_pct  numeric,
  present_today      int,
  late_today         int,
  absent_today       int,
  on_leave_today     int
)
language plpgsql
security definer
set search_path = core, attendance, public
as $$
declare
  period_start date := date_trunc('month', p_period_month)::date;
  period_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  hc_start     int;
  hc_end       int;
  hc_avg       numeric;
  total_sales  numeric;
  cost         numeric;
  joined       int;
  left_count   int;
  pres_today   int;
  late_count   int;
  rostered_today int;
  on_leave     int;
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- Headcount snapshots (active and not exited).
  select count(*) into hc_start from core.employees e
   where e.deleted_at is null
     and (e.hired_on is null or e.hired_on <= period_start)
     and (e.exit_date is null or e.exit_date >= period_start)
     and (p_outlet_id is null or e.outlet_id = p_outlet_id);

  select count(*) into hc_end from core.employees e
   where e.deleted_at is null
     and (e.hired_on is null or e.hired_on <= period_end)
     and (e.exit_date is null or e.exit_date >= period_end)
     and (p_outlet_id is null or e.outlet_id = p_outlet_id);

  hc_avg := nullif((hc_start + hc_end)::numeric / 2.0, 0);

  select count(*) into joined from core.employees e
   where e.deleted_at is null
     and e.hired_on between period_start and period_end
     and (p_outlet_id is null or e.outlet_id = p_outlet_id);

  select count(*) into left_count from core.employees e
   where e.deleted_at is null
     and e.exit_date between period_start and period_end
     and (p_outlet_id is null or e.outlet_id = p_outlet_id);

  -- Manpower cost = sum(monthly_salary) for employees active any day in period.
  select coalesce(sum(e.monthly_salary), 0) into cost from core.employees e
   where e.deleted_at is null
     and e.monthly_salary is not null
     and (e.hired_on is null or e.hired_on <= period_end)
     and (e.exit_date is null or e.exit_date >= period_start)
     and (p_outlet_id is null or e.outlet_id = p_outlet_id);

  select coalesce(sum(s.amount), 0) into total_sales
    from core.outlet_monthly_sales s
   where s.period_month = period_start
     and (p_outlet_id is null or s.outlet_id = p_outlet_id);

  -- Today's signals (timezone-naive — Asia/Kolkata is the operational TZ).
  select count(distinct l.employee_id) into pres_today
    from attendance.logs l
    join core.employees e on e.id = l.employee_id
   where l.type = 'in'
     and l.punched_at::date = current_date
     and (p_outlet_id is null or e.outlet_id = p_outlet_id);

  select count(*) into rostered_today
    from core.roster_entries r
    join core.employees e on e.id = r.employee_id
   where r.work_date = current_date
     and r.status = 'published'
     and (p_outlet_id is null or e.outlet_id = p_outlet_id);

  -- Late = first in-punch later than scheduled start + grace.
  select count(*) into late_count from (
    select distinct on (l.employee_id) l.employee_id, l.punched_at, s.start_time, s.grace_in_minutes, e.outlet_id
      from attendance.logs l
      join core.employees e on e.id = l.employee_id
      left join core.roster_entries r on r.employee_id = l.employee_id and r.work_date = current_date
      left join core.shifts s on s.id = r.shift_id
     where l.type = 'in' and l.punched_at::date = current_date
     order by l.employee_id, l.punched_at asc
  ) firsts
  where firsts.start_time is not null
    and firsts.punched_at::time > (firsts.start_time + (firsts.grace_in_minutes || ' minutes')::interval)
    and (p_outlet_id is null or firsts.outlet_id = p_outlet_id);

  -- On leave today = approved leave covering today.
  select count(distinct lr.employee_id) into on_leave
    from core.leave_requests lr
    join core.employees e on e.id = lr.employee_id
   where lr.status = 'approved'
     and current_date between lr.start_date and lr.end_date
     and (p_outlet_id is null or e.outlet_id = p_outlet_id);

  return query select
    period_start,
    p_outlet_id,
    coalesce(hc_end, 0),
    coalesce(joined, 0),
    coalesce(left_count, 0),
    case when hc_avg is null or hc_avg = 0 then 0 else round((left_count::numeric / hc_avg) * 100, 2) end,
    cost,
    total_sales,
    case when total_sales is null or total_sales = 0 then null else round((cost / total_sales) * 100, 2) end,
    coalesce(pres_today, 0),
    coalesce(late_count, 0),
    greatest(coalesce(rostered_today, 0) - coalesce(pres_today, 0) - coalesce(on_leave, 0), 0),
    coalesce(on_leave, 0);
end;
$$;

grant execute on function public.admin_dashboard_summary(date, text) to authenticated;

-- ==========================================================================
-- 4. Roster vs attendance (today/any-date)
-- ==========================================================================
create or replace function public.roster_vs_attendance(
  p_date      date default current_date,
  p_outlet_id text default null
) returns table (
  employee_id     uuid,
  employee_code   text,
  employee_name   text,
  outlet_id       text,
  outlet_name     text,
  shift_name      text,
  planned_start   time,
  planned_end     time,
  grace_minutes   int,
  actual_in       timestamptz,
  delta_minutes   int,
  flag            text
)
language plpgsql
security definer
set search_path = core, attendance, public
as $$
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return query
  with first_punch as (
    select distinct on (l.employee_id) l.employee_id, l.punched_at
      from attendance.logs l
     where l.type = 'in' and l.punched_at::date = p_date
     order by l.employee_id, l.punched_at asc
  )
  select
    e.id,
    e.employee_code,
    e.full_name,
    r.outlet_id,
    o.display_name,
    s.name,
    s.start_time,
    s.end_time,
    coalesce(s.grace_in_minutes, 0),
    fp.punched_at,
    case when fp.punched_at is null or s.start_time is null then null
         else extract(epoch from (fp.punched_at::time - s.start_time)) / 60 end::int,
    case
      when fp.punched_at is null then 'missed'
      when s.start_time is null then 'on_time'
      when fp.punched_at::time <= (s.start_time + (coalesce(s.grace_in_minutes,0) || ' minutes')::interval) then 'on_time'
      else 'late'
    end
  from core.roster_entries r
  join core.employees e on e.id = r.employee_id
  left join core.shifts s on s.id = r.shift_id
  left join public.flax_outlets o on o.id = r.outlet_id
  left join first_punch fp on fp.employee_id = r.employee_id
  where r.work_date = p_date
    and r.status = 'published'
    and (p_outlet_id is null or r.outlet_id = p_outlet_id)
  order by o.display_name nulls last, s.start_time nulls last, e.full_name;
end;
$$;

grant execute on function public.roster_vs_attendance(date, text) to authenticated;

-- ==========================================================================
-- 5. v_my_dashboard_summary
-- ==========================================================================
create or replace view public.v_my_dashboard_summary
with (security_invoker = true) as
  with me as (
    select id from core.employees where user_id = auth.uid() and deleted_at is null limit 1
  ),
  month_punches as (
    select distinct l.punched_at::date as d, l.punched_at, l.type
      from attendance.logs l, me
     where l.employee_id = me.id
       and l.punched_at >= date_trunc('month', current_date)
       and l.punched_at <  date_trunc('month', current_date) + interval '1 month'
  ),
  present as (
    select count(distinct d) as c from month_punches where type = 'in'
  ),
  first_in_per_day as (
    select d, min(punched_at) as first_in from month_punches where type = 'in' group by d
  ),
  late as (
    select count(*) as c
      from first_in_per_day fp
      left join core.roster_entries r
        on r.employee_id = (select id from me)
       and r.work_date = fp.d
      left join core.shifts s on s.id = r.shift_id
     where s.start_time is not null
       and fp.first_in::time > (s.start_time + (coalesce(s.grace_in_minutes,0) || ' minutes')::interval)
  ),
  rostered as (
    select count(*) as c from core.roster_entries r
     where r.employee_id = (select id from me)
       and r.work_date >= date_trunc('month', current_date)::date
       and r.work_date <= least(current_date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date)
       and r.status = 'published'
  ),
  bal as (
    select coalesce(sum(coalesce(lb.balance,0)),0) as total
      from core.leave_types lt
      left join core.leave_balances lb
             on lb.leave_type_id = lt.id
            and lb.employee_id = (select id from me)
     where lt.is_active and lt.is_paid
  ),
  shift_today as (
    select s.start_time, s.end_time
      from core.employee_shifts es
      join core.shifts s on s.id = es.shift_id
     where es.employee_id = (select id from me)
       and es.effective_from <= current_date
       and (es.effective_to is null or es.effective_to >= current_date)
       and s.is_active
       and extract(dow from current_date)::int = any(s.days_of_week)
     order by es.effective_from desc
     limit 1
  ),
  last_punch as (
    select l.punched_at, l.type
      from attendance.logs l
     where l.employee_id = (select id from me)
     order by l.punched_at desc
     limit 1
  ),
  next_roster as (
    select r.work_date, r.starts_at, s.start_time, s.name as shift_name
      from core.roster_entries r
      left join core.shifts s on s.id = r.shift_id
     where r.employee_id = (select id from me)
       and r.status = 'published'
       and r.work_date > current_date
     order by r.work_date asc
     limit 1
  )
  select
    (select id from me)                              as employee_id,
    (select c from present)::int                     as month_present_days,
    greatest((select c from rostered)::int - (select c from present)::int, 0)::int as month_absent_days,
    (select c from late)::int                        as month_late_days,
    (select total from bal)::numeric                 as paid_leave_balance_total,
    (select start_time from shift_today)             as today_shift_start,
    (select end_time from shift_today)               as today_shift_end,
    (select punched_at from last_punch)              as last_punch_at,
    (select type from last_punch)                    as last_punch_type,
    (select work_date from next_roster)              as next_roster_date,
    (select start_time from next_roster)             as next_roster_start,
    (select shift_name from next_roster)             as next_roster_shift_name;

grant select on public.v_my_dashboard_summary to authenticated;

-- ==========================================================================
-- 6. Refresh v_employees to expose new compensation + exit columns.
-- (Drop+recreate because CREATE OR REPLACE VIEW cannot reorder/insert
-- columns in the middle of the existing column list.)
-- ==========================================================================
drop view if exists public.v_employees;
create view public.v_employees
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id, e.full_name,
         e.work_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         e.monthly_salary, e.exit_date, e.exit_reason,
         o.display_name as outlet_name,
         o.city as outlet_city
  from core.employees e
  left join public.flax_outlets o on o.id = e.outlet_id
  where e.deleted_at is null;

grant select on public.v_employees to authenticated;
