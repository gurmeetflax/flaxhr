-- Flax HR — Overtime calculation for payroll
--
-- Rules (all editable via core.app_settings.overtime_settings):
--   * Regular shift    = 9 hours
--   * Grace            = 1 hour
--   * OT trigger       = worked_minutes > (regular + grace) * 60 = 600 min
--   * OT minutes       = worked_minutes - (regular + grace) * 60
--   * Hourly rate      = monthly_salary / (working_days_per_month * regular_hours)
--                       default 26 * 9 = 234 hours / month
--   * OT amount        = ot_hours * hourly_rate * ot_multiplier
--
-- Reads worked_minutes from public.v_attendance_report which already
-- computes `last_out_at - first_in_at` per work day (Asia/Kolkata 4am
-- bucket). Employees who moved between outlets in one day get counted
-- once — v_attendance_report reconciles cross-outlet in/out.

-- 1. Settings — HR editable via /admin/settings later or SQL editor.
insert into core.app_settings (key, value)
values (
  'overtime_settings',
  jsonb_build_object(
    'regular_hours', 9,
    'grace_hours',   1,
    'working_days_per_month', 26,
    'ot_multiplier', 1.0
  )
)
on conflict (key) do nothing;

-- 2. Hourly-rate helper (uses the employee's monthly_salary column)
create or replace function core.employee_hourly_rate(p_monthly_salary numeric)
returns numeric
language sql
stable
set search_path = core, public
as $$
  with cfg as (
    select coalesce(core.get_app_setting('overtime_settings'), '{}'::jsonb) as v
  ),
  s as (
    select
      coalesce((v->>'regular_hours')::numeric, 9)             as reg_h,
      coalesce((v->>'working_days_per_month')::numeric, 26)   as wd
    from cfg
  )
  select case
    when p_monthly_salary is null or p_monthly_salary <= 0 then 0::numeric
    else round(p_monthly_salary::numeric / (s.wd * s.reg_h), 2)
  end
  from s;
$$;
grant execute on function core.employee_hourly_rate(numeric) to authenticated;

-- 3. Per-day overtime view
drop view if exists public.v_overtime_daily;
create view public.v_overtime_daily
with (security_invoker = true) as
with cfg as (
  select coalesce(core.get_app_setting('overtime_settings'), '{}'::jsonb) as v
),
params as (
  select
    coalesce((v->>'regular_hours')::numeric, 9)           as reg_h,
    coalesce((v->>'grace_hours')::numeric,   1)           as grace_h,
    coalesce((v->>'working_days_per_month')::numeric, 26) as wd,
    coalesce((v->>'ot_multiplier')::numeric, 1.0)         as mult
  from cfg
)
select
  r.employee_id,
  r.employee_code,
  r.employee_name,
  r.outlet_id,
  r.outlet_name,
  r.work_date,
  coalesce(r.worked_minutes, 0)::int                       as worked_minutes,
  round(coalesce(r.worked_minutes, 0) / 60.0, 2)           as worked_hours,
  greatest(
    0,
    coalesce(r.worked_minutes, 0) - ((p.reg_h + p.grace_h) * 60)::int
  )::int                                                    as ot_minutes,
  round(
    greatest(0, coalesce(r.worked_minutes, 0) - (p.reg_h + p.grace_h) * 60) / 60.0,
    2
  )                                                         as ot_hours,
  e.monthly_salary,
  core.employee_hourly_rate(e.monthly_salary)               as hourly_rate,
  round(
    greatest(0, coalesce(r.worked_minutes, 0) - (p.reg_h + p.grace_h) * 60) / 60.0
      * core.employee_hourly_rate(e.monthly_salary)
      * p.mult,
    2
  )                                                         as ot_amount
from public.v_attendance_report r
join core.employees e on e.id = r.employee_id
cross join params p
where r.worked_minutes is not null;

grant select on public.v_overtime_daily to authenticated;

-- 4. Per-month overtime view (rollup)
drop view if exists public.v_overtime_monthly;
create view public.v_overtime_monthly
with (security_invoker = true) as
  select
    employee_id,
    max(employee_code)                                   as employee_code,
    max(employee_name)                                   as employee_name,
    max(outlet_id)                                       as outlet_id,
    max(outlet_name)                                     as outlet_name,
    date_trunc('month', work_date)::date                 as period_month,
    sum(worked_minutes)                                  as worked_minutes_total,
    round(sum(worked_minutes) / 60.0, 2)                 as worked_hours_total,
    sum(ot_minutes)                                      as ot_minutes_total,
    round(sum(ot_minutes) / 60.0, 2)                     as ot_hours_total,
    count(*) filter (where ot_minutes > 0)               as ot_days,
    max(hourly_rate)                                     as hourly_rate,
    round(sum(ot_amount), 2)                             as ot_amount_total
  from public.v_overtime_daily
  group by employee_id, date_trunc('month', work_date);

grant select on public.v_overtime_monthly to authenticated;

-- 5. Self-service: my monthly OT (scoped to auth.uid())
drop view if exists public.v_my_overtime_monthly;
create view public.v_my_overtime_monthly
with (security_invoker = true) as
  select m.*
  from public.v_overtime_monthly m
  where m.employee_id in (select id from core.employees where user_id = auth.uid());

grant select on public.v_my_overtime_monthly to authenticated;

-- Self-service daily too (drill-down)
drop view if exists public.v_my_overtime_daily;
create view public.v_my_overtime_daily
with (security_invoker = true) as
  select d.*
  from public.v_overtime_daily d
  where d.employee_id in (select id from core.employees where user_id = auth.uid());

grant select on public.v_my_overtime_daily to authenticated;

notify pgrst, 'reload schema';
