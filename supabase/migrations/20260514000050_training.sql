-- Training: modules (brand intro, onboarding, recipes, SOPs), quizzes,
-- auto-assignment by role, and scores.
--
-- Tables live in a private `training` schema with RLS on and no policies:
-- every read and write goes through the public.training_* functions below,
-- so quiz answers never reach an employee's browser and only admins / HR
-- can edit content or see everyone's scores.
--
-- Scoring (shown to admins):
--   module score   = best quiz score (0-100); attempts and first score are kept
--   training score = average module score over modules that count: passed,
--                    attempted, or past their due date (an overdue module
--                    never attempted counts as 0)

create schema if not exists training;
revoke all on schema training from public, anon, authenticated;

create table if not exists training.modules (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  title         text not null check (length(btrim(title)) > 0),
  summary       text,
  kind          text not null default 'other'
                  check (kind in ('brand', 'onboarding', 'recipe', 'sop', 'service', 'hygiene', 'other')),
  cover_url     text,
  source_url    text,            -- e.g. the recipe card / SOP in command.flaxfoods.in
  recipe_card_key text,          -- command recipe card key, e.g. 'mexican-bowl'
  est_minutes   integer not null default 10 check (est_minutes between 1 and 600),
  pass_mark     integer not null default 70 check (pass_mark between 0 and 100),
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists training.lessons (
  id         uuid primary key default gen_random_uuid(),
  module_id  uuid not null references training.modules(id) on delete cascade,
  position   integer not null default 0,
  kind       text not null default 'text'
               check (kind in ('slide', 'text', 'video', 'image', 'pdf', 'recipe', 'steps')),
  title      text,
  body       text,
  media_url  text,
  data       jsonb not null default '{}'::jsonb
);
create index if not exists lessons_module_idx on training.lessons (module_id, position);

create table if not exists training.questions (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references training.modules(id) on delete cascade,
  position    integer not null default 0,
  prompt      text not null check (length(btrim(prompt)) > 0),
  kind        text not null default 'single' check (kind in ('single', 'multi')),
  options     jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  correct     integer[] not null check (cardinality(correct) >= 1),
  explanation text,
  points      integer not null default 1 check (points between 1 and 10)
);
create index if not exists questions_module_idx on training.questions (module_id, position);

create table if not exists training.paths (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  roster_groups     text[],      -- null = every group
  designation_codes text[],      -- null = every designation
  outlet_ids        text[],      -- null = every outlet
  due_days          integer not null default 7 check (due_days between 1 and 365),
  is_active         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists training.path_modules (
  path_id   uuid not null references training.paths(id) on delete cascade,
  module_id uuid not null references training.modules(id) on delete cascade,
  position  integer not null default 0,
  primary key (path_id, module_id)
);

create table if not exists training.assignments (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references core.employees(id) on delete cascade,
  module_id        uuid not null references training.modules(id) on delete cascade,
  path_id          uuid references training.paths(id) on delete set null,
  source           text not null default 'manual' check (source in ('path', 'manual')),
  assigned_by      uuid,
  assigned_at      timestamptz not null default now(),
  due_on           date,
  status           text not null default 'assigned'
                     check (status in ('assigned', 'in_progress', 'passed', 'failed')),
  attempts         integer not null default 0,
  first_score      numeric(5,2),
  best_score       numeric(5,2),
  passed_at        timestamptz,
  last_activity_at timestamptz,
  unique (employee_id, module_id)
);
create index if not exists assignments_emp_idx on training.assignments (employee_id);
create index if not exists assignments_module_idx on training.assignments (module_id);

create table if not exists training.lesson_views (
  assignment_id uuid not null references training.assignments(id) on delete cascade,
  lesson_id     uuid not null references training.lessons(id) on delete cascade,
  viewed_at     timestamptz not null default now(),
  primary key (assignment_id, lesson_id)
);

create table if not exists training.attempts (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references training.assignments(id) on delete cascade,
  submitted_at  timestamptz not null default now(),
  correct       integer not null,
  total         integer not null,
  score         numeric(5,2) not null,
  passed        boolean not null,
  answers       jsonb not null default '{}'::jsonb
);
create index if not exists attempts_assignment_idx on training.attempts (assignment_id, submitted_at);

alter table training.modules      enable row level security;
alter table training.lessons      enable row level security;
alter table training.questions    enable row level security;
alter table training.paths        enable row level security;
alter table training.path_modules enable row level security;
alter table training.assignments  enable row level security;
alter table training.lesson_views enable row level security;
alter table training.attempts     enable row level security;

-- ---------------------------------------------------------------- helpers

create or replace function training.me()
returns uuid language sql stable security definer set search_path to 'core', 'public' as $$
  select id from core.employees where user_id = auth.uid() and deleted_at is null
  order by is_active desc limit 1
$$;

create or replace function training.is_admin()
returns boolean language sql stable security definer set search_path to 'core', 'public' as $$
  select coalesce(core.is_admin(), false) or coalesce(core.has_role('hr'), false)
$$;

create or replace function training.require_admin()
returns void language plpgsql stable security definer set search_path to 'core', 'public' as $$
begin
  if not training.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end $$;

-- Save a whole module (fields + lessons + questions) from one JSON document.
-- Lessons and questions that carry an id are updated in place (so progress
-- and history survive edits); ones missing from the document are removed.
create or replace function training.save_module_doc(p jsonb, p_by uuid)
returns uuid language plpgsql security definer set search_path to 'training', 'public' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_keep_l uuid[] := '{}';
  v_keep_q uuid[] := '{}';
  l jsonb; q jsonb; v_lid uuid; v_qid uuid; i int;
begin
  if v_id is null and p ? 'code' then
    select id into v_id from training.modules where code = p ->> 'code';
  end if;
  if v_id is null then
    insert into training.modules (code, title, summary, kind, cover_url, source_url, recipe_card_key,
                                  est_minutes, pass_mark, is_active, sort_order, created_by)
    values (nullif(p ->> 'code', ''), p ->> 'title', p ->> 'summary', coalesce(p ->> 'kind', 'other'),
            nullif(p ->> 'cover_url', ''), nullif(p ->> 'source_url', ''), nullif(p ->> 'recipe_card_key', ''),
            coalesce((p ->> 'est_minutes')::int, 10), coalesce((p ->> 'pass_mark')::int, 70),
            coalesce((p ->> 'is_active')::boolean, true), coalesce((p ->> 'sort_order')::int, 0), p_by)
    returning id into v_id;
  else
    update training.modules set
      code = nullif(p ->> 'code', ''), title = p ->> 'title', summary = p ->> 'summary',
      kind = coalesce(p ->> 'kind', kind), cover_url = nullif(p ->> 'cover_url', ''),
      source_url = nullif(p ->> 'source_url', ''), recipe_card_key = nullif(p ->> 'recipe_card_key', ''),
      est_minutes = coalesce((p ->> 'est_minutes')::int, est_minutes),
      pass_mark = coalesce((p ->> 'pass_mark')::int, pass_mark),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      sort_order = coalesce((p ->> 'sort_order')::int, sort_order),
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  i := 0;
  for l in select * from jsonb_array_elements(coalesce(p -> 'lessons', '[]'::jsonb)) loop
    i := i + 1;
    v_lid := nullif(l ->> 'id', '')::uuid;
    if v_lid is not null and exists (select 1 from training.lessons where id = v_lid and module_id = v_id) then
      update training.lessons set position = i, kind = coalesce(l ->> 'kind', 'text'), title = l ->> 'title',
             body = l ->> 'body', media_url = nullif(l ->> 'media_url', ''),
             data = coalesce(l -> 'data', '{}'::jsonb)
       where id = v_lid;
    else
      insert into training.lessons (module_id, position, kind, title, body, media_url, data)
      values (v_id, i, coalesce(l ->> 'kind', 'text'), l ->> 'title', l ->> 'body',
              nullif(l ->> 'media_url', ''), coalesce(l -> 'data', '{}'::jsonb))
      returning id into v_lid;
    end if;
    v_keep_l := v_keep_l || v_lid;
  end loop;
  delete from training.lessons where module_id = v_id and not (id = any (v_keep_l));

  i := 0;
  for q in select * from jsonb_array_elements(coalesce(p -> 'questions', '[]'::jsonb)) loop
    i := i + 1;
    v_qid := nullif(q ->> 'id', '')::uuid;
    if v_qid is not null and exists (select 1 from training.questions where id = v_qid and module_id = v_id) then
      update training.questions set position = i, prompt = q ->> 'prompt',
             kind = coalesce(q ->> 'kind', 'single'), options = q -> 'options',
             correct = array(select jsonb_array_elements_text(q -> 'correct')::int),
             explanation = q ->> 'explanation', points = coalesce((q ->> 'points')::int, 1)
       where id = v_qid;
    else
      insert into training.questions (module_id, position, prompt, kind, options, correct, explanation, points)
      values (v_id, i, q ->> 'prompt', coalesce(q ->> 'kind', 'single'), q -> 'options',
              array(select jsonb_array_elements_text(q -> 'correct')::int),
              q ->> 'explanation', coalesce((q ->> 'points')::int, 1))
      returning id into v_qid;
    end if;
    v_keep_q := v_keep_q || v_qid;
  end loop;
  delete from training.questions where module_id = v_id and not (id = any (v_keep_q));

  return v_id;
end $$;

-- Give each active employee every module of every active path that matches
-- their roster group, designation and outlet. Never removes anything.
create or replace function training.sync_paths(p_emp uuid default null)
returns integer language plpgsql security definer set search_path to 'training', 'core', 'public' as $$
declare n integer;
begin
  insert into training.assignments (employee_id, module_id, path_id, source, due_on)
  select e.id, pm.module_id, p.id, 'path',
         greatest(coalesce(e.hired_on, current_date), current_date) + p.due_days
  from core.employees e
  left join core.designations d on d.code = e.designation_code
  join training.paths p on p.is_active
   and (p.roster_groups is null or d.roster_group = any (p.roster_groups))
   and (p.designation_codes is null or e.designation_code = any (p.designation_codes))
   and (p.outlet_ids is null or e.outlet_id = any (p.outlet_ids))
  join training.path_modules pm on pm.path_id = p.id
  join training.modules m on m.id = pm.module_id and m.is_active
  where e.is_active and e.deleted_at is null and (p_emp is null or e.id = p_emp)
  on conflict (employee_id, module_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function training.on_employee_change()
returns trigger language plpgsql security definer set search_path to 'training', 'core', 'public' as $$
begin
  perform training.sync_paths(new.id);
  return new;
end $$;

drop trigger if exists training_sync_on_employee on core.employees;
create trigger training_sync_on_employee
  after insert or update of designation_code, outlet_id, is_active on core.employees
  for each row when (new.is_active and new.deleted_at is null)
  execute function training.on_employee_change();

-- Per-employee summary used by the admin overview and employee report.
create or replace function training.employee_summary(p_emp uuid default null)
returns table (employee_id uuid, assigned int, passed int, overdue int, in_progress int,
               avg_first numeric, score numeric, last_activity timestamptz)
language sql stable security definer set search_path to 'training', 'public' as $$
  select a.employee_id,
         count(*)::int,
         count(*) filter (where a.status = 'passed')::int,
         count(*) filter (where a.status <> 'passed' and a.due_on < current_date)::int,
         count(*) filter (where a.status in ('in_progress', 'failed'))::int,
         round(avg(a.first_score), 1),
         round(avg(coalesce(a.best_score, 0)) filter (
           where a.status = 'passed' or a.attempts > 0 or a.due_on < current_date), 1),
         max(a.last_activity_at)
  from training.assignments a
  join training.modules m on m.id = a.module_id and m.is_active
  where p_emp is null or a.employee_id = p_emp
  group by a.employee_id
$$;

-- ------------------------------------------------------- employee functions

create or replace function public.training_my_modules()
returns jsonb language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'assignment_id', a.id, 'module_id', m.id, 'title', m.title, 'summary', m.summary,
           'kind', m.kind, 'cover_url', m.cover_url, 'est_minutes', m.est_minutes,
           'pass_mark', m.pass_mark, 'due_on', a.due_on, 'status', a.status,
           'attempts', a.attempts, 'best_score', a.best_score,
           'lessons', (select count(*) from training.lessons l where l.module_id = m.id),
           'viewed', (select count(*) from training.lesson_views v where v.assignment_id = a.id),
           'questions', (select count(*) from training.questions q where q.module_id = m.id))
         order by (a.status = 'passed'), a.due_on nulls last, m.sort_order, m.title), '[]'::jsonb)
  from training.assignments a
  join training.modules m on m.id = a.module_id and m.is_active
  where a.employee_id = training.me()
