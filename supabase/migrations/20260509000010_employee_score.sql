-- Flax HR — Migration 037: Phase 13 — Employee Score & Snapshot
--
-- Composite 0-100 score per employee per month. Pluggable inputs:
--   attendance, leaves, evaluations (live today)
--   complaints (placeholder table; to be fed by external complaints app)
--   knowledge (HR sets manually per period)
-- Weights live in core.app_settings.employee_score_weights.

-- ==========================================================================
-- 1. Pluggable input tables
-- ==========================================================================
create table if not exists core.complaints_score_imports (
  employee_id   uuid not null references core.employees(id) on delete cascade,
  period_month  date not null,
  score         numeric(5,2) not null check (score between 0 and 100),
  source        text,
  imported_at   timestamptz not null default now(),
  primary key (employee_id, period_month)
);

alter table core.complaints_score_imports enable row level security;
drop policy if exists complaints_admin_hr_all on core.complaints_score_imports;
create policy complaints_admin_hr_all on core.complaints_score_imports for all
  using (core.is_admin() or core.has_role('hr') or core.has_role('service'))
  with check (core.is_admin() or core.has_role('hr') or core.has_role('service'));
drop policy if exists complaints_self_select on core.complaints_score_imports;
create policy complaints_self_select on core.complaints_score_imports for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

create table if not exists core.knowledge_scores (
  employee_id   uuid not null references core.employees(id) on delete cascade,
  period_month  date not null,
  score         numeric(5,2) not null check (score between 0 and 100),
  notes         text,
  set_by        uuid,
  set_at        timestamptz not null default now(),
  primary key (employee_id, period_month)
);

alter table core.knowledge_scores enable row level security;
drop policy if exists knowledge_admin_hr_all on core.knowledge_scores;
create policy knowledge_admin_hr_all on core.knowledge_scores for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));
drop policy if exists knowledge_self_select on core.knowledge_scores;
create policy knowledge_self_select on core.knowledge_scores for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

-- ==========================================================================
-- 2. Default weights
-- ==========================================================================
insert into core.app_settings (key, value)
  values ('employee_score_weights', jsonb_build_object(
    'attendance', 30,
    'leaves', 15,
    'evaluations', 35,
    'complaints', 10,
    'knowledge', 10
  ))
  on conflict (key) do nothing;

-- ==========================================================================
-- 3. Composite score RPC
-- ==========================================================================
create or replace function public.employee_score(
  p_employee uuid,
  p_period_month date default null
) returns table (
  employee_id     uuid,
  period_month    date,
  attendance_score numeric,
  leaves_score    numeric,
  evaluations_score numeric,
  complaints_score numeric,
  knowledge_score numeric,
  weights         jsonb,
  total_score     numeric
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
  pending_leaves int; over_balance numeric;
  lv_score numeric;
  avg_eval numeric;
  ev_score numeric;
  co_score numeric;
  kn_score numeric;
  total numeric;
  pm date;
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
    -- Allow self-read.
    if not exists (select 1 from core.employees where id = p_employee and user_id = auth.uid()) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  end if;

  pm := coalesce(p_period_month, date_trunc('month', current_date)::date);
  period_start := date_trunc('month', pm)::date;
  period_end   := (period_start + interval '1 month - 1 day')::date;
  dim          := extract(day from period_end)::int;

  w := coalesce(core.get_app_setting('employee_score_weights'),
                jsonb_build_object('attendance',30,'leaves',15,'evaluations',35,'complaints',10,'knowledge',10));
  w_att := coalesce((w->>'attendance')::numeric, 30);
  w_lv  := coalesce((w->>'leaves')::numeric, 15);
  w_ev  := coalesce((w->>'evaluations')::numeric, 35);
  w_co  := coalesce((w->>'complaints')::numeric, 10);
  w_kn  := coalesce((w->>'knowledge')::numeric, 10);
  w_total := w_att + w_lv + w_ev + w_co + w_kn;
  if w_total <= 0 then w_total := 1; end if;

  select * into emp from core.employees where id = p_employee;
  if emp.id is null then return; end if;

  -- Attendance: days present / days expected (excludes weekly off using
  -- a simple proxy: 6/7 of dim). Late count penalises.
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
    join core.roster_entries r on r.employee_id = p_employee and r.work_date = t.d and r.status = 'published'
    join core.shifts s on s.id = r.shift_id
   where (t.punched_at at time zone 'Asia/Kolkata')::time
         > (s.start_time + (coalesce(s.grace_in_minutes,0) || ' minutes')::interval);

  att_score := greatest(0, 100 - (days_absent * 100.0 / greatest(rostered,1)) - (days_late * 5));

  -- Leaves: penalise unscheduled (rejected requests) and over-balance approvals.
  select count(*) into pending_leaves
    from core.leave_requests
   where employee_id = p_employee
     and start_date <= period_end and end_date >= period_start
     and status = 'rejected';
  lv_score := greatest(0, 100 - (pending_leaves * 10));

  -- Evaluations: average score_pct of submissions in the month.
  select avg(score_pct) into avg_eval
    from core.evaluations
   where employee_id = p_employee
     and status = 'submitted'
     and submitted_at >= period_start
     and submitted_at < period_start + interval '1 month';
  ev_score := coalesce(avg_eval, 100); -- no eval = neutral

  -- Complaints: from the import surface. Default 100.
  select score into co_score
    from core.complaints_score_imports
   where employee_id = p_employee and period_month = period_start;
  co_score := coalesce(co_score, 100);

  -- Knowledge: HR-set manual score. Default 100.
  select score into kn_score
    from core.knowledge_scores
   where employee_id = p_employee and period_month = period_start;
  kn_score := coalesce(kn_score, 100);

  total := round(
    (att_score * w_att + lv_score * w_lv + ev_score * w_ev + co_score * w_co + kn_score * w_kn) / w_total,
    2
  );

  return query
  select p_employee, period_start,
         round(att_score, 2), round(lv_score, 2), round(ev_score, 2),
         round(co_score, 2), round(kn_score, 2),
         w, total;
end;
$$;

grant execute on function public.employee_score(uuid, date) to authenticated;

-- ==========================================================================
-- 4. Knowledge score upsert RPC
-- ==========================================================================
create or replace function public.upsert_knowledge_score(
  p_employee uuid,
  p_period_month date,
  p_score numeric,
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare pm date := date_trunc('month', p_period_month)::date;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_score < 0 or p_score > 100 then
    raise exception 'OUT_OF_RANGE' using errcode = 'P0001';
  end if;
  insert into core.knowledge_scores (employee_id, period_month, score, notes, set_by)
  values (p_employee, pm, p_score, p_notes, auth.uid())
  on conflict (employee_id, period_month) do update
    set score = excluded.score, notes = excluded.notes,
        set_by = excluded.set_by, set_at = now();
end;
$$;

grant execute on function public.upsert_knowledge_score(uuid, date, numeric, text) to authenticated;

notify pgrst, 'reload schema';
