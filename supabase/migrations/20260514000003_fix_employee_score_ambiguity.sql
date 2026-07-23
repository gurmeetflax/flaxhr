-- Flax HR — Fix employee_score column-ambiguity + refresh PostgREST cache
--
-- Two production bugs surfaced on the employee snapshot page:
--
-- 1. `public.employee_score(uuid, date)` returned 42702
--    "column reference \"employee_id\" is ambiguous". The function declares
--    `returns table(employee_id uuid, period_month date, …)`, which in
--    PL/pgSQL creates OUT variables sharing names with columns on
--    core.leave_requests, core.evaluations, core.complaints_score_imports
--    and core.knowledge_scores. Fix: alias every table and qualify column
--    references.
--
-- 2. `public.v_employee_snapshot` (added in 20260514000002) was returning
--    PGRST205 because PostgREST hadn't refreshed its schema cache after
--    the migration. This migration includes a `notify pgrst, 'reload
--    schema'` to force the reload.

drop function if exists public.employee_score(uuid, date);

create or replace function public.employee_score(
  p_employee uuid,
  p_period_month date default null
) returns table (
  employee_id       uuid,
  period_month      date,
  attendance_score  numeric,
  leaves_score      numeric,
  evaluations_score numeric,
  complaints_score  numeric,
  knowledge_score   numeric,
  weights           jsonb,
  total_score       numeric
)
language plpgsql
security definer
set search_path = core, attendance, public
as $$
declare
  period_start date;
  period_end   date;
  dim          int;
  w            jsonb;
  w_att numeric; w_lv numeric; w_ev numeric; w_co numeric; w_kn numeric; w_total numeric;
  emp record;
  days_present int; days_absent int; days_late int;
  rostered int;
  att_score numeric;
  pending_leaves int;
  lv_score numeric;
  avg_eval numeric;
  ev_score numeric;
  co_score numeric;
  kn_score numeric;
  total numeric;
  pm date;
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
    if not exists (
      select 1 from core.employees emp2
      where emp2.id = p_employee and emp2.user_id = auth.uid()
    ) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  end if;

  pm := coalesce(p_period_month, date_trunc('month', current_date)::date);
  period_start := date_trunc('month', pm)::date;
  period_end   := (period_start + interval '1 month - 1 day')::date;
  dim          := extract(day from period_end)::int;

  w := coalesce(
    core.get_app_setting('employee_score_weights'),
    jsonb_build_object('attendance',30,'leaves',15,'evaluations',35,'complaints',10,'knowledge',10)
  );
  w_att := coalesce((w->>'attendance')::numeric, 30);
  w_lv  := coalesce((w->>'leaves')::numeric, 15);
  w_ev  := coalesce((w->>'evaluations')::numeric, 35);
  w_co  := coalesce((w->>'complaints')::numeric, 10);
  w_kn  := coalesce((w->>'knowledge')::numeric, 10);
  w_total := w_att + w_lv + w_ev + w_co + w_kn;
  if w_total <= 0 then w_total := 1; end if;

  select * into emp from core.employees e where e.id = p_employee;
  if emp.id is null then return; end if;

  -- Attendance: distinct days with an "in" punch, in outlet-local time.
  select count(distinct (l.punched_at at time zone 'Asia/Kolkata')::date)
    into days_present
    from attendance.logs l
   where l.employee_id = p_employee and l.type = 'in'
     and (l.punched_at at time zone 'Asia/Kolkata')::date between period_start and period_end;
  rostered := round(dim * 6.0 / 7.0);
  days_absent := greatest(rostered - days_present, 0);

  select count(*) into days_late
    from (
      select distinct on (l.employee_id, (l.punched_at at time zone 'Asia/Kolkata')::date)
             l.employee_id, (l.punched_at at time zone 'Asia/Kolkata')::date as d, l.punched_at
        from attendance.logs l
       where l.employee_id = p_employee and l.type = 'in'
         and (l.punched_at at time zone 'Asia/Kolkata')::date between period_start and period_end
       order by l.employee_id, (l.punched_at at time zone 'Asia/Kolkata')::date, l.punched_at asc
    ) t
    join core.roster_entries r on r.employee_id = p_employee
     and r.work_date = t.d and r.status = 'published'
    join core.shifts s on s.id = r.shift_id
   where (t.punched_at at time zone 'Asia/Kolkata')::time
         > (s.start_time + (coalesce(s.grace_in_minutes,0) || ' minutes')::interval);

  att_score := greatest(0, 100 - (days_absent * 100.0 / greatest(rostered,1)) - (days_late * 5));

  -- Leaves: penalise rejected requests overlapping the period.
  select count(*) into pending_leaves
    from core.leave_requests lr
   where lr.employee_id = p_employee
     and lr.start_date <= period_end and lr.end_date >= period_start
     and lr.status = 'rejected';
  lv_score := greatest(0, 100 - (pending_leaves * 10));

  -- Evaluations: mean score_pct of submissions in the month.
  select avg(ev.score_pct) into avg_eval
    from core.evaluations ev
   where ev.employee_id = p_employee
     and ev.status = 'submitted'
     and ev.submitted_at >= period_start
     and ev.submitted_at < period_start + interval '1 month';
  ev_score := coalesce(avg_eval, 100);

  -- Complaints: pre-imported per period.
  select ci.score into co_score
    from core.complaints_score_imports ci
   where ci.employee_id = p_employee and ci.period_month = period_start;
  co_score := coalesce(co_score, 100);

  -- Knowledge: HR-set manual score per period.
  select ks.score into kn_score
    from core.knowledge_scores ks
   where ks.employee_id = p_employee and ks.period_month = period_start;
  kn_score := coalesce(kn_score, 100);

  total := round(
    (att_score * w_att + lv_score * w_lv + ev_score * w_ev + co_score * w_co + kn_score * w_kn) / w_total,
    2
  );

  return query
  select
    p_employee, period_start,
    round(att_score, 2), round(lv_score, 2), round(ev_score, 2),
    round(co_score, 2), round(kn_score, 2),
    w, total;
end;
$$;

grant execute on function public.employee_score(uuid, date) to authenticated;

-- Kick PostgREST so v_employee_snapshot (from 20260514000002) becomes
-- reachable if the previous notify didn't stick.
notify pgrst, 'reload schema';
