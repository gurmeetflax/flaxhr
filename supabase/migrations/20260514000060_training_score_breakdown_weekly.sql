-- Training: how a score was made, and a weekly WhatsApp summary for HR.
--
-- 1. training_score_breakdown(emp): every module with the points it gave
--    (quiz score + 50 first try + 25 on time), the attempts, and each badge
--    with the reason it was or was not earned. Staff can open their own;
--    admins, HR and viewers can open anyone's.
-- 2. training_weekly_summary(): the week's numbers for the Core Managers group,
--    and training_month_winners_announce(): last month's top 3, posted on the 1st
--    (service role only; called by the training-weekly-whatsapp function).
--    A Monday cron sends it.

create or replace function public.training_score_breakdown(p_emp uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare
  v_emp uuid := coalesce(p_emp, training.me());
  v_month date := date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)::date;
  p record;
  v_rows jsonb;
begin
  if v_emp is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_emp is distinct from training.me() then
    perform training.require_viewer();
  end if;

  select * into p from training.points_table() t where t.employee_id = v_emp;

  select coalesce(jsonb_agg(x.j order by x.passed_at desc nulls last, x.title), '[]'::jsonb) into v_rows
  from (
    select a.passed_at, m.title, jsonb_build_object(
      'assignment_id', a.id, 'module_id', m.id, 'title', m.title, 'kind', m.kind, 'status', a.status,
      'pass_mark', m.pass_mark, 'due_on', a.due_on, 'passed_at', a.passed_at, 'attempts', a.attempts,
      'first_score', a.first_score, 'best_score', a.best_score,
      'quiz_points', case when a.status = 'passed' then round(coalesce(a.best_score, 0))::int else 0 end,
      'first_try_points', case when a.status = 'passed' and a.first_score >= m.pass_mark then 50 else 0 end,
      'on_time_points', case when a.status = 'passed' and (a.due_on is null or a.passed_at::date <= a.due_on) then 25 else 0 end,
      'points', training.assignment_points(a, m.pass_mark),
      'this_month', a.status = 'passed' and a.passed_at >= v_month,
      'lessons', (select count(*) from training.lessons l where l.module_id = m.id),
      'viewed', (select count(*) from training.lesson_views v where v.assignment_id = a.id),
      'history', (select coalesce(jsonb_agg(jsonb_build_object('at', t.submitted_at, 'score', t.score,
                    'correct', t.correct, 'total', t.total, 'passed', t.passed) order by t.submitted_at), '[]'::jsonb)
                  from training.attempts t where t.assignment_id = a.id)) j
    from training.assignments a
    join training.modules m on m.id = a.module_id and m.is_active
    where a.employee_id = v_emp
  ) x;

  return jsonb_build_object(
    'employee', (select jsonb_build_object('id', e.id, 'name', e.full_name, 'employee_code', e.employee_code,
                   'outlet', coalesce(o.display_name, o.name))
                 from core.employees e left join public.flax_outlets o on o.id = e.outlet_id where e.id = v_emp),
    'points', coalesce(p.points, 0),
    'level', case when coalesce(p.points, 0) >= 1000 then 'Champion' when coalesce(p.points, 0) >= 500 then 'Pro'
                  when coalesce(p.points, 0) >= 200 then 'Learner' else 'Starter' end,
    'passed', coalesce(p.passed, 0), 'assigned', coalesce(p.assigned, 0),
    'month', v_month,
    'month_points', (select b.points from training.month_board(v_month) b where b.employee_id = v_emp),
    'month_rank', (select b.rk from training.month_board(v_month) b where b.employee_id = v_emp),
    'modules', v_rows,
    'badges', jsonb_build_array(
      jsonb_build_object('key', 'first_pass', 'name', 'First step', 'earned', coalesce(p.passed, 0) >= 1,
        'why', case when coalesce(p.passed, 0) >= 1
                    then 'First module passed: ' || (select m.title || ' on ' || to_char(a.passed_at at time zone 'Asia/Kolkata', 'DD Mon')
                           from training.assignments a join training.modules m on m.id = a.module_id and m.is_active
                           where a.employee_id = v_emp and a.status = 'passed' order by a.passed_at limit 1)
                    else 'No module passed yet' end),
      jsonb_build_object('key', 'first_try', 'name', 'Sharp', 'earned', coalesce(p.first_try, 0) >= 1,
        'why', case when coalesce(p.first_try, 0) >= 1
                    then 'Passed first try: ' || (select string_agg(m.title, ', ' order by a.passed_at)
                           from training.assignments a join training.modules m on m.id = a.module_id and m.is_active
                           where a.employee_id = v_emp and a.first_score >= m.pass_mark)
                    else 'No quiz passed on the first try yet' end),
      jsonb_build_object('key', 'perfect', 'name', 'Perfect score', 'earned', coalesce(p.perfect, 0) >= 1,
        'why', case when coalesce(p.perfect, 0) >= 1
                    then '100% on: ' || (select string_agg(m.title, ', ' order by a.passed_at)
                           from training.assignments a join training.modules m on m.id = a.module_id and m.is_active
                           where a.employee_id = v_emp and a.best_score >= 100)
                    else 'No 100% score yet' end),
      jsonb_build_object('key', 'on_time', 'name', 'On time', 'earned', coalesce(p.on_time, 0) >= 3,
        'why', coalesce(p.on_time, 0) || ' module' || case when coalesce(p.on_time, 0) = 1 then '' else 's' end
               || ' finished by the due date (3 needed)'),
      jsonb_build_object('key', 'safety', 'name', 'Safety star',
        'earned', coalesce(p.safety_total, 0) > 0 and p.safety_passed = p.safety_total,
        'why', case when coalesce(p.safety_total, 0) = 0 then 'No food safety or SOP module assigned'
                    else coalesce(p.safety_passed, 0) || ' of ' || p.safety_total || ' food safety and SOP modules passed' end),
      jsonb_build_object('key', 'all_done', 'name', 'All done',
        'earned', coalesce(p.assigned, 0) > 0 and p.passed = p.assigned,
        'why', coalesce(p.passed, 0) || ' of ' || coalesce(p.assigned, 0) || ' modules passed')));
