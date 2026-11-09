-- Week offs: one per calendar week (Monday to Sunday), at most 4 a month.
--
-- The monthly pool (4 week offs on any no-punch days) let a long absence
-- soak up all four: Mayur Parab, away 12-22 Oct, got week offs on
-- 12, 13, 14 and 16 Oct. Now each week gets at most one week off, on the
-- rostered off day if there is one, else the first no-punch day of that
-- week; further days off that week are absent. The monthly cap is
-- unchanged (4 for 20+ days worked, otherwise 1 per 6 days worked). A week
-- with no day off earns no extra (those days are paid as worked).

create or replace function core.attendance_days(p_emp uuid, p_from date, p_to date)
returns table (d date, status text, reason text, pairs jsonb, worked_minutes integer,
               late_minutes integer, early_minutes integer, ot_minutes integer, short_minutes integer,
               is_late boolean, long_shift boolean, sched_start timestamptz, sched_end timestamptz)
language sql stable
set search_path to 'core', 'attendance', 'public'
as $function$
  with emp as (
    select coalesce(e.field_staff, false) fs, e.hired_on, e.exit_date from core.employees e where e.id = p_emp
  ), days as (
    select g::date d, ((extract(day from g)::int - 1) / 7) blk,
           (emp.hired_on is null or g::date >= emp.hired_on) and (emp.exit_date is null or g::date <= emp.exit_date) employed,
           g::date > (now() at time zone 'Asia/Kolkata')::date future
    from emp, generate_series(p_from, p_to, interval '1 day') g
  ), sh as (
    select * from core.attendance_shifts(p_emp, p_from, p_to)
  ), agg as (
    -- Hours are first punch-in to last punch-out of the day (as SalaryBox
    -- counted them; the 9-hour shift includes breaks), capped at 16 hours.
    select sh.d,
           case when count(*) filter (where kind = 'shift') > 0
                then greatest(coalesce(sum(minutes) filter (where kind = 'shift'), 0),
                              least(coalesce(extract(epoch from max(coalesce(out_at, in_at)) - min(in_at)) / 60, 0), 960))
                else 0 end mins,
           count(*) filter (where kind = 'shift') nshift,
           bool_or(kind = 'open') has_open, bool_or(kind = 'out_only') has_out_only, bool_or(kind = 'tap') has_tap,
           min(in_at) first_in, max(coalesce(out_at, in_at)) last_out,
           coalesce(max(minutes), 0) maxm,
           jsonb_agg(jsonb_build_array(in_at, out_at) order by coalesce(in_at, out_at)) pairs
    from sh group by sh.d
  ), lv as (
    select g::date d, bool_or(coalesce(lt.is_paid, true) and lt.code is distinct from 'week_off') paid,
           bool_or(not coalesce(lt.is_paid, true)) unpaid
    from core.leave_requests lr
    join core.leave_types lt on lt.id = lr.leave_type_id
    cross join generate_series(greatest(lr.start_date, p_from), least(lr.end_date, p_to), interval '1 day') g
    where lr.employee_id = p_emp and lr.status = 'approved'
      and lr.start_date <= p_to and lr.end_date >= p_from
    group by g::date
  ), ro as (
    -- Roster entries mostly carry a shift, not times: take the shift's start
    -- and end on that date (an end at or before the start is the next day).
    select r.work_date, bool_or(r.status = 'off') off,
           min(coalesce(r.starts_at, (r.work_date + s.start_time) at time zone 'Asia/Kolkata'))
             filter (where r.status <> 'off') starts_at,
           max(coalesce(r.ends_at, (r.work_date + s.end_time
                 + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end)
                 at time zone 'Asia/Kolkata'))
             filter (where r.status <> 'off') ends_at
    from core.roster_entries r
    left join core.shifts s on s.id = r.shift_id
    where r.employee_id = p_emp and r.work_date between p_from and p_to
    group by r.work_date
  ), fx as (
    -- No roster entry that day: fall back to the employee's assigned fixed
    -- shift (head office works a fixed 10am–7pm and isn't rostered).
    select days.d,
           min((days.d + s.start_time) at time zone 'Asia/Kolkata') starts_at,
           max((days.d + s.end_time
                + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end)
                at time zone 'Asia/Kolkata') ends_at
    from days
    join core.employee_shifts es on es.employee_id = p_emp and es.effective_from <= days.d
      and (es.effective_to is null or es.effective_to >= days.d)
    join core.shifts s on s.id = es.shift_id and s.is_active
      and extract(dow from days.d)::int = any(s.days_of_week)
    group by days.d
  ), rg as (
    -- Days with an approved regularisation (a regularised punch on the day,
    -- or before 6am the next morning for a night shift).
    select distinct x.d from (
      select (l.punched_at at time zone 'Asia/Kolkata')::date d from attendance.logs l
       where l.employee_id = p_emp and l.source = 'regularised'
         and l.punched_at >= (p_from - 1)::timestamp at time zone 'Asia/Kolkata'
         and l.punched_at < (p_to + 2)::timestamp at time zone 'Asia/Kolkata'
      union all
      select ((l.punched_at - interval '6 hours') at time zone 'Asia/Kolkata')::date from attendance.logs l
       where l.employee_id = p_emp and l.source = 'regularised'
         and l.punched_at >= (p_from - 1)::timestamp at time zone 'Asia/Kolkata'
         and l.punched_at < (p_to + 2)::timestamp at time zone 'Asia/Kolkata'
    ) x
  ), cls as (
    select days.d, days.blk, days.employed, days.future, a.pairs, a.mins, a.maxm,
           ro.off rostered_off,
           case when ro.work_date is not null then ro.starts_at else fx.starts_at end starts_at,
           case when ro.work_date is not null then ro.ends_at else fx.ends_at end ends_at,
           a.first_in, a.last_out, emp.fs,
           -- October 2026 was the first month on the app and many
           -- regularisations were entered with the wrong type or AM/PM: a
           -- day with an approved regularisation counts as a full day then.
           (days.d <= date '2026-10-31' and rg.d is not null and days.employed) reg_grace,
           case
             when not days.employed then 'NE'
             when a.nshift > 0 then case when emp.fs or a.mins >= 270 then 'P' else 'HD' end
             when a.has_open or a.has_out_only or a.has_tap then 'HD'
             when lv.paid then 'PL'
             when lv.unpaid then 'UPL'
             when days.future then 'FUT'
             else 'none'
           end k,
           case
             when a.nshift > 0 and not (emp.fs or a.mins >= 270) then 'Worked under 4h 30m'
             when coalesce(a.nshift, 0) = 0 and a.has_tap then 'Single tap - no start time'
             when coalesce(a.nshift, 0) = 0 and a.has_open then 'No punch-out'
             when coalesce(a.nshift, 0) = 0 and a.has_out_only then 'No punch-in'
           end reason
    from days cross join emp
    left join agg a on a.d = days.d
    left join lv on lv.d = days.d
    left join ro on ro.work_date = days.d
    left join fx on fx.d = days.d
    left join rg on rg.d = days.d
  ), ent as (
    -- Week offs are a monthly pool: 4 for 20+ days worked, otherwise one
    -- per 6 days worked.
    select case when count(*) filter (where k in ('P', 'HD')) >= 20 then 4
                else least(4, count(*) filter (where k in ('P', 'HD')) / 6) end n
    from cls
  ), wo as (
    -- One week off per calendar week (Monday to Sunday): the rostered off
    -- day if there is one, else the first no-punch day of that week.
    select d, row_number() over (partition by date_trunc('week', d)
                                 order by coalesce(rostered_off, false) desc, d) wk_rn
    from cls where k = 'none'
  ), wo1 as (
    -- At most the month's entitlement (ent), earliest weeks first.
    select d, row_number() over (order by d) rn from wo where wk_rn = 1
  ), lab as (
    select cls.*,
           case when cls.k = 'HD' and cls.reg_grace then 'P'
                when cls.k <> 'none' then cls.k
                when wo1.rn <= (select n from ent) then 'WO'
                else 'A' end st
    from cls left join wo1 on wo1.d = cls.d
  )
  select lab.d,
         lab.st,
         case when lab.reg_grace and lab.k in ('P', 'HD') then 'Regularised: full day (October grace)' else lab.reason end,
         lab.pairs,
         case when lab.k in ('P', 'HD') and lab.mins > 0 then round(lab.mins)::int end,
         case when lab.first_in is not null and lab.starts_at is not null
              then greatest(0, extract(epoch from lab.first_in - lab.starts_at) / 60)::int end,
         case when lab.last_out is not null and lab.ends_at is not null and lab.mins > 0
              then greatest(0, extract(epoch from lab.ends_at - lab.last_out) / 60)::int end,
         -- Overtime: the 9-hour shift plus 1 hour's grace is unpaid; after
         -- that, whole hours only (10h 59m = none, 11h = 1h).
         case when lab.k in ('P', 'HD') and not lab.fs
              then (greatest(floor((round(lab.mins) - 600) / 60.0), 0) * 60)::int else 0 end,
         -- Short hours are cut by the minute: a full day below the 9-hour
         -- working day, and a half day with both punches below 4h 30m (so
         -- every day pays for the hours worked). A half day from a missing
         -- punch has no hours to measure.
         case when lab.fs then 0
              when lab.reg_grace then 0
              when lab.st = 'P' then greatest(540 - round(lab.mins), 0)::int
              when lab.st = 'HD' and lab.mins > 0 then greatest(270 - round(lab.mins), 0)::int
              else 0 end,
         -- Over 3 hours after the rostered start is a different shift from
         -- the one rostered, not a late arrival.
         lab.first_in is not null and lab.starts_at is not null and not lab.fs
           and lab.first_in - lab.starts_at > interval '15 minutes'
           and lab.first_in - lab.starts_at <= interval '3 hours',
         lab.maxm > 840,
         lab.starts_at, lab.ends_at
  from lab
  order by lab.d;
$function$;

revoke all on function core.attendance_days(uuid, date, date) from public, anon, authenticated;

notify pgrst, 'reload schema';