$$;

-- A module as the employee sees it: lessons and questions, never answers.
-- Admins can open any module (preview) without an assignment.
create or replace function public.training_module_for_me(p_module uuid)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare
  a training.assignments%rowtype;
  r jsonb;
begin
  select * into a from training.assignments where module_id = p_module and employee_id = training.me();
  if a.id is null and not training.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'id', m.id, 'title', m.title, 'summary', m.summary, 'kind', m.kind, 'cover_url', m.cover_url,
    'source_url', m.source_url, 'recipe_card_key', m.recipe_card_key, 'est_minutes', m.est_minutes,
    'pass_mark', m.pass_mark,
    'assignment', case when a.id is null then null else jsonb_build_object(
       'id', a.id, 'status', a.status, 'due_on', a.due_on, 'attempts', a.attempts,
       'best_score', a.best_score) end,
    'viewed', coalesce((select jsonb_agg(v.lesson_id) from training.lesson_views v where v.assignment_id = a.id), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'title', l.title,
                 'body', l.body, 'media_url', l.media_url, 'data', l.data) order by l.position)
                 from training.lessons l where l.module_id = m.id), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'kind', q.kind,
                 'options', q.options) order by q.position)
                 from training.questions q where q.module_id = m.id), '[]'::jsonb))
  into r
  from training.modules m where m.id = p_module and (m.is_active or training.is_admin());
  if r is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return r;
