-- Flax HR — Migration 027: Employee evaluations (questionnaires + runs)
--
-- Admin/HR builds questionnaires (a list of weighted questions) and fills
-- them per employee. Submitting an evaluation auto-scores it from the
-- weights + (per-kind) "correct" rules. Auditor app will later POST
-- through the same submit_evaluation RPC.
--
-- Question kinds:
--   rating          1..N integer (default scale 5); earned = answer/scale * weight
--   yes_no          true/false; earned = weight if matches correct_answer.bool
--   short_text      free text; earned = 0 (informational)
--   long_text       free text; earned = 0 (informational)
--   single_choice   one option value; earned = weight if matches correct_answer.value
--   multi_choice    array of option values; earned = weight if set equals correct_answer.value (sorted)
--
-- Auto-deactivating a questionnaire doesn't break already-submitted runs.

-- ==========================================================================
-- 1. Questionnaires + questions
-- ==========================================================================
create table if not exists core.eval_questionnaires (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  title         text not null,
  description   text,
  is_active     bool not null default true,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_eval_questionnaires_audit on core.eval_questionnaires;
create trigger trg_eval_questionnaires_audit
  after insert or update or delete on core.eval_questionnaires
  for each row execute function core.log_audit();

drop trigger if exists trg_eval_questionnaires_touch on core.eval_questionnaires;
create trigger trg_eval_questionnaires_touch
  before update on core.eval_questionnaires
  for each row execute function core.set_updated_at();

create table if not exists core.eval_questions (
  id                uuid primary key default gen_random_uuid(),
  questionnaire_id  uuid not null references core.eval_questionnaires(id) on delete cascade,
  position          int  not null default 0,
  text              text not null,
  kind              text not null check (kind in
                       ('rating','yes_no','short_text','long_text','single_choice','multi_choice')),
  options           jsonb not null default '{}'::jsonb,
  correct_answer    jsonb,
  required          bool not null default false,
  weight            numeric(8,2) not null default 0 check (weight >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists eval_questions_qn_idx
  on core.eval_questions (questionnaire_id, position);

drop trigger if exists trg_eval_questions_audit on core.eval_questions;
create trigger trg_eval_questions_audit
  after insert or update or delete on core.eval_questions
  for each row execute function core.log_audit();

drop trigger if exists trg_eval_questions_touch on core.eval_questions;
create trigger trg_eval_questions_touch
  before update on core.eval_questions
  for each row execute function core.set_updated_at();

-- ==========================================================================
-- 2. Evaluations + answers
-- ==========================================================================
create table if not exists core.evaluations (
  id                uuid primary key default gen_random_uuid(),
  questionnaire_id  uuid not null references core.eval_questionnaires(id),
  employee_id       uuid not null references core.employees(id) on delete cascade,
  evaluator_id      uuid references auth.users(id),
  evaluated_at      date not null default current_date,
  status            text not null default 'draft'
                      check (status in ('draft','submitted')),
  total_score       numeric(10,2),
  max_score         numeric(10,2),
  score_pct         numeric(6,2),
  notes             text,
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists evaluations_emp_idx
  on core.evaluations (employee_id, evaluated_at desc);
create index if not exists evaluations_status_idx
  on core.evaluations (status, created_at desc);

drop trigger if exists trg_evaluations_audit on core.evaluations;
create trigger trg_evaluations_audit
  after insert or update or delete on core.evaluations
  for each row execute function core.log_audit();

drop trigger if exists trg_evaluations_touch on core.evaluations;
create trigger trg_evaluations_touch
  before update on core.evaluations
  for each row execute function core.set_updated_at();

create table if not exists core.eval_answers (
  evaluation_id   uuid not null references core.evaluations(id) on delete cascade,
  question_id     uuid not null references core.eval_questions(id) on delete cascade,
  answer          jsonb,
  earned_score    numeric(8,2),
  primary key (evaluation_id, question_id)
);

drop trigger if exists trg_eval_answers_audit on core.eval_answers;
create trigger trg_eval_answers_audit
  after insert or update or delete on core.eval_answers
  for each row execute function core.log_audit();

-- ==========================================================================
-- 3. RLS
-- ==========================================================================
alter table core.eval_questionnaires enable row level security;
alter table core.eval_questions      enable row level security;
alter table core.evaluations         enable row level security;
alter table core.eval_answers        enable row level security;

drop policy if exists eq_read on core.eval_questionnaires;
create policy eq_read on core.eval_questionnaires for select
  using (auth.uid() is not null);
drop policy if exists eq_admin_write on core.eval_questionnaires;
create policy eq_admin_write on core.eval_questionnaires for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists eqs_read on core.eval_questions;
create policy eqs_read on core.eval_questions for select
  using (auth.uid() is not null);
drop policy if exists eqs_admin_write on core.eval_questions;
create policy eqs_admin_write on core.eval_questions for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- evaluations: admin/hr full; auditor read; employee read own submitted; manager read own outlet submitted.
drop policy if exists ev_admin_hr on core.evaluations;
create policy ev_admin_hr on core.evaluations for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists ev_auditor_read on core.evaluations;
create policy ev_auditor_read on core.evaluations for select
  using (core.has_role('auditor') and status = 'submitted');

drop policy if exists ev_self_read on core.evaluations;
create policy ev_self_read on core.evaluations for select
  using (
    status = 'submitted'
    and employee_id in (select id from core.employees where user_id = auth.uid())
  );

drop policy if exists ev_manager_read on core.evaluations;
create policy ev_manager_read on core.evaluations for select
  using (
    core.has_role('manager') and status = 'submitted'
    and exists (
      select 1 from core.employees e
      where e.id = core.evaluations.employee_id
        and (e.outlet_id is null or core.has_outlet_access(e.outlet_id))
    )
  );

-- answers piggy-back on evaluations visibility.
drop policy if exists ea_admin_hr on core.eval_answers;
create policy ea_admin_hr on core.eval_answers for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists ea_read on core.eval_answers;
create policy ea_read on core.eval_answers for select
  using (
    exists (
      select 1 from core.evaluations e
      where e.id = core.eval_answers.evaluation_id
        and e.status = 'submitted'
        and (
          core.has_role('auditor')
          or e.employee_id in (select id from core.employees where user_id = auth.uid())
          or (core.has_role('manager') and exists (
            select 1 from core.employees em
            where em.id = e.employee_id
              and (em.outlet_id is null or core.has_outlet_access(em.outlet_id))
          ))
        )
    )
  );

-- ==========================================================================
-- 4. Submit RPC: locks status, computes per-question + total score.
-- ==========================================================================
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
begin
  select * into ev from core.evaluations where id = p_id for update;
  if ev.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not (core.is_admin() or core.has_role('hr')
          or (core.has_role('manager') and exists (
            select 1 from core.employees e
            where e.id = ev.employee_id
              and (e.outlet_id is null or core.has_outlet_access(e.outlet_id))
          ))) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if ev.status = 'submitted' then
    raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001';
  end if;

  for q in
    select * from core.eval_questions
     where questionnaire_id = ev.questionnaire_id
     order by position, created_at
  loop
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
         and (ans #>> '{}')::boolean = (q.correct_answer #>> '{}')::boolean then
        earned := q.weight;
      end if;

    elsif q.kind = 'single_choice' then
      if ans is not null and q.correct_answer is not null
         and (ans #>> '{}') = (q.correct_answer #>> '{}') then
        earned := q.weight;
      end if;

    elsif q.kind = 'multi_choice' then
      ans_arr := coalesce(ans, '[]'::jsonb);
      correct_arr := coalesce(q.correct_answer, '[]'::jsonb);
      sorted_ans := array(select jsonb_array_elements_text(ans_arr) order by 1);
      sorted_corr := array(select jsonb_array_elements_text(correct_arr) order by 1);
      if array_length(sorted_corr, 1) is not null and sorted_ans = sorted_corr then
        earned := q.weight;
      end if;

    -- short_text / long_text contribute 0 to earned (informational).
    end if;

    max_total := max_total + q.weight;
    earned_total := earned_total + earned;

    update core.eval_answers
       set earned_score = earned
     where evaluation_id = p_id and question_id = q.id;
  end loop;

  update core.evaluations
    set status = 'submitted',
        submitted_at = now(),
        evaluator_id = coalesce(evaluator_id, auth.uid()),
        total_score = earned_total,
        max_score = max_total,
        score_pct = case when max_total > 0
                         then round(earned_total / max_total * 100, 2)
                         else null end
    where id = p_id;

  return jsonb_build_object(
    'id', p_id,
    'total_score', earned_total,
    'max_score', max_total,
    'score_pct', case when max_total > 0
                      then round(earned_total / max_total * 100, 2)
                      else null end
  );
end;
$$;

grant execute on function public.submit_evaluation(uuid) to authenticated;

-- ==========================================================================
-- 5. Views
-- ==========================================================================
create or replace view public.v_eval_questionnaires
with (security_invoker = true) as
  select q.id, q.code, q.title, q.description, q.is_active,
         q.created_at, q.updated_at,
         (select count(*) from core.eval_questions eq where eq.questionnaire_id = q.id) as question_count,
         coalesce(
           (select sum(weight) from core.eval_questions eq where eq.questionnaire_id = q.id),
           0
         ) as max_score
  from core.eval_questionnaires q
  order by q.is_active desc, q.title;

grant select on public.v_eval_questionnaires to authenticated;

create or replace view public.v_evaluations
with (security_invoker = true) as
  select ev.*,
         e.full_name as employee_name,
         e.employee_code,
         e.outlet_id,
         o.display_name as outlet_name,
         q.code as questionnaire_code,
         q.title as questionnaire_title
  from core.evaluations ev
  join core.employees e on e.id = ev.employee_id
  left join public.flax_outlets o on o.id = e.outlet_id
  join core.eval_questionnaires q on q.id = ev.questionnaire_id
  order by ev.evaluated_at desc, ev.created_at desc;

grant select on public.v_evaluations to authenticated;

create or replace view public.v_my_evaluations
with (security_invoker = true) as
  select * from public.v_evaluations
  where status = 'submitted'
    and employee_id in (select id from core.employees where user_id = auth.uid());

grant select on public.v_my_evaluations to authenticated;
