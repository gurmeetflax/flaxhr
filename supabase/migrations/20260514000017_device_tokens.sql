-- Flax HR — Device tokens for push notifications
--
-- One row per (user, device) so the same person on multiple phones gets
-- notified everywhere. Tokens rotate — upsert on (user_id, token).
-- Stale tokens (last_seen_at older than 90 days) can be reaped by
-- push_expire_stale_tokens() run from pg_cron if it becomes necessary.

create table if not exists core.device_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  token           text not null,
  platform        text not null check (platform in ('android', 'ios', 'web')),
  device_model    text,
  app_version     text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists device_tokens_user_idx
  on core.device_tokens (user_id);

alter table core.device_tokens enable row level security;

drop policy if exists device_tokens_self on core.device_tokens;
create policy device_tokens_self on core.device_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists device_tokens_admin on core.device_tokens;
create policy device_tokens_admin on core.device_tokens
  for select
  using (core.is_admin() or core.has_role('hr'));

-- Upsert RPC — the app calls this after successful push registration.
create or replace function public.register_device_token(
  p_token        text,
  p_platform     text,
  p_device_model text default null,
  p_app_version  text default null
)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_platform not in ('android', 'ios', 'web') then
    raise exception 'INVALID_PLATFORM' using errcode = 'P0001';
  end if;

  insert into core.device_tokens
    (user_id, token, platform, device_model, app_version, last_seen_at)
  values
    (auth.uid(), p_token, p_platform, p_device_model, p_app_version, now())
  on conflict (user_id, token) do update
    set platform     = excluded.platform,
        device_model = coalesce(excluded.device_model, core.device_tokens.device_model),
        app_version  = coalesce(excluded.app_version, core.device_tokens.app_version),
        last_seen_at = now();
end $$;

grant execute on function public.register_device_token(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
