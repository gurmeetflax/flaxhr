-- Applied directly to the database on 5 Nov 2026; recorded here so the repo
-- matches the migration history. The key is read from Vault at run time.
select cron.schedule('complaint-whatsapp-5min', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/complaint-whatsapp',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fp_sync_service_role_key' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$);
