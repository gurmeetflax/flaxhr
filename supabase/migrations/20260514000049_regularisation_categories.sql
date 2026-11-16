-- Regularisation categories: missed punch, week off, sick leave, casual leave.
--
-- In October staff used regularisations to record week offs and leave by
-- entering a made-up punch, which turned those days into worked days (and,
-- with the October grace, full days). Now a regularisation has a category:
--
--  * missed_punch (default): as before, approval adds the punch.
--  * week_off / sick_leave / casual_leave: a whole-day request. Approval
--    adds no punch; attendance_days reads the category instead:
--      - week off: preferred as that week's one week off (still one per
--        Monday-Sunday week and at most the month's limit; a second one in
--        the same week is absent);
--      - sick / casual leave: paid leave if that leave type is paid
--        (Sick is paid, Casual is unpaid in leave types), else unpaid.
--    Punches on the day still win (a worked day stays worked).
--  * Approved "week off" leave requests (the old week-off card) get the
--    same preference.
--
-- October backfill: approved October regularisations whose reason says
-- week off, sick leave, paid leave / holiday / company closed / exams /
-- absent are re-tagged with the matching category and the punch each one
-- created is removed (87 regularisations, one punch each). Genuine ones
-- (phone off, covered a shift, hospital visit, left early) are untouched.

alter table attendance.regularisations
  add column if not exists category text not null default 'missed_punch';
alter table attendance.regularisations drop constraint if exists regularisations_category_check;
alter table attendance.regularisations add constraint regularisations_category_check
  check (category in ('missed_punch', 'week_off', 'sick_leave', 'casual_leave'));

create or replace view public.v_regularisations
with (security_invoker = true) as
  select r.id, r.employee_id, r.outlet_id, r.requested_for, r.type, r.reason,
         r.evidence_path, r.status, r.decided_by, r.decided_at, r.decision_note,
         r.created_at, r.updated_at,
         e.employee_code, e.full_name as employee_name,
         o.display_name as outlet_name, o.timezone as outlet_timezone,
         r.category
  from attendance.regularisations r
  join core.employees e on e.id = r.employee_id
  left join public.flax_outlets o on o.id = r.outlet_id
  order by r.created_at desc;

drop function if exists public.submit_regularisation(timestamptz, text, text, text, text);

create or replace function public.submit_regularisation(p_requested_for timestamp with time zone, p_type text,
  p_reason text, p_outlet_id text default null::text, p_evidence_path text default null::text,
  p_category text default 'missed_punch')
 returns uuid
 language plpgsql
 security definer
 set search_path to 'attendance', 'core', 'public'
as $function$
declare
  my_emp core.employees%rowtype;
  new_id uuid;
  v_cat text := coalesce(p_category, 'missed_punch');
  v_at timestamptz := p_requested_for;
  v_type text := p_type;
