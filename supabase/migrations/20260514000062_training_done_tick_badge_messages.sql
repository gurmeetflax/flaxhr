-- Training: a green tick for people who have finished all their training,
-- and a personal WhatsApp message when someone earns a badge or moves up a
-- level.
--
-- "Done" = passed every active module currently assigned to them. A new
-- module takes the tick away until it is passed too.

-- 1. "done" on the staff boards (my outlet, all Flax, monthly prizes) and in
--    the weekly WhatsApp summary.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.training_my_progress()'::regprocedure);
  n := replace(d, 't.points, t.employee_id = v_me me', 't.points, t.employee_id = v_me me, (t.assigned > 0 and t.passed = t.assigned) done');
  n := replace(n, '''points'', x.points, ''me'', x.me)', '''points'', x.points, ''me'', x.me, ''done'', x.done)');
  if (length(n) - length(d)) < 2 * length(', (t.assigned > 0 and t.passed = t.assigned) done') then
    raise exception 'training_my_progress: board text not found';
  end if;
  execute n;

  d := pg_get_functiondef('public.training_month_prizes(date)'::regprocedure);
  n := replace(d, '''rank'', b.rk, ''points'', b.points, ''me'', b.employee_id = v_me,',
    '''rank'', b.rk, ''points'', b.points, ''me'', b.employee_id = v_me,
                ''done'', exists (select 1 from training.points_table() t where t.employee_id = b.employee_id and t.assigned > 0 and t.passed = t.assigned),');
  if n = d then raise exception 'training_month_prizes: board text not found'; end if;
  execute n;

  d := pg_get_functiondef('public.training_weekly_summary(int)'::regprocedure);
  n := replace(d, '''points'', x.points, ''passed'', x.passed)',
    '''points'', x.points, ''passed'', x.passed,
                   ''done'', exists (select 1 from training.points_table() t where t.employee_id = x.employee_id and t.assigned > 0 and t.passed = t.assigned))');
  n := replace(n, '''points'', b.points, ''prize'', p.title)',
    '''points'', b.points, ''prize'', p.title,
                    ''done'', exists (select 1 from training.points_table() t where t.employee_id = b.employee_id and t.assigned > 0 and t.passed = t.assigned))');
  n := replace(n, '''not_started'',', '''all_done'', (select count(*) from training.points_table() t where t.assigned > 0 and t.passed = t.assigned),
    ''not_started'',');
  if position('''all_done''' in n) = 0 or position('x.employee_id and t.assigned' in n) = 0
     or position('b.employee_id and t.assigned' in n) = 0 then
    raise exception 'training_weekly_summary: text not found';
  end if;
  execute n;
end $$;

-- 2. Badge and level messages on WhatsApp.
create table if not exists training.message_log (
  employee_id uuid not null references core.employees(id) on delete cascade,
  key         text not null,          -- badge key, or 'level:Pro'
  sent_at     timestamptz not null default now(),
  primary key (employee_id, key)
);
alter table training.message_log enable row level security;

-- Everything each active employee has earned right now.
create or replace function training.earned_now()
returns table (employee_id uuid, key text)
language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  select t.employee_id, k.key
  from training.points_table() t
  cross join lateral (values
    ('first_pass', t.passed >= 1),
    ('first_try', t.first_try >= 1),
    ('perfect', t.perfect >= 1),
    ('on_time', t.on_time >= 3),
    ('safety', t.safety_total > 0 and t.safety_passed = t.safety_total),
    ('all_done', t.assigned > 0 and t.passed = t.assigned),
    ('level:Learner', t.points >= 200),
    ('level:Pro', t.points >= 500),
    ('level:Champion', t.points >= 1000)) k(key, ok)
  where k.ok
$$;

-- Badges and levels already earned before this goes live count as told, so
-- nobody gets a pile of old news on day one.
insert into training.message_log (employee_id, key)
select employee_id, key from training.earned_now()
on conflict do nothing;

-- New badges / levels to announce (service role only), one row per person.
create or replace function public.training_badge_messages_pending(p_limit int default 30)
returns jsonb language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  with n as (
    select e.employee_id, array_agg(e.key order by e.key) keys
    from training.earned_now() e
    where not exists (select 1 from training.message_log m where m.employee_id = e.employee_id and m.key = e.key)
    group by e.employee_id
  ), mo as (
    select date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)::date mo
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', emp.id, 'first_name', split_part(emp.full_name, ' ', 1), 'phone', emp.phone,
      'keys', n.keys, 'points', t.points, 'passed', t.passed, 'assigned', t.assigned,
      'month_rank', (select b.rk from mo, training.month_board(mo.mo) b where b.employee_id = emp.id))), '[]'::jsonb)
  from (select * from n limit greatest(1, least(coalesce(p_limit, 30), 100))) n
  join core.employees emp on emp.id = n.employee_id
  join training.points_table() t on t.employee_id = n.employee_id
  where coalesce(emp.phone, '') <> ''
$$;

create or replace function public.training_badge_messages_mark(p_employee uuid, p_keys text[])
returns void language sql security definer set search_path to 'training', 'public' as $$
  insert into training.message_log (employee_id, key)
  select p_employee, unnest(p_keys)
  on conflict do nothing
$$;

revoke all on function public.training_badge_messages_pending(int) from public, anon, authenticated;
revoke all on function public.training_badge_messages_mark(uuid, text[]) from public, anon, authenticated;
grant execute on function public.training_badge_messages_pending(int) to service_role;
grant execute on function public.training_badge_messages_mark(uuid, text[]) to service_role;

-- Every 15 minutes from 8:30 am to 9:15 pm IST (03:00-15:45 UTC).
create or replace function public.training_send_badge_messages()
returns void language plpgsql security definer set search_path = public as $$
declare k text := (select decrypted_secret from vault.decrypted_secrets where name = 'fp_sync_service_role_key');
begin
  if not exists (select 1 from training.earned_now() e
                 where not exists (select 1 from training.message_log m where m.employee_id = e.employee_id and m.key = e.key)) then
    return;
  end if;
  perform net.http_post(
    url := 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/training-weekly-whatsapp',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || k),
    body := jsonb_build_object('badge_messages', true),
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.training_send_badge_messages() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('training-badge-messages') where exists (select 1 from cron.job where jobname = 'training-badge-messages');
  perform cron.schedule('training-badge-messages', '*/15 3-15 * * *', $c$select public.training_send_badge_messages()$c$);
end $$;

notify pgrst, 'reload schema';