end $$;

create or replace function public.training_view_lesson(p_module uuid, p_lesson uuid)
returns void language plpgsql security definer set search_path to 'training', 'core', 'public' as $$
declare v_a uuid;
begin
  select id into v_a from training.assignments where module_id = p_module and employee_id = training.me();
  if v_a is null then return; end if;   -- admin preview: nothing to record
  if not exists (select 1 from training.lessons where id = p_lesson and module_id = p_module) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into training.lesson_views (assignment_id, lesson_id) values (v_a, p_lesson)
  on conflict do nothing;
  update training.assignments
     set last_activity_at = now(), status = case when status = 'assigned' then 'in_progress' else status end
   where id = v_a;
end $$;

-- Grade a quiz. p_answers = {"<question id>": [option index, ...], ...}.
-- The right answers are only returned once the module is passed.
create or replace function public.training_submit(p_module uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path to 'training', 'core', 'public' as $$
declare
  a training.assignments%rowtype;
  m training.modules%rowtype;
  v_total int := 0; v_got int := 0; v_correct int := 0; v_n int := 0;
  v_score numeric; v_passed boolean;
  q record; v_given int[]; v_ok boolean;
  v_results jsonb := '[]'::jsonb;
begin
  select * into a from training.assignments where module_id = p_module and employee_id = training.me() for update;
  if a.id is null then
    raise exception 'NOT_ASSIGNED' using errcode = 'P0001';
  end if;
  select * into m from training.modules where id = p_module;
  for q in select * from training.questions where module_id = p_module order by position loop
    v_n := v_n + 1;
    v_given := array(select x::int from jsonb_array_elements_text(coalesce(p_answers -> q.id::text, '[]'::jsonb)) x order by 1);
    v_ok := v_given = array(select x from unnest(q.correct) x order by 1);
    v_total := v_total + q.points;
    if v_ok then v_got := v_got + q.points; v_correct := v_correct + 1; end if;
    v_results := v_results || jsonb_build_object('question_id', q.id, 'correct', v_ok, 'explanation', q.explanation,
                                                 'answer', to_jsonb(q.correct));
  end loop;
  if v_n = 0 then
    raise exception 'NO_QUESTIONS' using errcode = 'P0001';
  end if;
  v_score := round(100.0 * v_got / v_total, 2);
  v_passed := v_score >= m.pass_mark;

  insert into training.attempts (assignment_id, correct, total, score, passed, answers)
  values (a.id, v_correct, v_n, v_score, v_passed, coalesce(p_answers, '{}'::jsonb));

  update training.assignments set
    attempts = attempts + 1,
    first_score = coalesce(first_score, v_score),
    best_score = greatest(coalesce(best_score, 0), v_score),
    status = case when status = 'passed' or v_passed then 'passed' else 'failed' end,
    passed_at = case when passed_at is null and v_passed then now() else passed_at end,
    last_activity_at = now()
  where id = a.id;

  if not v_passed then
    -- Not passed: say which were wrong, but not the answer or its explanation.
    v_results := (select coalesce(jsonb_agg(case when (r ->> 'correct')::boolean then r - 'answer'
                                                 else r - 'answer' - 'explanation' end), '[]'::jsonb)
                  from jsonb_array_elements(v_results) r);
  end if;
  return jsonb_build_object('score', v_score, 'passed', v_passed, 'correct', v_correct, 'total', v_n,
                            'pass_mark', m.pass_mark, 'results', v_results);
end $$;

-- ---------------------------------------------------------- admin functions

create or replace function public.training_admin_modules()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'code', m.code, 'title', m.title, 'summary', m.summary, 'kind', m.kind,
      'is_active', m.is_active, 'est_minutes', m.est_minutes, 'pass_mark', m.pass_mark,
      'recipe_card_key', m.recipe_card_key, 'updated_at', m.updated_at,
      'lessons', (select count(*) from training.lessons l where l.module_id = m.id),
      'questions', (select count(*) from training.questions q where q.module_id = m.id),
      'assigned', (select count(*) from training.assignments a where a.module_id = m.id),
      'passed', (select count(*) from training.assignments a where a.module_id = m.id and a.status = 'passed'),
      'avg_score', (select round(avg(a.best_score), 1) from training.assignments a where a.module_id = m.id and a.attempts > 0))
    order by m.is_active desc, m.sort_order, m.title), '[]'::jsonb) from training.modules m);
