-- Flax HR — Migration 028: Notifications foundation (Phase 8)
--
-- A generic, in-app + email notification spine. Every later phase
-- (birthday, PIP, FnF, payroll-finalised) plugs into it via
-- core.notify(). Email is delivered out-of-band by an edge function
-- (`notify-email`) that polls rows where email_sent_at is null.
--
-- Fail-soft design: if pg_cron / RESEND_API_KEY are not configured,
-- in-app notifications still work; the email queue just drains later.

-- ==========================================================================
-- 1. core.notifications
-- ==========================================================================
create table if not exists core.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references core.employees(id) on delete cascade,
  type            text not null,                 -- e.g. 'birthday', 'pip_opened'
  title           text not null,
  body            text,
  data            jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  email_sent_at   timestamptz,                   -- null = pending/queued
  email_error     text,                          -- last failure reason, if any
  created_at      timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on core.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on core.notifications (recipient_id) where read_at is null;
create index if not exists notifications_email_pending_idx
  on core.notifications (created_at) where email_sent_at is null;

drop trigger if exists trg_notifications_audit on core.notifications;
create trigger trg_notifications_audit
  after insert or update or delete on core.notifications
  for each row execute function core.log_audit();

alter table core.notifications enable row level security;

-- Recipient: read + mark-own-as-read.
drop policy if exists notifications_self_select on core.notifications;
create policy notifications_self_select on core.notifications
  for select
  using (
    recipient_id in (
      select id from core.employees where user_id = auth.uid()
    )
  );

drop policy if exists notifications_self_update on core.notifications;
create policy notifications_self_update on core.notifications
  for update
  using (
    recipient_id in (
      select id from core.employees where user_id = auth.uid()
    )
  )
  with check (
    recipient_id in (
      select id from core.employees where user_id = auth.uid()
    )
  );

-- Admin/HR: full access.
drop policy if exists notifications_admin_hr_all on core.notifications;
create policy notifications_admin_hr_all on core.notifications
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- Auditors: read.
drop policy if exists notifications_auditor_select on core.notifications;
create policy notifications_auditor_select on core.notifications
  for select
  using (core.has_role('auditor'));

-- ==========================================================================
-- 2. core.notification_prefs (per-employee)
-- ==========================================================================
create table if not exists core.notification_prefs (
  employee_id     uuid primary key references core.employees(id) on delete cascade,
  channel_email   boolean not null default true,
  channel_inapp   boolean not null default true,
  mute_types      text[] not null default '{}',
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_notification_prefs_touch on core.notification_prefs;
create trigger trg_notification_prefs_touch
  before update on core.notification_prefs
  for each row execute function core.set_updated_at();

alter table core.notification_prefs enable row level security;

drop policy if exists notification_prefs_self_all on core.notification_prefs;
create policy notification_prefs_self_all on core.notification_prefs
  for all
  using (
    employee_id in (select id from core.employees where user_id = auth.uid())
  )
  with check (
    employee_id in (select id from core.employees where user_id = auth.uid())
  );

drop policy if exists notification_prefs_admin_hr on core.notification_prefs;
create policy notification_prefs_admin_hr on core.notification_prefs
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- ==========================================================================
-- 3. core.notify() helper — used by every later phase
-- ==========================================================================
create or replace function core.notify(
  p_recipient uuid,
  p_type      text,
  p_title     text,
  p_body      text default null,
  p_data      jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_pref_inapp boolean;
  v_pref_email boolean;
  v_muted      text[];
  v_email_global boolean;
  v_id uuid;
begin
  if p_recipient is null then
    return null;
  end if;

  -- Per-employee prefs (defaults if no row).
  select coalesce(channel_inapp, true), coalesce(channel_email, true), coalesce(mute_types, '{}')
    into v_pref_inapp, v_pref_email, v_muted
    from core.notification_prefs where employee_id = p_recipient;

  if v_pref_inapp is null then
    v_pref_inapp := true;
    v_pref_email := true;
    v_muted := '{}';
  end if;

  if p_type = any(v_muted) then
    return null;            -- type-muted entirely
  end if;

  if not v_pref_inapp then
    return null;            -- in-app off entirely; we don't queue email-only
  end if;

  -- Global email kill-switch (admin setting).
  v_email_global := coalesce(
    (core.get_app_setting('notif_email_enabled'))::boolean,
    true
  );

  insert into core.notifications (
    recipient_id, type, title, body, data,
    -- If email is disabled (per-user or globally), pre-stamp email_sent_at
    -- so the runner skips it.
    email_sent_at
  )
  values (
    p_recipient, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb),
    case when v_pref_email and v_email_global then null else now() end
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function core.notify(uuid, text, text, text, jsonb) to authenticated;

-- ==========================================================================
-- 4. mark_read RPC (used by the bell click handler)
-- ==========================================================================
create or replace function public.mark_notification_read(p_id uuid)
returns void
language sql
security definer
set search_path = core, public
as $$
  update core.notifications
     set read_at = now()
   where id = p_id
     and read_at is null
     and recipient_id in (select id from core.employees where user_id = auth.uid());
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = core, public
as $$
  update core.notifications
     set read_at = now()
   where read_at is null
     and recipient_id in (select id from core.employees where user_id = auth.uid());
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

-- ==========================================================================
-- 5. Public views (security_invoker)
-- ==========================================================================
create or replace view public.v_my_notifications
with (security_invoker = true) as
  select
    n.id,
    n.type,
    n.title,
    n.body,
    n.data,
    n.read_at,
    n.created_at
  from core.notifications n
  where n.recipient_id in (select id from core.employees where user_id = auth.uid())
  order by n.created_at desc;

grant select on public.v_my_notifications to authenticated;

create or replace view public.v_my_notification_prefs
with (security_invoker = true) as
  select
    p.employee_id,
    p.channel_email,
    p.channel_inapp,
    p.mute_types,
    p.updated_at
  from core.notification_prefs p
  where p.employee_id in (select id from core.employees where user_id = auth.uid());

grant select on public.v_my_notification_prefs to authenticated;

create or replace function public.upsert_my_notification_prefs(
  p_channel_email boolean,
  p_channel_inapp boolean,
  p_mute_types    text[]
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_emp uuid;
begin
  select id into v_emp from core.employees where user_id = auth.uid() limit 1;
  if v_emp is null then
    raise exception 'NO_EMPLOYEE' using errcode = 'P0001';
  end if;
  insert into core.notification_prefs (employee_id, channel_email, channel_inapp, mute_types)
  values (v_emp, p_channel_email, p_channel_inapp, coalesce(p_mute_types, '{}'))
  on conflict (employee_id) do update
    set channel_email = excluded.channel_email,
        channel_inapp = excluded.channel_inapp,
        mute_types    = excluded.mute_types;
end;
$$;

grant execute on function public.upsert_my_notification_prefs(boolean, boolean, text[]) to authenticated;

-- ==========================================================================
-- 6. Seed default settings
-- ==========================================================================
insert into core.app_settings (key, value)
  values
    ('notif_email_enabled',      'true'::jsonb),
    ('pip_threshold_pct',        '60'::jsonb),
    ('birthday_voucher_enabled', 'false'::jsonb)
  on conflict (key) do nothing;

-- Force PostgREST to reload its schema cache.
notify pgrst, 'reload schema';
