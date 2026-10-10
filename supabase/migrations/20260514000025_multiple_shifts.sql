-- Flax HR — several shifts per employee
--
-- Staff rotate between shifts (morning one week, mid the next), so an
-- employee can now hold several shift assignments at once. The primary
-- key moves from (employee_id, effective_from) to
-- (employee_id, shift_id, effective_from).
--
-- Late / early is graded against one reference shift per day:
--   1. the day's roster entry, when there is one (unchanged), else
--   2. the assigned shift whose start is closest to the first punch-in
--      (earliest start when there is no punch).
-- v_attendance_report used to join every matching shift, which would
-- have duplicated the day once per assigned shift.

alter table core.employee_shifts drop constraint employee_shifts_pkey;
alter table core.employee_shifts add primary key (employee_id, shift_id, effective_from);

create or replace view public.v_attendance_report
with (security_invoker = true) as
with base as (
  select d_1.employee_id,
         d_1.work_date,
         d_1.outlet_id,
         d_1.outlet_name,
         coalesce(d_1.outlet_timezone, 'Asia/Kolkata') as tz,
         d_1.first_in_at,
         d_1.last_out_at,
         d_1.status as base_status
    from v_daily_attendance d_1
), sched as (
  select b_1.employee_id,
         b_1.work_date,
         r.starts_at as roster_start,
         r.ends_at as roster_end,
         r.shift_id as roster_shift_id
    from base b_1
    left join core.roster_entries r on r.employee_id = b_1.employee_id and r.work_date = b_1.work_date
), shift_pick as (
  select distinct on (b_1.employee_id, b_1.work_date)
         b_1.employee_id,
         b_1.work_date,
         s.start_time,
         s.end_time,
         s.grace_in_minutes,
         s.grace_out_minutes,
         s.outlet_id as shift_outlet_id
    from base b_1
    join core.employee_shifts es
      on es.employee_id = b_1.employee_id
     and es.effective_from <= b_1.work_date
     and (es.effective_to is null or es.effective_to >= b_1.work_date)
    join core.shifts s on s.id = es.shift_id and s.is_active
   where extract(dow from b_1.work_date)::integer = any (s.days_of_week)
   order by b_1.employee_id,
            b_1.work_date,
            abs(extract(epoch from (
              coalesce(b_1.first_in_at, ((b_1.work_date::text || ' ' || s.start_time::text)::timestamp at time zone b_1.tz))
              - ((b_1.work_date::text || ' ' || s.start_time::text)::timestamp at time zone b_1.tz)
            ))),
            s.start_time
)
select b.employee_id,
       e.employee_code,
       e.full_name as employee_name,
       d.name as designation_name,
       b.outlet_id,
       b.outlet_name,
       b.tz as outlet_timezone,
       b.work_date,
       b.first_in_at,
       b.last_out_at,
       coalesce(sc.roster_start,
         case when sp.start_time is not null
              then ((b.work_date::text || ' ' || sp.start_time::text)::timestamp at time zone b.tz)
         end) as scheduled_start_at,
       coalesce(sc.roster_end,
         case when sp.end_time is not null then
           case when sp.end_time < sp.start_time
                then (((b.work_date + 1)::text || ' ' || sp.end_time::text)::timestamp at time zone b.tz)
                else ((b.work_date::text || ' ' || sp.end_time::text)::timestamp at time zone b.tz)
           end
         end) as scheduled_end_at,
       coalesce(sp.grace_in_minutes, 0) as grace_in_minutes,
       case
         when b.first_in_at is null then null::integer
         when coalesce(sc.roster_start,
                case when sp.start_time is not null
                     then ((b.work_date::text || ' ' || sp.start_time::text)::timestamp at time zone b.tz)
                end) is null then null::integer
         else greatest(0, ((extract(epoch from (b.first_in_at - coalesce(sc.roster_start,
                ((b.work_date::text || ' ' || sp.start_time::text)::timestamp at time zone b.tz)))) / 60)
                - coalesce(sp.grace_in_minutes, 0))::integer)
       end as late_minutes,
       case
         when b.first_in_at is null or b.last_out_at is null then null::integer
         else (extract(epoch from (b.last_out_at - b.first_in_at)) / 60)::integer
       end as worked_minutes,
       case
         when b.base_status = 'on_leave' then 'on_leave'
         when b.base_status = 'absent' then 'absent'
         else
           case
             when b.first_in_at is null then 'absent'
             when (
               case
                 when b.first_in_at is null then null::integer
                 when coalesce(sc.roster_start,
                        case when sp.start_time is not null
                             then ((b.work_date::text || ' ' || sp.start_time::text)::timestamp at time zone b.tz)
                        end) is null then null::integer
                 else greatest(0, ((extract(epoch from (b.first_in_at - coalesce(sc.roster_start,
                        ((b.work_date::text || ' ' || sp.start_time::text)::timestamp at time zone b.tz)))) / 60)
                        - coalesce(sp.grace_in_minutes, 0))::integer)
               end > 0) then 'late'
             else 'present'
           end
       end as status
  from base b
  join core.employees e on e.id = b.employee_id
  left join core.designations d on d.code = e.designation_code
  left join sched sc on sc.employee_id = b.employee_id and sc.work_date = b.work_date
  left join shift_pick sp on sp.employee_id = b.employee_id and sp.work_date = b.work_date;

notify pgrst, 'reload schema';