end $$;

create or replace function public.training_admin_module(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'public' as $$
declare r jsonb;
begin
  perform training.require_admin();
  select to_jsonb(m) || jsonb_build_object(
    'lessons', coalesce((select jsonb_agg(to_jsonb(l) - 'module_id' order by l.position) from training.lessons l where l.module_id = m.id), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(to_jsonb(q) - 'module_id' order by q.position) from training.questions q where q.module_id = m.id), '[]'::jsonb))
  into r from training.modules m where m.id = p_id;
  if r is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return r;
end $$;

create or replace function public.training_save_module(p jsonb)
returns uuid language plpgsql security definer set search_path to 'training', 'public' as $$
declare v uuid;
begin
  perform training.require_admin();
  v := training.save_module_doc(p, auth.uid());
  perform training.sync_paths();
  return v;
end $$;

create or replace function public.training_admin_paths()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  return (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'module_ids', coalesce((select jsonb_agg(pm.module_id order by pm.position) from training.path_modules pm where pm.path_id = p.id), '[]'::jsonb))
    order by p.is_active desc, p.name), '[]'::jsonb) from training.paths p);
end $$;

create or replace function public.training_save_path(p jsonb)
returns uuid language plpgsql security definer set search_path to 'training', 'public' as $$
declare v uuid := nullif(p ->> 'id', '')::uuid; i int := 0; mid text;
begin
  perform training.require_admin();
  if v is null then
    insert into training.paths (name, description, due_days, is_active)
    values (p ->> 'name', p ->> 'description', coalesce((p ->> 'due_days')::int, 7), coalesce((p ->> 'is_active')::boolean, false))
    returning id into v;
  else
    update training.paths set name = p ->> 'name', description = p ->> 'description',
      due_days = coalesce((p ->> 'due_days')::int, due_days),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active), updated_at = now()
    where id = v;
  end if;
  update training.paths set
    roster_groups = case when jsonb_typeof(p -> 'roster_groups') = 'array' and jsonb_array_length(p -> 'roster_groups') > 0
                         then array(select jsonb_array_elements_text(p -> 'roster_groups')) end,
    designation_codes = case when jsonb_typeof(p -> 'designation_codes') = 'array' and jsonb_array_length(p -> 'designation_codes') > 0
                         then array(select jsonb_array_elements_text(p -> 'designation_codes')) end,
    outlet_ids = case when jsonb_typeof(p -> 'outlet_ids') = 'array' and jsonb_array_length(p -> 'outlet_ids') > 0
                         then array(select jsonb_array_elements_text(p -> 'outlet_ids')) end
  where id = v;
  delete from training.path_modules where path_id = v;
  for mid in select jsonb_array_elements_text(coalesce(p -> 'module_ids', '[]'::jsonb)) loop
    i := i + 1;
    insert into training.path_modules (path_id, module_id, position) values (v, mid::uuid, i)
    on conflict do nothing;
  end loop;
  perform training.sync_paths();
  return v;
