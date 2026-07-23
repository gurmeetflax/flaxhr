-- Flax HR — Reports: dedupe rows + cross-outlet in/out reconciliation
--
-- Bug 1 — duplicate rows per employee per day
--   v_attendance_report.shift_pick joined core.employee_shifts without
--   deduping. An employee with two active employee_shifts rows (e.g. an
--   old assignment that was never given an effective_to, plus a newer
--   one) got doubled in the final SELECT.
--
-- Bug 2 — employee marked "absent" when they moved between outlets in
--   the same day. v_daily_attendance grouped by (employee, outlet,
--   work_date), so a 10:04 AM in at Central Kitchen and a 7:32 PM out
--   at Lower Parel produced two disjoint rows, each with only one side,
--   both classified 'absent'.
--
-- Fix
-- ----
-- 1. v_daily_attendance now groups by (employee, work_date) only. The
--    outlet_id shown is whichever outlet the first-in of the day
--    happened at; outlet_name / timezone follow. first_in_at is the
--    earliest 'in' punch of the work day, last_out_at is the latest
--    'out' — regardless of which outlet each was at.
--
-- 2. v_attendance_report.shift_pick uses DISTINCT ON (employee_id,
--    work_date) with `order by … es.effective_from desc` so we take the
--    most-recent applicable shift and never multiply the base rows.

----------------------------------------------------------------------------
-- v_daily_attendance: one row per (employee, work_date)
----------------------------------------------------------------------------
drop view if exists public.v_attendance_report;    -- depends on v_daily
drop view if exists public.v_daily_attendance;

create view public.v_daily_attendance
with (security_invoker = true) as
with logs_with_day as (
  select
    l.employee_id,
    l.outlet_id,
    -- 4am work-day bucket in the outlet's own timezone
    (l.punched_at at time zone coalesce(o.timezone, 'Asia/Kolkata')
       - interval '4 hours')::date as work_date,
    l.type,
    l.punched_at
  from attendance.logs l
  left join public.flax_outlets o on o.id = l.outlet_id
),
first_in as (
  select distinct on (employee_id, work_date)
    employee_id, work_date, outlet_id as first_in_outlet, punched_at as first_in_at
  from logs_with_day
  where type = 'in'
  order by employee_id, work_date, punched_at asc
),
last_out as (
  select distinct on (employee_id, work_date)
    employee_id, work_date, punched_at as last_out_at
  from logs_with_day
  where type = 'out'
  order by employee_id, work_date, punched_at desc
),
days as (
  select distinct employee_id, work_date from logs_with_day
)
select
  e.id           as employee_id,
  e.employee_code,
  e.full_name    as employee_name,
  fi.first_in_outlet as outlet_id,
  o.display_name as outlet_name,
  o.timezone     as outlet_timezone,
  d.work_date,
  fi.first_in_at,
  lo.last_out_at,
  case
    when exists (
      select 1 from core.leave_requests lr
      where lr.employee_id = e.id
        and lr.status = 'approved'
        and d.work_date between lr.start_date and lr.end_date
    ) then 'on_leave'
    when fi.first_in_at is not null and lo.last_out_at is not null then 'present'
    else 'absent'
  end as status
from days d
join core.employees e on e.id = d.employee_id
left join first_in fi on fi.employee_id = d.employee_id and fi.work_date = d.work_date
left join last_out lo on lo.employee_id = d.employee_id and lo.work_date = d.work_date
left join public.flax_outlets o on o.id = fi.first_in_outlet
where e.deleted_at is null;

grant select on public.v_daily_attendance to authenticated;

