-- Flax HR — Detailed attendance report view
--
-- Adds v_attendance_report_detailed which powers the new "Detailed"
-- tab on /admin/reports. Columns match the format requested by HR:
--   Date · Status · Punch in · Punch out · Hours worked · Late arrival
--   · Early departure · Overtime · Shift start · Shift end
--   · Punch in location · Punch out location
--
-- Built as a separate view so we don't disturb the existing
-- v_attendance_report / v_daily_attendance dependency chain.

drop view if exists public.v_attendance_report_detailed;

create view public.v_attendance_report_detailed
with (security_invoker = true) as
with logs_with_day as (
  select
    l.id,
    l.employee_id,
    l.outlet_id,
    l.lat,
    l.lng,
    (l.punched_at at time zone coalesce(o.timezone, 'Asia/Kolkata')
       - interval '4 hours')::date as work_date,
    l.type,
    l.punched_at
  from attendance.logs l
  left join public.flax_outlets o on o.id = l.outlet_id
),
first_in as (
  select distinct on (employee_id, work_date)
    employee_id, work_date, outlet_id, punched_at, lat, lng
  from logs_with_day
  where type = 'in'
  order by employee_id, work_date, punched_at asc
),
last_out as (
  select distinct on (employee_id, work_date)
    employee_id, work_date, outlet_id, punched_at, lat, lng
  from logs_with_day
  where type = 'out'
  order by employee_id, work_date, punched_at desc
)
select
  r.employee_id,
  r.employee_code,
  r.employee_name,
  r.designation_name,
  r.outlet_id,
  r.outlet_name,
  r.outlet_timezone,
  r.work_date,
  r.first_in_at,
  r.last_out_at,
  r.scheduled_start_at,
  r.scheduled_end_at,
  r.late_minutes,
  r.worked_minutes,
  r.status,
  -- Early departure = minutes before scheduled end (0 if left after end)
  case
    when r.last_out_at is null or r.scheduled_end_at is null then null
    when r.last_out_at >= r.scheduled_end_at then 0
    else greatest(0, (extract(epoch from (r.scheduled_end_at - r.last_out_at)) / 60)::int)
  end as early_departure_minutes,
  -- Overtime uses same rule as v_overtime_daily: worked beyond
  -- (regular + grace) * 60 minutes. Kept inline so this view has no
  -- dependency on v_overtime_daily.
  case
    when r.worked_minutes is null then null
    else greatest(0, r.worked_minutes - 600)
  end as overtime_minutes,
  fi.outlet_id                            as first_in_outlet_id,
  fi_o.display_name                       as first_in_outlet_name,
  fi.lat                                  as first_in_lat,
  fi.lng                                  as first_in_lng,
  lo.outlet_id                            as last_out_outlet_id,
  lo_o.display_name                       as last_out_outlet_name,
  lo.lat                                  as last_out_lat,
  lo.lng                                  as last_out_lng
from public.v_attendance_report r
left join first_in fi
  on fi.employee_id = r.employee_id and fi.work_date = r.work_date
left join last_out lo
  on lo.employee_id = r.employee_id and lo.work_date = r.work_date
left join public.flax_outlets fi_o on fi_o.id = fi.outlet_id
left join public.flax_outlets lo_o on lo_o.id = lo.outlet_id;

grant select on public.v_attendance_report_detailed to authenticated;

notify pgrst, 'reload schema';
