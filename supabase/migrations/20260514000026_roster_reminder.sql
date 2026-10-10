-- Flax HR — managers can roster; daily reminder when rosters are empty
--
-- Rahul Shivtare (FLAX0077) and Raghav Jha (FLAX0159) get the manager
-- role for every outlet (outlet_id null), which the roster RLS already
-- honours. The roster-reminder edge function emails all managers (CC HR)
-- at 09:45 IST whenever the next 7 days aren't fully rostered and
-- published. It reuses the attendance digest's shared cron secret.

insert into core.user_roles (user_id, role, outlet_id)
select e.user_id, 'manager', null
  from core.employees e
 where e.employee_code in ('FLAX0077', 'FLAX0159')
   and e.user_id is not null
   and not exists (
     select 1 from core.user_roles r
      where r.user_id = e.user_id and r.role = 'manager' and r.outlet_id is null and r.deleted_at is null
   );

create or replace function public.fire_roster_reminder()
returns bigint
language plpgsql
security definer
set search_path = core, public, extensions
as $$
declare
  secret text := coalesce(core.get_app_setting('attendance_slack')->>'cron_shared_secret', '');
  req_id bigint;
begin
  select net.http_post(
    url := 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/roster-reminder',
    body := '{}'::jsonb,
    headers := case when secret = '' then '{"content-type":"application/json"}'::jsonb
                    else jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secret) end
  ) into req_id;
  return req_id;
end $$;

revoke all on function public.fire_roster_reminder() from public, anon, authenticated;

select cron.schedule('roster-reminder', '15 4 * * *', 'select public.fire_roster_reminder()');