begin
  if v_cat not in ('missed_punch', 'week_off', 'sick_leave', 'casual_leave') then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if v_cat <> 'missed_punch' then
    -- A whole-day request: keep the date (start of the day in IST).
    v_at := ((p_requested_for at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
    v_type := 'in';
  end if;
  if v_type not in ('in','out') then
    raise exception 'INVALID_TYPE' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if v_at > now() + interval '5 minutes' then
    raise exception 'FUTURE_TIME' using errcode = 'P0001';
  end if;
  select * into my_emp from core.employees
    where user_id = auth.uid() and is_active = true and deleted_at is null limit 1;
  if my_emp.id is null then
    raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001';
  end if;
  if v_cat <> 'missed_punch' and exists (
    select 1 from attendance.regularisations r
     where r.employee_id = my_emp.id and r.category <> 'missed_punch'
       and r.status in ('pending', 'approved') and r.requested_for = v_at
  ) then
    raise exception 'DAY_ALREADY_REQUESTED' using errcode = 'P0001';
  end if;
  insert into attendance.regularisations
    (employee_id, outlet_id, requested_for, type, reason, evidence_path, category)
    values (my_emp.id, coalesce(p_outlet_id, my_emp.outlet_id), v_at,
            v_type, p_reason, p_evidence_path, v_cat)
    returning id into new_id;
  return new_id;
end $function$;

revoke all on function public.submit_regularisation(timestamptz, text, text, text, text, text) from public, anon;
grant execute on function public.submit_regularisation(timestamptz, text, text, text, text, text) to authenticated;

create or replace function public.decide_regularisation(p_id uuid, p_status text, p_note text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'attendance', 'core', 'public'
as $function$
declare
  reg attendance.regularisations%rowtype;
  is_authorised boolean;
begin
  if p_status not in ('approved','rejected') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  select * into reg from attendance.regularisations where id = p_id for update;
  if reg.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if reg.status <> 'pending' then
    raise exception 'ALREADY_DECIDED' using errcode = 'P0001';
  end if;

  is_authorised := core.is_admin() or core.has_role('hr')
    or (core.has_role('manager') and (reg.outlet_id is null or core.has_outlet_access(reg.outlet_id)));
  if not is_authorised then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_status = 'approved' and reg.requested_for > now() + interval '5 minutes' then
    raise exception 'FUTURE_TIME' using errcode = 'P0001';
  end if;

  update attendance.regularisations
    set status = p_status,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_note = p_note
    where id = p_id;

  -- Only a missed punch adds a punch; a week off or leave day is read from
  -- the regularisation itself by core.attendance_days.
  if p_status = 'approved' and reg.category = 'missed_punch' then
    insert into attendance.logs (
      employee_id, outlet_id, type, punched_at, selfie_path, lat, lng,
      is_within_geofence, distance_m, source, device_info
    ) values (
      reg.employee_id, reg.outlet_id, reg.type, reg.requested_for,
      reg.evidence_path, null, null, null, null, 'regularised',
      jsonb_build_object('regularisation_id', reg.id, 'reason', reg.reason)
    );
  end if;

  return jsonb_build_object('id', reg.id, 'status', p_status);
end;
$function$;

-- October backfill (see top).
with t as (
  select r.id,
         case when r.reason ~* 'sick|seek leave|not feeling well' then 'sick_leave'
              when r.reason ~* '(week|weekly|wik|wikly)\s*-?\s*off|^\s*weekend\s*$' then 'week_off'
              when r.reason ~* 'paid leave|national holiday|company was closed|college exam|^\s*absent\s*$' then 'casual_leave'
         end cat
  from attendance.regularisations r
  where r.status = 'approved' and r.category = 'missed_punch'
    and r.requested_for >= timestamp '2026-10-01' at time zone 'Asia/Kolkata'
    and r.requested_for < timestamp '2026-11-01' at time zone 'Asia/Kolkata'
)
update attendance.regularisations r set category = t.cat
  from t where t.id = r.id and t.cat is not null;

delete from attendance.logs l
 using attendance.regularisations r
 where l.source = 'regularised'
   and l.device_info ->> 'regularisation_id' = r.id::text
   and r.category <> 'missed_punch';

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
           bool_or(not coalesce(lt.is_paid, true)) unpaid,
           bool_or(lt.code = 'week_off') wo
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
  ), rc as (
    -- Approved day regularisations (week off, sick or casual leave): a
    -- whole-day request, no punch.
    select (r.requested_for at time zone 'Asia/Kolkata')::date d,
           bool_or(r.category = 'week_off') wo_req,
           bool_or(r.category = 'sick_leave') sl,
           bool_or(r.category = 'casual_leave') cl
    from attendance.regularisations r
    where r.employee_id = p_emp and r.status = 'approved' and r.category <> 'missed_punch'
      and r.requested_for >= p_from::timestamp at time zone 'Asia/Kolkata'
      and r.requested_for < (p_to + 1)::timestamp at time zone 'Asia/Kolkata'
    group by 1
  ), lp as (
    -- Whether sick and casual leave are paid comes from the leave types.
    select coalesce(bool_or(code = 'SL' and is_paid), false) sl_paid,
           coalesce(bool_or(code = 'CL' and is_paid), false) cl_paid
    from core.leave_types
  ), cls as (
    select days.d, days.blk, days.employed, days.future, a.pairs, a.mins, a.maxm,
           ro.off rostered_off,
           case when ro.work_date is not null then ro.starts_at else fx.starts_at end starts_at,
           case when ro.work_date is not null then ro.ends_at else fx.ends_at end ends_at,
           a.first_in, a.last_out, emp.fs,
           coalesce(rc.wo_req, false) or coalesce(lv.wo, false) req_wo,
           coalesce(rc.sl, false) rc_sl, coalesce(rc.cl, false) rc_cl, lv.d is not null has_lv,
           -- October 2026 was the first month on the app and many
           -- regularisations were entered with the wrong type or AM/PM: a
           -- day with an approved regularisation counts as a full day then.
           (days.d <= date '2026-10-31' and rg.d is not null and days.employed) reg_grace,
           case
             when not days.employed then 'NE'
             when a.nshift > 0 then case when emp.fs or a.mins >= 270 then 'P' else 'HD' end
             when a.has_open or a.has_out_only or a.has_tap then 'HD'
             when lv.paid then 'PL'
             when (rc.sl and lp.sl_paid) or (rc.cl and lp.cl_paid) then 'PL'
             when lv.unpaid or rc.sl or rc.cl then 'UPL'
             when days.future then 'FUT'
             else 'none'
           end k,
           case
             when a.nshift > 0 and not (emp.fs or a.mins >= 270) then 'Worked under 4h 30m'
             when coalesce(a.nshift, 0) = 0 and a.has_tap then 'Single tap - no start time'
             when coalesce(a.nshift, 0) = 0 and a.has_open then 'No punch-out'
             when coalesce(a.nshift, 0) = 0 and a.has_out_only then 'No punch-in'
           end reason
    from days cross join emp cross join lp
    left join agg a on a.d = days.d
    left join lv on lv.d = days.d
    left join ro on ro.work_date = days.d
    left join fx on fx.d = days.d
    left join rg on rg.d = days.d
    left join rc on rc.d = days.d
  ), ent as (
    -- Week offs are a monthly pool: 4 for 20+ days worked, otherwise one
    -- per 6 days worked.
    select case when count(*) filter (where k in ('P', 'HD')) >= 20 then 4
                else least(4, count(*) filter (where k in ('P', 'HD')) / 6) end n
    from cls
  ), wo as (
    -- One week off per calendar week (Monday to Sunday): the day the
    -- employee asked for (approved), else the rostered off day, else the
    -- first no-punch day of that week.
    select d, row_number() over (partition by date_trunc('week', d)
                                 order by req_wo desc, coalesce(rostered_off, false) desc, d) wk_rn
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
         case when lab.reg_grace and lab.k in ('P', 'HD') then 'Regularised: full day (October grace)'
              when lab.k in ('PL', 'UPL') and not lab.has_lv and lab.rc_sl then 'Sick leave (regularised)'
              when lab.k in ('PL', 'UPL') and not lab.has_lv and lab.rc_cl then 'Casual leave (regularised)'
              when lab.st = 'WO' and lab.req_wo then 'Week off (requested)'
              when lab.st = 'A' and lab.req_wo then 'Week off not allowed: one a week, up to the month''s limit'
              else lab.reason end,
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
