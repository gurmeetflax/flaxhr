-- Flax HR — Card follow-ups
--   * public.delete_card(uuid)  — admin/HR can delete a mistaken card
--   * Weekly cron job that pings a new digest edge function every Monday
--     morning (Asia/Kolkata 09:00 = 03:30 UTC)

----------------------------------------------------------------------------
-- 1. Delete card (admin/HR only)
----------------------------------------------------------------------------
create or replace function public.delete_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  delete from core.cards where id = p_card_id;
end $$;
grant execute on function public.delete_card(uuid) to authenticated;

----------------------------------------------------------------------------
-- 2. Weekly digest view — last 7 days of card activity per employee
----------------------------------------------------------------------------
drop view if exists public.v_cards_weekly_digest;
create view public.v_cards_weekly_digest
with (security_invoker = true) as
  select
    e.id                                                as employee_id,
    e.employee_code,
    e.full_name                                         as employee_name,
    o.display_name                                      as outlet_name,
    count(*) filter (where c.colour = 'yellow')         as yellow_week,
    count(*) filter (where c.colour = 'red')            as red_week,
    count(*) filter (where c.colour = 'green')          as green_week,
    max(c.issued_at)                                    as latest_issued_at
  from core.cards c
  join core.employees e on e.id = c.employee_id
  left join public.flax_outlets o on o.id = e.outlet_id
  where c.issued_at >= now() - interval '7 days'
    and e.deleted_at is null
  group by e.id, e.employee_code, e.full_name, o.display_name;
grant select on public.v_cards_weekly_digest to authenticated;

----------------------------------------------------------------------------
-- 3. Weekly Slack digest — cron entry that calls the edge function
----------------------------------------------------------------------------
do $$
declare
  fn_url text;
begin
  fn_url := 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/cards-weekly-digest';

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cards-weekly-digest';
    perform cron.schedule(
      'cards-weekly-digest',
      '30 3 * * 1',   -- Monday 03:30 UTC = 09:00 IST
      format(
        $sql$select net.http_post(
          url := %L,
          headers := '{"content-type":"application/json"}'::jsonb,
          body := '{}'::jsonb
        )$sql$,
        fn_url
      )
    );
    raise notice 'Scheduled cards-weekly-digest for Mondays 09:00 IST';
  else
    raise notice 'pg_cron not enabled — weekly digest not scheduled';
  end if;
end $$;

notify pgrst, 'reload schema';
