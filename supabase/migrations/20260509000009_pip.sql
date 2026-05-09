-- Flax HR — Migration 036: Phase 12 — PIP (Performance Improvement Plan)
--
-- Auto-trigger when an employee shows a *trend* of low evaluations.
-- Settings:
--   pip_threshold_pct      — score % below which counts as "low" (default 60)
--   pip_consecutive_low    — how many consecutive low evals trigger PIP (default 2)
--   pip_default_duration_days — default PIP target = today + N days (default 30)

create table if not exists core.pips (
  id                          uuid primary key default gen_random_uuid(),
  employee_id                 uuid not null references core.employees(id) on delete cascade,
  triggered_by_evaluation_id  uuid references core.evaluations(id) on delete set null,
  score_pct_at_trigger        numeric(5,2),
  threshold_pct_at_trigger    numeric(5,2),
  consecutive_low_at_trigger  integer,
  started_on                  date not null default current_date,
  target_date                 date not null,
  status                      text not null default 'open'
                              check (status in ('open','review','closed_pass','closed_fail')),
  notes                       text,
  closed_by                   uuid,
  closed_at                   timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists pips_emp_idx on core.pips (employee_id, status);
create index if not exists pips_open_idx on core.pips (status) where status in ('open','review');

drop trigger if exists trg_pips_updated_at on core.pips;
create trigger trg_pips_updated_at
  before update on core.pips
  for each row execute function core.set_updated_at();

drop trigger if exists trg_pips_audit on core.pips;
create trigger trg_pips_audit
  after insert or update or delete on core.pips
  for each row execute function core.log_audit();

alter table core.pips enable row level security;

drop policy if exists pips_admin_hr_all on core.pips;
create policy pips_admin_hr_all on core.pips for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists pips_manager_select on core.pips;
create policy pips_manager_select on core.pips for select
  using (core.has_role('manager'));

drop policy if exists pips_self_select on core.pips;
create policy pips_self_select on core.pips for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

drop policy if exists pips_auditor_select on core.pips;
create policy pips_auditor_select on core.pips for select using (core.has_role('auditor'));

create table if not exists core.pip_milestones (
  id          uuid primary key default gen_random_uuid(),
  pip_id      uuid not null references core.pips(id) on delete cascade,
  due_on      date not null,
  description text not null,
  status      text not null default 'pending' check (status in ('pending','done','missed')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_pip_milestones_updated_at on core.pip_milestones;
create trigger trg_pip_milestones_updated_at
  before update on core.pip_milestones
  for each row execute function core.set_updated_at();

alter table core.pip_milestones enable row level security;

drop policy if exists pip_milestones_admin_hr_all on core.pip_milestones;
create policy pip_milestones_admin_hr_all on core.pip_milestones for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists pip_milestones_self_select on core.pip_milestones;
create policy pip_milestones_self_select on core.pip_milestones for select
  using (pip_id in (select id from core.pips
    where employee_id in (select id from core.employees where user_id = auth.uid())));

-- ==========================================================================
-- Settings defaults (idempotent)
-- ==========================================================================
insert into core.app_settings (key, value)
  values
    ('pip_threshold_pct', '60'::jsonb),
    ('pip_consecutive_low', '2'::jsonb),
    ('pip_default_duration_days', '30'::jsonb)
  on conflict (key) do nothing;

-- ==========================================================================
-- Trigger logic — called from submit_evaluation
-- ==========================================================================
create or replace function core.maybe_open_pip(p_employee uuid, p_evaluation uuid)
returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  threshold     numeric;
  need_low      int;
  duration_days int;
  recent_count  int;
  low_count     int;
  cur_score     numeric;
  pip_id        uuid;
begin
  threshold     := coalesce((core.get_app_setting('pip_threshold_pct'))::numeric, 60);
  need_low      := coalesce((core.get_app_setting('pip_consecutive_low'))::int, 2);
  duration_days := coalesce((core.get_app_setting('pip_default_duration_days'))::int, 30);

  -- Skip if there's an open PIP already.
  if exists (
    select 1 from core.pips
     where employee_id = p_employee and status in ('open','review')
  ) then
    return null;
  end if;

  -- Fetch the most recent N submitted evaluations and check they're all low.
  with recent as (
    select id, score_pct
      from core.evaluations
     where employee_id = p_employee
       and status = 'submitted'
       and score_pct is not null
     order by submitted_at desc nulls last, created_at desc
     limit need_low
  )
  select count(*) filter (where score_pct < threshold), count(*)
    into low_count, recent_count
    from recent;

  if recent_count < need_low or low_count < need_low then
    return null;
  end if;

  select score_pct into cur_score from core.evaluations where id = p_evaluation;

  insert into core.pips (
    employee_id, triggered_by_evaluation_id,
    score_pct_at_trigger, threshold_pct_at_trigger, consecutive_low_at_trigger,
    started_on, target_date, status
  ) values (
    p_employee, p_evaluation,
    cur_score, threshold, need_low,
    current_date, current_date + duration_days, 'open'
  )
  returning id into pip_id;

  perform core.notify(
    p_employee,
    'pip_opened',
    'You have been placed on a Performance Improvement Plan',
    'Threshold ' || threshold::text || '% · ' || need_low::text ||
    ' consecutive low evaluations · target ' || (current_date + duration_days)::text || '.',
    jsonb_build_object('pip_id', pip_id, 'threshold', threshold)
  );
  return pip_id;
end;
$$;

grant execute on function core.maybe_open_pip(uuid, uuid) to authenticated;

-- Wrap the existing submit_evaluation by replacing it. Re-uses the
-- original body, then calls maybe_open_pip after the score is written.
create or replace function public.submit_evaluation(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  ev          core.evaluations%rowtype;
  q           record;
  ans         jsonb;
  earned      numeric(8,2);
  max_total   numeric(10,2) := 0;
  earned_total numeric(10,2) := 0;
  scale       numeric;
  rating_val  numeric;
  ans_arr     jsonb;
  correct_arr jsonb;
  sorted_ans  text[];
  sorted_corr text[];
  pct         numeric;
begin
  select * into ev from core.evaluations where id = p_id for update;
  if ev.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not (core.is_admin() or core.has_role('hr')
          or (core.has_role('manager') and exists (
            select 1 from core.employees e
            where e.id = ev.employee_id
              and (e.outlet_id is null or core.has_outlet_access(e.outlet_id))
          ))) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if ev.status = 'submitted' then raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001'; end if;

  for q in select * from core.eval_questions
     where questionnaire_id = ev.questionnaire_id order by position, created_at loop
    select answer into ans from core.eval_answers
      where evaluation_id = p_id and question_id = q.id;
    if q.required and (ans is null or ans = 'null'::jsonb) then
      raise exception 'MISSING_REQUIRED_ANSWER question_id=%', q.id using errcode = 'P0001';
    end if;
    earned := 0;
    if q.kind = 'rating' then
      scale := coalesce((q.options->>'scale')::numeric, 5);
      if ans is not null then
        rating_val := (ans #>> '{}')::numeric;
        if rating_val is not null and scale > 0 then
          earned := round(least(rating_val, scale) / scale * q.weight, 2);
        end if;
      end if;
    elsif q.kind = 'yes_no' then
      if ans is not null and q.correct_answer is not null
         and (ans #>> '{}')::boolean = (q.correct_answer #>> '{}')::boolean then earned := q.weight; end if;
    elsif q.kind = 'single_choice' then
      if ans is not null and q.correct_answer is not null
         and (ans #>> '{}') = (q.correct_answer #>> '{}') then earned := q.weight; end if;
    elsif q.kind = 'multi_choice' then
      ans_arr := coalesce(ans, '[]'::jsonb);
      correct_arr := coalesce(q.correct_answer, '[]'::jsonb);
      sorted_ans := array(select jsonb_array_elements_text(ans_arr) order by 1);
      sorted_corr := array(select jsonb_array_elements_text(correct_arr) order by 1);
      if array_length(sorted_corr, 1) is not null and sorted_ans = sorted_corr then earned := q.weight; end if;
    end if;
    max_total := max_total + q.weight;
    earned_total := earned_total + earned;
    update core.eval_answers set earned_score = earned
     where evaluation_id = p_id and question_id = q.id;
  end loop;

  pct := case when max_total > 0 then round(earned_total / max_total * 100, 2) else null end;

  update core.evaluations
    set status = 'submitted',
        submitted_at = now(),
        evaluator_id = coalesce(evaluator_id, auth.uid()),
        total_score = earned_total,
        max_score = max_total,
        score_pct = pct
    where id = p_id;

  -- PIP trend check.
  if pct is not null then
    perform core.maybe_open_pip(ev.employee_id, p_id);
  end if;

  return jsonb_build_object('id', p_id, 'total_score', earned_total,
    'max_score', max_total, 'score_pct', pct);
end;
$$;

grant execute on function public.submit_evaluation(uuid) to authenticated;

-- ==========================================================================
-- Close PIP RPC + view
-- ==========================================================================
create or replace function public.close_pip(
  p_pip_id uuid,
  p_outcome text,
  p_notes   text default null
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare r core.pips%rowtype;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_outcome not in ('pass', 'fail') then
    raise exception 'INVALID_OUTCOME' using errcode = 'P0001';
  end if;
  select * into r from core.pips where id = p_pip_id for update;
  if r.id is null then raise exception 'PIP_NOT_FOUND' using errcode = 'P0001'; end if;

  update core.pips
     set status = case when p_outcome = 'pass' then 'closed_pass' else 'closed_fail' end,
         notes  = coalesce(p_notes, notes),
         closed_by = auth.uid(),
         closed_at = now()
   where id = p_pip_id;

  perform core.notify(
    r.employee_id,
    'pip_closed',
    'PIP closed: ' || p_outcome,
    coalesce(p_notes, 'Your PIP has been closed.'),
    jsonb_build_object('pip_id', p_pip_id, 'outcome', p_outcome)
  );
end;
$$;

grant execute on function public.close_pip(uuid, text, text) to authenticated;

create or replace view public.v_pips
with (security_invoker = true) as
  select p.id, p.employee_id, p.triggered_by_evaluation_id,
         p.score_pct_at_trigger, p.threshold_pct_at_trigger, p.consecutive_low_at_trigger,
         p.started_on, p.target_date, p.status, p.notes,
         p.closed_by, p.closed_at, p.created_at, p.updated_at,
         e.employee_code, e.full_name, e.outlet_id,
         o.display_name as outlet_name
    from core.pips p
    join core.employees e on e.id = p.employee_id
    left join public.flax_outlets o on o.id = e.outlet_id;

grant select on public.v_pips to authenticated;

-- /me self view of *open* PIPs only.
create or replace view public.v_my_pip
with (security_invoker = true) as
  select p.id, p.started_on, p.target_date, p.status,
         p.score_pct_at_trigger, p.threshold_pct_at_trigger, p.notes
    from core.pips p
    join core.employees e on e.id = p.employee_id
   where e.user_id = auth.uid()
     and p.status in ('open', 'review')
   order by p.created_at desc;

grant select on public.v_my_pip to authenticated;

notify pgrst, 'reload schema';