end $$;

revoke all on function public.training_score_breakdown(uuid) from public, anon;
grant execute on function public.training_score_breakdown(uuid) to authenticated;

-- Weekly summary for the Core Managers WhatsApp group. Window = the last p_days
-- days up to now (IST). Points "this week" = points from modules passed in
-- the window.
create or replace function public.training_weekly_summary(p_days int default 7)
returns jsonb language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  with w as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 31))) f, now() t,
           date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)::date mo
  ), staff as (
    select e.id, e.full_name, e.outlet_id from core.employees e where e.is_active and e.deleted_at is null
  ), a as (
    select a.*, m.pass_mark, s.full_name, s.outlet_id
    from training.assignments a
    join training.modules m on m.id = a.module_id and m.is_active
    join staff s on s.id = a.employee_id
  ), wk as (
    select a.employee_id, a.full_name, a.outlet_id,
           sum(training.assignment_points(ta, a.pass_mark))::int points, count(*)::int passed
    from a join training.assignments ta on ta.id = a.id, w
    where a.status = 'passed' and a.passed_at >= w.f and a.passed_at < w.t
    group by 1, 2, 3
  ), od as (
    select a.employee_id, a.full_name, a.outlet_id, count(*)::int n
    from a where a.status <> 'passed' and a.due_on < (now() at time zone 'Asia/Kolkata')::date
    group by 1, 2, 3
  )
  select jsonb_build_object(
    'from', (select f from w), 'to', (select t from w), 'month', (select mo from w),
    'staff', (select count(*) from staff where id in (select employee_id from a)),
    'passed', (select coalesce(sum(passed), 0) from wk),
    'learners', (select count(*) from wk),
    'attempts', (select count(*) from training.attempts t join a on a.id = t.assignment_id, w
                 where t.submitted_at >= w.f and t.submitted_at < w.t),
    'active', (select count(distinct a.employee_id) from a, w where a.last_activity_at >= w.f),
    'completion', (select round(100.0 * count(*) filter (where status = 'passed') / nullif(count(*), 0), 1) from a),
    'overdue_people', (select count(*) from od),
    'overdue_modules', (select coalesce(sum(n), 0) from od),
    'not_started', (select count(*) from staff s
                    where exists (select 1 from a where a.employee_id = s.id)
                      and not exists (select 1 from a join training.lesson_views v on v.assignment_id = a.id where a.employee_id = s.id)),
    'top_week', (select coalesce(jsonb_agg(jsonb_build_object('name', x.full_name, 'outlet', coalesce(o.display_name, o.name),
                   'points', x.points, 'passed', x.passed) order by x.points desc, x.full_name), '[]'::jsonb)
                 from (select * from wk order by points desc, full_name limit 5) x
                 left join public.flax_outlets o on o.id = x.outlet_id),
    'month_top', (select coalesce(jsonb_agg(jsonb_build_object('rank', b.rk, 'name', e.full_name,
                    'outlet', coalesce(o.display_name, o.name), 'points', b.points, 'prize', p.title) order by b.rk), '[]'::jsonb)
                  from w, training.month_board(w.mo) b
                  join core.employees e on e.id = b.employee_id
                  left join public.flax_outlets o on o.id = e.outlet_id
                  left join training.prizes p on p.rank = b.rk
                  where b.rk <= 3),
    'most_overdue', (select coalesce(jsonb_agg(jsonb_build_object('name', x.full_name, 'outlet', coalesce(o.display_name, o.name),
                       'overdue', x.n) order by x.n desc, x.full_name), '[]'::jsonb)
                     from (select * from od order by n desc, full_name limit 5) x
                     left join public.flax_outlets o on o.id = x.outlet_id),
    'outlets', (select coalesce(jsonb_agg(jsonb_build_object('outlet', coalesce(o.display_name, o.name, s.outlet_id),
                  'staff', s.staff, 'passed', s.passed, 'assigned', s.assigned,
                  'completion', round(100.0 * s.passed / nullif(s.assigned, 0), 1),
                  'overdue', s.overdue) order by s.passed::numeric / nullif(s.assigned, 0) desc nulls last, s.overdue), '[]'::jsonb)
                from training.outlet_summary() s left join public.flax_outlets o on o.id = s.outlet_id)
  )
