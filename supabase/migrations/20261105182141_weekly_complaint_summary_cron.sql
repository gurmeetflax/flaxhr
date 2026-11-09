-- Applied directly to the database on 5 Nov 2026; recorded here so the repo
-- matches the migration history. The key is read from Vault at run time.
create or replace function public.ops_send_weekly_complaint_summaries(p_dry boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
  k text := (select decrypted_secret from vault.decrypted_secrets where name = 'fp_sync_service_role_key');
begin
  for r in select outlet_id from public.ops_outlet_complaint_summary(now() - interval '7 days') where total > 0 loop
    perform net.http_post(
      url := 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/complaint-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || k),
      body := jsonb_build_object('weekly_summary', true, 'outlet', r.outlet_id, 'dry_run', p_dry),
      timeout_milliseconds := 120000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.ops_send_weekly_complaint_summaries(boolean) from public, anon, authenticated;
select cron.schedule('complaint-weekly-summary-mon4pm', '30 10 * * 1', $$select public.ops_send_weekly_complaint_summaries()$$);
