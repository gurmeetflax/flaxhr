-- Leaderboard rank only once you have points: with nobody trained yet,
-- everyone tied at 0 points was shown "You are #1". Ranks now count only
-- people with points, and someone with 0 points gets no rank.
-- Also: admins can grade a quiz in practice (nothing saved).

create or replace function public.training_my_progress()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare
  v_me uuid := training.me();
  v_outlet text;
  p record;
  v_points int := 0;
begin
  select outlet_id into v_outlet from core.employees where id = v_me;
  select * into p from training.points_table() t where t.employee_id = v_me;
  v_points := coalesce(p.points, 0);
  return jsonb_build_object(
    'points', v_points,
    'level', case when v_points >= 1000 then 'Champion' when v_points >= 500 then 'Pro'
                  when v_points >= 200 then 'Learner' else 'Starter' end,
    'level_floor', case when v_points >= 1000 then 1000 when v_points >= 500 then 500 when v_points >= 200 then 200 else 0 end,
    'next_level', case when v_points >= 1000 then null when v_points >= 500 then 1000 when v_points >= 200 then 500 else 200 end,
    'next_level_name', case when v_points >= 1000 then null when v_points >= 500 then 'Champion'
                            when v_points >= 200 then 'Pro' else 'Learner' end,
    'passed', coalesce(p.passed, 0), 'assigned', coalesce(p.assigned, 0),
    'badges', jsonb_build_array(
      jsonb_build_object('key', 'first_pass', 'name', 'First step', 'hint', 'Pass your first module', 'earned', coalesce(p.passed, 0) >= 1),
      jsonb_build_object('key', 'first_try', 'name', 'Sharp', 'hint', 'Pass a quiz on the first try', 'earned', coalesce(p.first_try, 0) >= 1),
      jsonb_build_object('key', 'perfect', 'name', 'Perfect score', 'hint', 'Score 100% on a quiz', 'earned', coalesce(p.perfect, 0) >= 1),
      jsonb_build_object('key', 'on_time', 'name', 'On time', 'hint', 'Finish 3 modules before they are due', 'earned', coalesce(p.on_time, 0) >= 3),
      jsonb_build_object('key', 'safety', 'name', 'Safety star', 'hint', 'Pass every food safety and SOP module', 'earned', coalesce(p.safety_total, 0) > 0 and p.safety_passed = p.safety_total),
      jsonb_build_object('key', 'all_done', 'name', 'All done', 'hint', 'Finish all your training', 'earned', coalesce(p.assigned, 0) > 0 and p.passed = p.assigned)),
    -- A rank only once you have points (everyone at 0 is not "#1").
    'rank_outlet', case when v_points > 0 then (select r from (select t.employee_id, rank() over (order by t.points desc) r
                      from training.points_table() t join core.employees e on e.id = t.employee_id
                      where e.outlet_id = v_outlet and t.points > 0) x where x.employee_id = v_me) end,
    'rank_company', case when v_points > 0 then (select r from (select t.employee_id, rank() over (order by t.points desc) r
                       from training.points_table() t where t.points > 0) x where x.employee_id = v_me) end,
    'outlet_board', (select coalesce(jsonb_agg(jsonb_build_object('name', x.nm, 'points', x.points, 'me', x.me) order by x.points desc, x.nm), '[]'::jsonb)
                     from (select split_part(e.full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(e.full_name, ' ', 2), ''), 1) || '.', '') nm,
                                  t.points, t.employee_id = v_me me
                           from training.points_table() t join core.employees e on e.id = t.employee_id
                           where e.outlet_id = v_outlet and t.points > 0
                           order by t.points desc limit 5) x),
    'company_board', (select coalesce(jsonb_agg(jsonb_build_object('name', x.nm, 'outlet', x.outlet, 'points', x.points, 'me', x.me) order by x.points desc, x.nm), '[]'::jsonb)
                      from (select split_part(e.full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(e.full_name, ' ', 2), ''), 1) || '.', '') nm,
                                   coalesce(o.display_name, o.name) outlet, t.points, t.employee_id = v_me me
                            from training.points_table() t join core.employees e on e.id = t.employee_id
                            left join public.flax_outlets o on o.id = e.outlet_id
                            where t.points > 0
                            order by t.points desc limit 10) x));
end $$;

-- Admins (who often have no employee record) preview modules unassigned.
-- Let them check a quiz in practice: graded the same way, answers shown,
-- nothing saved and no effect on anyone's scores.
create or replace function public.training_practice_grade(p_module uuid, p_answers jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'public' as $$
declare
  m training.modules%rowtype;
  v_total int := 0; v_got int := 0; v_correct int := 0; v_n int := 0;
  q record; v_given int[]; v_ok boolean;
  v_results jsonb := '[]'::jsonb;
  v_score numeric;
begin
  perform training.require_admin();
  select * into m from training.modules where id = p_module;
  if m.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  for q in select * from training.questions where module_id = p_module order by position loop
    v_n := v_n + 1;
    v_given := array(select x::int from jsonb_array_elements_text(coalesce(p_answers -> q.id::text, '[]'::jsonb)) x order by 1);
    v_ok := v_given = array(select x from unnest(q.correct) x order by 1);
    v_total := v_total + q.points;
    if v_ok then v_got := v_got + q.points; v_correct := v_correct + 1; end if;
    v_results := v_results || jsonb_build_object('question_id', q.id, 'correct', v_ok,
                                                 'explanation', q.explanation, 'answer', to_jsonb(q.correct));
  end loop;
  if v_n = 0 then
    raise exception 'NO_QUESTIONS' using errcode = 'P0001';
  end if;
  v_score := round(100.0 * v_got / v_total, 2);
  return jsonb_build_object('score', v_score, 'passed', v_score >= m.pass_mark, 'correct', v_correct,
                            'total', v_n, 'pass_mark', m.pass_mark, 'results', v_results, 'practice', true);
end $$;

revoke all on function public.training_practice_grade(uuid, jsonb) from public, anon;
grant execute on function public.training_practice_grade(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