----------------------------------------------------------------------------
-- v_attendance_report: dedupe the shift join
----------------------------------------------------------------------------
create view public.v_attendance_report
with (security_invoker = true) as
with base as (
  select
    d.employee_id,
    d.work_date,
    d.outlet_id,
    d.outlet_name,
    coalesce(d.outlet_timezone, 'Asia/Kolkata') as tz,
    d.first_in_at,
    d.last_out_at,
    d.status as base_status
  from public.v_daily_attendance d
),
sched as (
  select
    b.employee_id, b.work_date,
    r.starts_at  as roster_start,
    r.ends_at    as roster_end,
    r.shift_id   as roster_shift_id
  from base b
  left join core.roster_entries r
    on r.employee_id = b.employee_id
   and r.work_date   = b.work_date
),
shift_pick as (
  -- Take the most-recently effective shift for each (employee, work_date).
  select distinct on (es.employee_id, b.work_date)
    b.employee_id,
    b.work_date,
    s.start_time,
    s.end_time,
    s.grace_in_minutes,
    s.grace_out_minutes,
    s.outlet_id as shift_outlet_id
  from base b
  join core.employee_shifts es
    on es.employee_id = b.employee_id
   and es.effective_from <= b.work_date
   and (es.effective_to is null or es.effective_to >= b.work_date)
  join core.shifts s on s.id = es.shift_id and s.is_active
  where extract(dow from b.work_date)::int = any (s.days_of_week)
  order by es.employee_id, b.work_date, es.effective_from desc
)
select
  b.employee_id,
  e.employee_code,
  e.full_name         as employee_name,
  d.name              as designation_name,
  b.outlet_id,
  b.outlet_name,
  b.tz                as outlet_timezone,
  b.work_date,
  b.first_in_at,
  b.last_out_at,
  coalesce(
    sc.roster_start,
    case when sp.start_time is not null
      then ((b.work_date::text || ' ' || sp.start_time::text)::timestamp
              at time zone b.tz)
    end
  ) as scheduled_start_at,
  coalesce(
    sc.roster_end,
    case when sp.end_time is not null then (
      case
        when sp.end_time < sp.start_time
        then (((b.work_date + 1)::text || ' ' || sp.end_time::text)::timestamp
                at time zone b.tz)
        else ((b.work_date::text || ' ' || sp.end_time::text)::timestamp
                at time zone b.tz)
      end
    ) end
  ) as scheduled_end_at,
  coalesce(sp.grace_in_minutes, 0) as grace_in_minutes,
  case
    when b.first_in_at is null then null
    when coalesce(
      sc.roster_start,
      case when sp.start_time is not null
        then ((b.work_date::text || ' ' || sp.start_time::text)::timestamp
                at time zone b.tz)
      end
    ) is null then null
    else greatest(
      0,
      (extract(epoch from (
        b.first_in_at -
        coalesce(
          sc.roster_start,
          ((b.work_date::text || ' ' || sp.start_time::text)::timestamp
             at time zone b.tz)
        )
      )) / 60 - coalesce(sp.grace_in_minutes, 0))::int
    )
  end as late_minutes,
  case
    when b.first_in_at is null or b.last_out_at is null then null
    else (extract(epoch from (b.last_out_at - b.first_in_at)) / 60)::int
  end as worked_minutes,
  case
    when b.base_status = 'on_leave' then 'on_leave'
    when b.base_status = 'absent'   then 'absent'
    when b.first_in_at is null then 'absent'
    when (
      case
        when b.first_in_at is null then null
        when coalesce(
          sc.roster_start,
          case when sp.start_time is not null
            then ((b.work_date::text || ' ' || sp.start_time::text)::timestamp
                    at time zone b.tz)
          end
        ) is null then null
        else greatest(
          0,
          (extract(epoch from (
            b.first_in_at -
            coalesce(
              sc.roster_start,
              ((b.work_date::text || ' ' || sp.start_time::text)::timestamp
                 at time zone b.tz)
            )
          )) / 60 - coalesce(sp.grace_in_minutes, 0))::int
        )
      end
    ) > 0 then 'late'
    else 'present'
  end as status
from base b
join core.employees e on e.id = b.employee_id
left join core.designations d on d.code = e.designation_code
left join sched sc on sc.employee_id = b.employee_id and sc.work_date = b.work_date
left join shift_pick sp on sp.employee_id = b.employee_id and sp.work_date = b.work_date;

grant select on public.v_attendance_report to authenticated;

notify pgrst, 'reload schema';
