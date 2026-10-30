-- Payroll: the attendance pay rules agreed for October 2026.
--
-- Punches are paired into shifts first (core.payroll_shift_days): each
-- punch-in runs to the next punch within 16 hours, and the shift counts on
-- the day it started, so a 6:45pm–4am night shift is one day. Punches a
-- minute apart are one punch, and a lone punch-out never starts a shift.
-- The app's 4am day cutoff split night shifts in two and showed negative
-- or 19-hour days.
--
-- Per employee, per shift day inside their employment:
--   full day   in + out and at least 4.5 hours worked (field staff: in + out)
--   half day   in + out under 4.5 hours, or only an in or only an out
--   paid leave approved paid leave (week-off leave counts as a no-punch day)
--   week offs  one paid off in each 7-day block (1–7, 8–14, 15–21, 22–28)
--              that has a no-punch day and 3+ days worked; days 29–31 have none
--   lates      late by more than 15 minutes; every 3 cost half a day
--   overtime   minutes worked beyond 9h 30m (9-hour shift + 30 minutes'
--              grace), paid at salary / days in month / 9 per hour;
--              shifts over 14 hours are counted in calc.long_shifts to check
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

create or replace function core.payroll_shift_days(p_emp uuid, p_from date, p_to date)
returns table (d date, worked_minutes numeric, complete_shifts integer, open_punches integer, longest_minutes numeric)
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
  ), ev as (
    select min(t) t, bool_or(type = 'in') has_in, bool_or(type = 'out') has_out,
           row_number() over (order by min(t)) rn
    from c group by cl
  ), walk as (
    select rn, t, has_in, has_out, case when has_in then 'start' else 'orphan' end::text role from ev where rn = 1
    union all
    select n.rn, n.t, n.has_in, n.has_out,
           case when w.role = 'start' and n.t - w.t <= interval '16 hours'
                     and (n.has_out or n.t - w.t <= interval '14 hours') then 'end'
                when not n.has_in then 'orphan'
                else 'start' end
    from walk w join ev n on n.rn = w.rn + 1
  ), shifts as (
    select (s.t at time zone 'Asia/Kolkata')::date d, extract(epoch from en.t - s.t) / 60 mins
    from walk s left join walk en on en.rn = s.rn + 1 and en.role = 'end'
    where s.role = 'start'
    union all
    select ((t - interval '6 hours') at time zone 'Asia/Kolkata')::date, null from walk where role = 'orphan'
  )
  select d, coalesce(sum(mins), 0), count(mins)::int, (count(*) - count(mins))::int, coalesce(max(mins), 0)
  from shifts where d between p_from and p_to group by d;
$function$;

revoke all on function core.payroll_shift_days(uuid, date, date) from public, anon, authenticated;

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
    with days as (
      select g::date as d, ((extract(day from g)::int - 1) / 7) as blk
      from generate_series(greatest(period_start, coalesce(emp.hired_on, period_start)),
                           least(period_end, coalesce(emp.exit_date, period_end)), interval '1 day') g
    ),
    sd as (
      select * from core.payroll_shift_days(emp.id, period_start, period_end)
    ),
    lt as (
      select work_date, late_minutes
      from public.v_attendance_report_detailed
      where employee_id = emp.id and work_date between period_start and period_end
    ),
    lv as (
      select distinct g::date as d
      from core.leave_requests lr
      join core.leave_types lt on lt.id = lr.leave_type_id
      cross join generate_series(greatest(lr.start_date, period_start), least(lr.end_date, period_end), interval '1 day') g
      where lr.employee_id = emp.id and lr.status = 'approved' and coalesce(lt.is_paid, true)
        and lt.code is distinct from 'week_off'
        and lr.start_date <= period_end and lr.end_date >= period_start
    ),
    cls as (
      select days.d, days.blk,
             case
               when x.complete_shifts > 0
                 then case when emp.field_staff or x.worked_minutes >= 270 then 'full' else 'half' end
               when x.open_punches > 0 then 'half'
               when lv.d is not null then 'leave'
               else 'none'
             end as k,
             case when x.complete_shifts > 0 and not emp.field_staff
                  then greatest(x.worked_minutes - 570, 0) else 0 end as ot,
             coalesce(x.longest_minutes, 0) > 840 as long_shift,
             (x.d is not null and not emp.field_staff and coalesce(y.late_minutes, 0) > 15) as late
      from days
      left join sd x on x.d = days.d
      left join lt y on y.work_date = days.d
      left join lv on lv.d = days.d
    ),
    blocks as (
      select blk,
             case when blk < 4 and count(*) filter (where k in ('full', 'half')) >= 3
                       and count(*) filter (where k = 'none') >= 1 then 1 else 0 end as off_paid
      from cls group by blk
    )
    select count(*) filter (where k = 'full') as full_days,
           count(*) filter (where k = 'half') as half_days,
           count(*) filter (where k = 'leave') as leave_days,
           (select coalesce(sum(off_paid), 0) from blocks) as offs,
           count(*) filter (where k = 'none') as no_punch,
           count(*) filter (where late) as lates,
           coalesce(sum(ot), 0) as ot_min,
           count(*) filter (where long_shift) as long_shifts
      into a from cls;

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
        'week_offs', a.offs, 'absent', greatest(a.no_punch - a.offs, 0), 'lates', a.lates,
        'late_cut_days', late_cut, 'ot_minutes', a.ot_min, 'long_shifts', a.long_shifts, 'field_staff', emp.field_staff));
  end loop;
end; $function$;

notify pgrst, 'reload schema';