end $$;

create or replace function public.training_delete_path(p_id uuid)
returns void language plpgsql security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  delete from training.paths where id = p_id;   -- assignments stay (path_id set null)
end $$;

create or replace function public.training_assign(p_module uuid, p_employee_ids uuid[], p_due date default null)
returns integer language plpgsql security definer set search_path to 'training', 'core', 'public' as $$
declare n int;
begin
  perform training.require_admin();
  insert into training.assignments (employee_id, module_id, source, assigned_by, due_on)
  select e.id, p_module, 'manual', auth.uid(), coalesce(p_due, current_date + 7)
  from core.employees e where e.id = any (p_employee_ids) and e.deleted_at is null
  on conflict (employee_id, module_id) do update set due_on = excluded.due_on
    where training.assignments.status <> 'passed';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.training_unassign(p_assignment uuid)
returns void language plpgsql security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  delete from training.assignments where id = p_assignment;
end $$;

-- Everyone with training, worst first, for the admin "Scores" view.
create or replace function public.training_admin_overview()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
begin
  perform training.require_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', e.id, 'employee_code', e.employee_code, 'name', e.full_name,
      'outlet_id', e.outlet_id, 'outlet', o.display_name, 'designation', d.name,
      'hired_on', e.hired_on, 'assigned', s.assigned, 'passed', s.passed, 'overdue', s.overdue,
      'in_progress', s.in_progress, 'avg_first', s.avg_first, 'score', s.score,
      'last_activity', s.last_activity)
    order by s.overdue desc, s.score asc nulls first, e.full_name), '[]'::jsonb)
    from training.employee_summary() s
    join core.employees e on e.id = s.employee_id and e.is_active and e.deleted_at is null
    left join public.flax_outlets o on o.id = e.outlet_id
    left join core.designations d on d.code = e.designation_code);
