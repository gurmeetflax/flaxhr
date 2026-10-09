-- Flax HR — one attendance row per employee per day
--
-- v_daily_attendance grouped punches by (employee, outlet, work_date), so
-- a day punched in at one outlet and out at another split into an
-- in-only row and an out-only row, both graded "absent" with no hours.
-- v_attendance_report then joined those rows to each other through its
-- roster/shift CTEs and returned them 4x. Reports, Overtime and the
-- auto-card scan all read through it.
--
-- Group by (employee, work_date) instead. The day's outlet is the outlet
-- of the first punch-in (else the first punch). Columns, names and types
-- are unchanged, so dependent views keep working.

create or replace view public.v_daily_attendance
with (security_invoker = true) as
with logs_with_day as (
  select l.employee_id,
         l.outlet_id,
         ((l.punched_at at time zone coalesce(o_1.timezone, 'Asia/Kolkata')) - interval '4 hours')::date as work_date,
         l.type,
         l.punched_at
    from attendance.logs l
    left join flax_outlets o_1 on o_1.id = l.outlet_id
), agg as (
  select employee_id,
         (array_agg(outlet_id order by (type <> 'in'), punched_at))[1] as outlet_id,
         work_date,
         min(case when type = 'in' then punched_at end) as first_in_at,
         max(case when type = 'out' then punched_at end) as last_out_at
    from logs_with_day
   group by employee_id, work_date
)
select e.id as employee_id,
       e.employee_code,
       e.full_name as employee_name,
       a.outlet_id,
       o.display_name as outlet_name,
       o.timezone as outlet_timezone,
       a.work_date,
       a.first_in_at,
       a.last_out_at,
       case
         when exists (
           select 1 from core.leave_requests lr
            where lr.employee_id = e.id and lr.status = 'approved'
              and a.work_date between lr.start_date and lr.end_date
         ) then 'on_leave'
         when a.first_in_at is not null and a.last_out_at is not null then 'present'
         else 'absent'
       end as status
  from agg a
  join core.employees e on e.id = a.employee_id
  left join flax_outlets o on o.id = a.outlet_id
 where e.deleted_at is null;
