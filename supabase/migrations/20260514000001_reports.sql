-- Flax HR — Attendance report view
--
-- Aggregates everything the admin Reports page needs into one row per
-- (employee, work_date). Uses the outlet's timezone so late minutes are
-- computed against the local shift start.
--
-- Columns:
--   work_date              — date of the work day (4am-bucket, matches
--                            v_daily_attendance.work_date)
--   employee_id, employee_code, employee_name, designation_name
--   outlet_id, outlet_name, outlet_timezone
--   first_in_at, last_out_at            — timestamptz, formatted client-side
--   scheduled_start_at, scheduled_end_at — timestamptz projected from the
--                                           effective shift or roster entry
--   grace_in_minutes
--   late_minutes           — max(0, first_in_at - scheduled_start - grace)
--   worked_minutes         — last_out_at - first_in_at, when both exist
--   status                 — on_leave | absent | late | present
--
-- Scheduled shift resolution priority:
--   1. roster_entries.starts_at/ends_at (if the roster entry has explicit times)
--   2. Effective employee_shifts row whose shift.days_of_week contains
--      extract(dow from work_date)
--   3. NULL — no scheduled time; late_minutes = NULL

-- Extend v_employees to expose designation_name (it was dropped by a later
-- migration that recreated the view without the join).
drop view if exists public.v_employees;
create view public.v_employees with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id,
         e.first_name, e.last_name, e.full_name,
         e.personal_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         e.monthly_salary, e.exit_date, e.exit_reason,
         e.designation_code,
         d.name as designation_name,
         e.date_of_birth, e.address,
         e.emergency_contact_name, e.emergency_contact_phone,
         e.home_lat, e.home_lng,
         e.aadhaar_last4, e.pan_last4,
         e.kyc_status, e.kyc_verified_at, e.kyc_verified_by, e.kyc_notes,
         e.selfie_required,
         o.display_name as outlet_name,
         o.city as outlet_city
    from core.employees e
    left join public.flax_outlets o on o.id = e.outlet_id
    left join core.designations d on d.code = e.designation_code
   where e.deleted_at is null;
grant select on public.v_employees to authenticated;

----------------------------------------------------------------------------
-- Attendance report: one row per (employee, work_date)
----------------------------------------------------------------------------
drop view if exists public.v_attendance_report;
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
  -- Prefer roster_entries when they exist for that day.
  select
    b.employee_id, b.work_date,
    r.starts_at as roster_start,
    r.ends_at   as roster_end,
    r.shift_id  as roster_shift_id
  from base b
  left join core.roster_entries r
    on r.employee_id = b.employee_id
   and r.work_date   = b.work_date
),
shift_pick as (
  -- Fall back to the effective employee_shift for that day (matching dow).
  select
    b.employee_id, b.work_date,
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
  -- Scheduled start / end in the outlet's local timezone
  coalesce(
    sc.roster_start,
    case
      when sp.start_time is not null
      then ((b.work_date::text || ' ' || sp.start_time::text)::timestamp
              at time zone b.tz)
    end
  ) as scheduled_start_at,
  coalesce(
    sc.roster_end,
    case
      when sp.end_time is not null then (
        case
          -- Overnight shift (end < start) → end lands next day
          when sp.end_time < sp.start_time
          then (((b.work_date + 1)::text || ' ' || sp.end_time::text)::timestamp
                  at time zone b.tz)
          else ((b.work_date::text || ' ' || sp.end_time::text)::timestamp
                  at time zone b.tz)
        end
      )
    end
  ) as scheduled_end_at,
  coalesce(sp.grace_in_minutes, 0) as grace_in_minutes,
  -- Late minutes: only when both an in-time and a schedule are known.
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
    else case
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
    end
  end as status
from base b
join core.employees e on e.id = b.employee_id
left join core.designations d on d.code = e.designation_code
left join sched sc on sc.employee_id = b.employee_id and sc.work_date = b.work_date
left join shift_pick sp on sp.employee_id = b.employee_id and sp.work_date = b.work_date;

grant select on public.v_attendance_report to authenticated;

----------------------------------------------------------------------------
-- Employee leave summary — used vs pending
----------------------------------------------------------------------------
drop view if exists public.v_employee_leave_summary;
create view public.v_employee_leave_summary
with (security_invoker = true) as
select
  e.id as employee_id,
  e.employee_code,
  e.full_name as employee_name,
  coalesce(sum(case when lr.status = 'pending'  then lr.days end), 0)::numeric(6,2) as leaves_pending,
  coalesce(sum(case when lr.status = 'approved' then lr.days end), 0)::numeric(6,2) as leaves_used
from core.employees e
left join core.leave_requests lr on lr.employee_id = e.id
where e.deleted_at is null
group by e.id, e.employee_code, e.full_name;

grant select on public.v_employee_leave_summary to authenticated;

notify pgrst, 'reload schema';