end $$;

create or replace function public.training_employee_detail(p_emp uuid)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
begin
  perform training.require_admin();
  return jsonb_build_object(
    'summary', (select to_jsonb(s) from training.employee_summary(p_emp) s),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'module_id', m.id, 'title', m.title, 'kind', m.kind, 'status', a.status,
        'due_on', a.due_on, 'attempts', a.attempts, 'first_score', a.first_score,
        'best_score', a.best_score, 'passed_at', a.passed_at, 'source', a.source,
        'lessons', (select count(*) from training.lessons l where l.module_id = m.id),
        'viewed', (select count(*) from training.lesson_views v where v.assignment_id = a.id),
        'history', (select coalesce(jsonb_agg(jsonb_build_object('at', t.submitted_at, 'score', t.score, 'passed', t.passed)
                     order by t.submitted_at), '[]'::jsonb) from training.attempts t where t.assignment_id = a.id))
      order by a.due_on nulls last, m.title), '[]'::jsonb)
      from training.assignments a join training.modules m on m.id = a.module_id
      where a.employee_id = p_emp));
end $$;

-- ------------------------------------------------- outlet scores and awards
--
-- Outlet training score = average training score of its active staff.
-- Completion = modules passed / modules that are due (or already passed).

create or replace function training.outlet_summary()
returns table (outlet_id text, staff int, trained_staff int, assigned int, passed int,
               completion numeric, overdue int, score numeric)