$$;

revoke all on function public.training_weekly_summary(int) from public, anon, authenticated;
grant execute on function public.training_weekly_summary(int) to service_role;

-- Monthly winners announcement (service role only): last month's top 3
-- with full names, outlet, points and prize. Default = the previous month.
create or replace function public.training_month_winners_announce(p_month date default null)
returns jsonb language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  with m as (
    select date_trunc('month', coalesce(p_month, ((now() at time zone 'Asia/Kolkata')::date - interval '1 month')::date))::date mo
  )
  select jsonb_build_object(
    'month', (select mo from m),
    'learners', (select count(*) from m, training.month_board(m.mo)),
    'passed', (select coalesce(sum(b.passed), 0) from m, training.month_board(m.mo) b),
    'winners', (select coalesce(jsonb_agg(jsonb_build_object('rank', b.rk, 'name', e.full_name,
                  'outlet', coalesce(o.display_name, o.name), 'points', b.points, 'passed', b.passed,
                  'prize', p.title) order by b.rk), '[]'::jsonb)
                from m, training.month_board(m.mo) b
                join core.employees e on e.id = b.employee_id
                left join public.flax_outlets o on o.id = e.outlet_id
                left join training.prizes p on p.rank = b.rk
                where b.rk <= 3))
$$;
revoke all on function public.training_month_winners_announce(date) from public, anon, authenticated;
grant execute on function public.training_month_winners_announce(date) to service_role;

-- Monday 11:05 IST (05:35 UTC): post the summary to "Flax Core Managers Mumbai".
-- On the 1st, 11:10 IST (05:40 UTC): announce last month's winners there too.
create or replace function public.training_send_weekly_summary(p_dry boolean default false, p_winners boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare k text := (select decrypted_secret from vault.decrypted_secrets where name = 'fp_sync_service_role_key');
begin
  perform net.http_post(
    url := 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/training-weekly-whatsapp',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || k),
    body := jsonb_build_object('dry_run', p_dry, 'monthly_winners', p_winners),
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.training_send_weekly_summary(boolean, boolean) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('training-weekly-whatsapp') where exists (select 1 from cron.job where jobname = 'training-weekly-whatsapp');
  perform cron.schedule('training-weekly-whatsapp', '35 5 * * 1', $c$select public.training_send_weekly_summary()$c$);
  perform cron.unschedule('training-monthly-winners') where exists (select 1 from cron.job where jobname = 'training-monthly-winners');
  perform cron.schedule('training-monthly-winners', '40 5 1 * *', $c$select public.training_send_weekly_summary(false, true)$c$);
end $$;

notify pgrst, 'reload schema';
