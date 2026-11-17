-- Nightly at 23:15 IST (17:45 UTC): push outlet training numbers into
-- command's outlet scoring (edge function training-kpi-push). The function
-- does nothing until the COMMAND_SERVICE_ROLE_KEY secret is set.
select cron.unschedule('training-kpi-push-nightly')
where exists (select 1 from cron.job where jobname = 'training-kpi-push-nightly');

select cron.schedule('training-kpi-push-nightly', '45 17 * * *', $$
  select net.http_post(
    url := 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/training-kpi-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fp_sync_service_role_key' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