language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  with a as (
    select e.outlet_id, a.employee_id, a.status, a.due_on
    from training.assignments a
    join training.modules m on m.id = a.module_id and m.is_active
    join core.employees e on e.id = a.employee_id and e.is_active and e.deleted_at is null
  ), s as (
    select e.outlet_id, s.employee_id, s.score, s.passed, s.assigned
    from training.employee_summary() s
    join core.employees e on e.id = s.employee_id and e.is_active and e.deleted_at is null
  )
  select o.outlet_id,
         (select count(*) from core.employees e where e.outlet_id = o.outlet_id and e.is_active and e.deleted_at is null)::int,
         (select count(*) from s where s.outlet_id = o.outlet_id and s.passed = s.assigned)::int,
         (select count(*) from a where a.outlet_id = o.outlet_id)::int,
         (select count(*) from a where a.outlet_id = o.outlet_id and a.status = 'passed')::int,
         (select round(100.0 * count(*) filter (where a.status = 'passed')
                 / nullif(count(*) filter (where a.status = 'passed' or a.due_on <= current_date), 0), 1)
            from a where a.outlet_id = o.outlet_id),
         (select count(*) from a where a.outlet_id = o.outlet_id and a.status <> 'passed' and a.due_on < current_date)::int,
         (select round(avg(s.score), 1) from s where s.outlet_id = o.outlet_id)
  from (select distinct outlet_id from a where outlet_id is not null) o
$$;

create or replace function public.training_outlet_scores()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
begin
  perform training.require_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'outlet_id', s.outlet_id, 'outlet', fo.display_name, 'staff', s.staff,
      'trained_staff', s.trained_staff, 'assigned', s.assigned, 'passed', s.passed,
      'completion', s.completion, 'overdue', s.overdue, 'score', s.score)
    order by s.score desc nulls last, s.completion desc nulls last), '[]'::jsonb)
    from training.outlet_summary() s
    left join public.flax_outlets fo on fo.id = s.outlet_id);
end $$;

-- Monthly awards: best-trained outlet (highest score with at least 80%
-- completion) and top learners (modules passed that month, ranked by
-- first-attempt score, then by how many they passed).
create or replace function public.training_awards(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_to date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month')::date;
begin
  perform training.require_admin();
  return jsonb_build_object(
    'month', v_from,
    'best_outlet', (select jsonb_build_object('outlet_id', s.outlet_id, 'outlet', fo.display_name,
                       'score', s.score, 'completion', s.completion)
                    from training.outlet_summary() s left join public.flax_outlets fo on fo.id = s.outlet_id
                    where s.completion >= 80 and s.score is not null
                    order by s.score desc, s.completion desc limit 1),
    'top_learners', (select coalesce(jsonb_agg(x order by x.rk), '[]'::jsonb) from (
        select row_number() over (order by avg(a.first_score) desc, count(*) desc, min(a.passed_at)) rk,
               e.id employee_id, e.full_name name, e.employee_code, fo.display_name outlet,
               count(*) modules_passed, round(avg(a.first_score), 1) first_try_score
        from training.assignments a
        join core.employees e on e.id = a.employee_id and e.is_active and e.deleted_at is null
        left join public.flax_outlets fo on fo.id = e.outlet_id
        where a.passed_at >= v_from and a.passed_at < v_to
        group by e.id, e.full_name, e.employee_code, fo.display_name
        order by avg(a.first_score) desc, count(*) desc, min(a.passed_at)
        limit 5) x));
end $$;

-- Rows for command's outlet scoring (cmd_metric_daily, domain 'people'),
-- keyed by the Petpooja restaurant id command uses for outlets. Only the
-- nightly push (service role) can call this.
create or replace function public.training_outlet_kpis()
returns table (outlet_id text, kpi_key text, value numeric, unit text)
language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  select m.rest_id, k.kpi_key, k.value, k.unit
  from training.outlet_summary() s
  join core.petpooja_outlet_map m on m.outlet_id = s.outlet_id
  cross join lateral (values
    ('training_score', s.score, 'pct'),
    ('training_completion', s.completion, 'pct'),
    ('training_overdue', s.overdue::numeric, 'count')) k(kpi_key, value, unit)
  where k.value is not null
$$;
revoke all on function public.training_outlet_kpis() from public, anon, authenticated;
grant execute on function public.training_outlet_kpis() to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'training_outlet_scores()', 'training_awards(date)',
    'training_my_modules()', 'training_module_for_me(uuid)', 'training_view_lesson(uuid, uuid)',
    'training_submit(uuid, jsonb)', 'training_admin_modules()', 'training_admin_module(uuid)',
    'training_save_module(jsonb)', 'training_admin_paths()', 'training_save_path(jsonb)',
    'training_delete_path(uuid)', 'training_assign(uuid, uuid[], date)', 'training_unassign(uuid)',
    'training_admin_overview()', 'training_employee_detail(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
