-- Attendance and payroll: the pay rules agreed for October 2026, worked
-- out in one place (core.attendance_days) so the monthly attendance report
-- and the payroll run always show the same days.
--
-- Punches are paired into shifts first (core.attendance_shifts): each
-- punch-in runs to the next punch within 16 hours, and the shift counts on
-- the day it started, so a 6:45pm–4am night shift is one day (as SalaryBox
-- showed it). Punches within 2 minutes are one event. An in and out in the
-- same second is a "tap": in-then-out (a single tap at the end of a visit,
-- or the app's 4am split) can close a shift but never opens one;
-- out-then-in (the app closing a stale session as a shift starts) closes an
-- open shift or else opens one. A lone punch-out never starts a shift.
--
-- Per employee, per day inside their employment (core.attendance_days):
--   P    in + out and at least 4.5 hours worked (field staff: in + out)
--   HD   in + out under 4.5 hours, a missing punch-in or punch-out, or a
--        single tap (an approved regularisation adds the missing punch)
--   PL   approved paid leave (a week-off leave request counts as no punch)
--   UPL  approved unpaid leave
--   WO   a monthly pool of paid week offs: 4 for 20+ days worked (P or HD),
--        otherwise one per 6 days worked. Rostered off days are used first,
--        then the earliest no-punch days
--   A    any other no-punch day (offs beyond the pool are absent)
--   late more than 15 minutes (and up to 3 hours) after the rostered shift
--        start; every 3 lates in the month cost half a day
--   OT   minutes worked beyond 9h 30m (9-hour shift + 30 minutes' grace),
--        paid at salary / days in month / 9 per hour; shifts over 14 hours
--        are flagged to check
-- Field staff are exempt from the hours rules (4.5 hours, lates, overtime).
-- PF, ESIC and PT are unchanged and apply to the prorated pay, not overtime.

alter table core.payroll_run_lines add column if not exists ot_minutes numeric not null default 0;
alter table core.payroll_run_lines add column if not exists ot_amount numeric(12,2) not null default 0;
alter table core.payroll_run_lines add column if not exists calc jsonb;

create or replace view public.v_payroll_run_lines with (security_invoker = true) as
select l.id, l.run_id, l.employee_id, e.employee_code, e.full_name, l.gross, l.days_in_month,
       l.days_present, l.days_paid_leave, l.days_payable, l.prorated_gross, l.deductions_total,
       l.deductions_breakdown, l.net_pay, l.notes, l.created_at, r.period_month, r.status, r.outlet_id,
       l.ot_minutes, l.ot_amount, l.calc
from core.payroll_run_lines l
join core.payroll_runs r on r.id = l.run_id
join core.employees e on e.id = l.employee_id;

create or replace view public.v_my_payslips with (security_invoker = true) as
select l.id, l.run_id, l.employee_id, l.gross, l.days_in_month, l.days_present, l.days_paid_leave,
       l.days_payable, l.prorated_gross, l.deductions_total, l.deductions_breakdown, l.net_pay,
       r.period_month, r.outlet_id, r.finalised_at, o.display_name as outlet_name, e.employee_code, e.full_name,
       l.ot_minutes, l.ot_amount, l.calc
from core.payroll_run_lines l
join core.payroll_runs r on r.id = l.run_id
join core.employees e on e.id = l.employee_id
left join public.flax_outlets o on o.id = r.outlet_id
where r.status = 'finalised' and e.user_id = auth.uid();

create or replace function core.attendance_shifts(p_emp uuid, p_from date, p_to date)
returns table (d date, in_at timestamptz, out_at timestamptz, minutes numeric, kind text)
language sql stable
set search_path to 'core', 'attendance', 'public'
as $function$
  with recursive p as (
    select l.punched_at t, l.type from attendance.logs l
    where l.employee_id = p_emp
      and l.punched_at >= (p_from - 1)::timestamp at time zone 'Asia/Kolkata' + interval '6 hours'
      and l.punched_at <  (p_to + 1)::timestamp at time zone 'Asia/Kolkata' + interval '12 hours'
  ), c as (
    select t, type, sum(case when lag_t is null or t - lag_t > interval '2 minutes' then 1 else 0 end)
             over (order by t) cl
    from (select t, type, lag(t) over (order by t) lag_t from p) x
  ), ev0 as (
    select min(t) t,
           case when bool_or(type = 'in') and bool_or(type = 'out')
                  then case when (array_agg(type order by t desc))[1] = 'in' then 'outin' else 'tap' end
                when bool_or(type = 'in') then 'in' else 'out' end k
    from c group by cl
  ), ev as (
    select *, row_number() over (order by t) rn, lead(t) over (order by t) nt, lead(k) over (order by t) nk
    from ev0
  ), walk as (
    select rn, t, case when k in ('in', 'outin') then 'start' when k = 'tap' then 'tap' else 'orphan' end::text role,
           t st, rn srn
    from ev where rn = 1
    union all
    select n.rn, n.t, x.role,
           case when x.role = 'start' then n.t else w.st end,
           case when x.role = 'start' then n.rn else w.srn end
    from walk w join ev n on n.rn = w.rn + 1
    cross join lateral (select case
        when w.role in ('start', 'skip') and n.t - w.st <= interval '16 hours' then
          case when n.k <> 'in' then 'end'
               when n.nk <> 'in' and n.nt - w.st <= interval '16 hours' then 'skip'
               when n.t - w.st <= interval '14 hours' then 'end'
               else 'start' end
        when n.k in ('in', 'outin') then 'start'
        when n.k = 'tap' then 'tap'
        else 'orphan' end as role) x
  ), s as (
    select (s.t at time zone 'Asia/Kolkata')::date d, s.t in_at, en.t out_at,
           extract(epoch from en.t - s.t) / 60 minutes,
           case when en.t is null then 'open' else 'shift' end kind
    from walk s left join walk en on en.role = 'end' and en.srn = s.rn
    where s.role = 'start'
    union all
    select ((t - interval '6 hours') at time zone 'Asia/Kolkata')::date,
           case when role = 'tap' then t end, t, null, case when role = 'tap' then 'tap' else 'out_only' end
    from walk where role in ('orphan', 'tap')
  )
  select * from s where d between p_from and p_to;
$function$;

create or replace function core.attendance_days(p_emp uuid, p_from date, p_to date)
returns table (d date, status text, reason text, pairs jsonb, worked_minutes integer,
               late_minutes integer, early_minutes integer, ot_minutes integer,
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
  ), cls as (
    select days.d, days.blk, days.employed, days.future, a.pairs, a.mins, a.maxm,
           ro.off rostered_off, ro.starts_at, ro.ends_at, a.first_in, a.last_out, emp.fs,
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
  ), ent as (
    -- Week offs are a monthly pool: 4 for 20+ days worked, otherwise one
    -- per 6 days worked.
    select case when count(*) filter (where k in ('P', 'HD')) >= 20 then 4
                else least(4, count(*) filter (where k in ('P', 'HD')) / 6) end n
    from cls
  ), wo as (
    -- Rostered off days first, then the earliest no-punch days.
    select d, row_number() over (order by coalesce(rostered_off, false) desc, d) rn
    from cls where k = 'none'
  ), lab as (
    select cls.*,
           case when cls.k <> 'none' then cls.k
                when wo.rn <= (select n from ent) then 'WO'
                else 'A' end st
    from cls left join wo on wo.d = cls.d
  )
  select lab.d,
         lab.st,
         lab.reason,
         lab.pairs,
         case when lab.k in ('P', 'HD') and lab.mins > 0 then round(lab.mins)::int end,
         case when lab.first_in is not null and lab.starts_at is not null
              then greatest(0, extract(epoch from lab.first_in - lab.starts_at) / 60)::int end,
         case when lab.last_out is not null and lab.ends_at is not null and lab.mins > 0
              then greatest(0, extract(epoch from lab.ends_at - lab.last_out) / 60)::int end,
         case when lab.k in ('P', 'HD') and not lab.fs then greatest(round(lab.mins) - 570, 0)::int else 0 end,
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

revoke all on function core.attendance_shifts(uuid, date, date) from public, anon, authenticated;
revoke all on function core.attendance_days(uuid, date, date) from public, anon, authenticated;

-- The monthly attendance report (admin and HR): one row per employee per
-- day, from the same core.attendance_days the payroll run uses.
create or replace function public.attendance_month_report(p_from date, p_to date, p_outlet text default null)
returns table (employee_id uuid, d date, status text, reason text, pairs jsonb, worked_minutes integer,
               late_minutes integer, early_minutes integer, ot_minutes integer, is_late boolean,
               long_shift boolean, sched_start timestamptz, sched_end timestamptz)
language plpgsql stable
security definer
set search_path to 'core', 'attendance', 'public'
as $function$
begin
  if not (core.is_admin() or core.has_role('hr')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'BAD_RANGE' using errcode = 'P0001'; end if;
  return query
  select e.id, a.*
  from core.employees e
  cross join lateral core.attendance_days(e.id, p_from, p_to) a
  where e.deleted_at is null
    and (p_outlet is null or e.outlet_id = p_outlet)
    and (e.hired_on is null or e.hired_on <= p_to)
    and (e.exit_date is null or e.exit_date >= p_from)
  order by e.employee_code, a.d;
end; $function$;

revoke all on function public.attendance_month_report(date, date, text) from public, anon;
grant execute on function public.attendance_month_report(date, date, text) to authenticated;

create or replace function public.compute_payroll_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path to 'core', 'attendance', 'public'
as $function$
declare r core.payroll_runs%rowtype; period_start date; period_end date; dim integer;
  emp record; ded record; a record; ded_total numeric(12,2); ded_breakdown jsonb;
  days_payable numeric(6,2); late_cut numeric(6,2); prorated numeric(12,2); ot_amt numeric(12,2); net numeric(12,2);
  pf_rate numeric; pt_amt numeric; esic_rate numeric; esic_max numeric; pf_amt numeric; esic_amt numeric;
begin
  if not (core.is_admin() or core.has_role('hr')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into r from core.payroll_runs where id = p_run_id;
  if r.id is null then raise exception 'RUN_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.status <> 'draft' then raise exception 'RUN_LOCKED' using errcode = 'P0001'; end if;
  period_start := date_trunc('month', r.period_month)::date;
  period_end := (period_start + interval '1 month - 1 day')::date;
  dim := extract(day from period_end)::int;

  pf_rate   := coalesce((core.get_app_setting('pf_rate_pct'))::numeric, 12);
  pt_amt    := coalesce((core.get_app_setting('pt_amount'))::numeric, 200);
  esic_rate := coalesce((core.get_app_setting('esic_rate_pct'))::numeric, 0.75);
  esic_max  := coalesce((core.get_app_setting('esic_max_gross'))::numeric, 21000);

  delete from core.payroll_run_lines where run_id = r.id;
  for emp in select e.id, e.employee_code, e.full_name, e.monthly_salary, e.hired_on, e.exit_date,
              coalesce(e.field_staff, false) as field_staff, e.pf_enabled, e.pt_enabled, e.esic_enabled
      from core.employees e
     where e.deleted_at is null and e.outlet_id = r.outlet_id
       and (e.hired_on is null or e.hired_on <= period_end)
       and (e.exit_date is null or e.exit_date >= period_start)
       and coalesce(e.monthly_salary, 0) > 0
  loop
    select count(*) filter (where x.status = 'P') as full_days,
           count(*) filter (where x.status = 'HD') as half_days,
           count(*) filter (where x.status = 'PL') as leave_days,
           count(*) filter (where x.status = 'WO') as offs,
           count(*) filter (where x.status = 'A') as absent,
           count(*) filter (where x.is_late) as lates,
           coalesce(sum(x.ot_minutes), 0) as ot_min,
           count(*) filter (where x.long_shift) as long_shifts
      into a
      from core.attendance_days(emp.id, period_start, period_end) x;

    late_cut := floor(a.lates / 3.0) * 0.5;
    days_payable := least(greatest(a.full_days + 0.5 * a.half_days + a.leave_days + a.offs - late_cut, 0), dim);
    prorated := round(emp.monthly_salary * days_payable / dim, 2);
    ot_amt := round(emp.monthly_salary / dim / 9.0 * a.ot_min / 60.0, 2);

    ded_total := 0; ded_breakdown := '[]'::jsonb;
    for ded in select id, kind, monthly_amount, months_remaining, total_amount, notes
        from core.deductions where employee_id = emp.id and is_active and months_remaining > 0
        order by created_at
    loop
      ded_total := ded_total + ded.monthly_amount;
      ded_breakdown := ded_breakdown || jsonb_build_object(
        'id', ded.id, 'kind', ded.kind, 'amount', ded.monthly_amount,
        'months_remaining', ded.months_remaining, 'notes', ded.notes);
    end loop;
    if emp.pf_enabled then
      pf_amt := round(prorated * pf_rate / 100.0, 2);
      ded_total := ded_total + pf_amt;
      ded_breakdown := ded_breakdown || jsonb_build_object('kind', 'pf', 'amount', pf_amt, 'rate_pct', pf_rate, 'notes', 'Provident Fund');
    end if;
    if emp.esic_enabled and emp.monthly_salary <= esic_max then
      esic_amt := round(prorated * esic_rate / 100.0, 2);
      ded_total := ded_total + esic_amt;
      ded_breakdown := ded_breakdown || jsonb_build_object('kind', 'esic', 'amount', esic_amt, 'rate_pct', esic_rate, 'notes', 'ESIC');
    end if;
    if emp.pt_enabled then
      ded_total := ded_total + pt_amt;
      ded_breakdown := ded_breakdown || jsonb_build_object('kind', 'pt', 'amount', pt_amt, 'notes', 'Professional Tax');
    end if;

    net := greatest(prorated + ot_amt - ded_total, 0);
    insert into core.payroll_run_lines (run_id, employee_id, gross, days_in_month,
      days_present, days_paid_leave, days_payable, prorated_gross, deductions_total,
      deductions_breakdown, net_pay, ot_minutes, ot_amount, calc)
    values (r.id, emp.id, emp.monthly_salary, dim, a.full_days + a.half_days, a.leave_days, days_payable,
      prorated, ded_total, ded_breakdown, net, a.ot_min, ot_amt,
      jsonb_build_object('full_days', a.full_days, 'half_days', a.half_days, 'paid_leave', a.leave_days,
        'week_offs', a.offs, 'absent', a.absent, 'lates', a.lates,
        'late_cut_days', late_cut, 'ot_minutes', a.ot_min, 'long_shifts', a.long_shifts, 'field_staff', emp.field_staff));
  end loop;
end; $function$;

notify pgrst, 'reload schema';
