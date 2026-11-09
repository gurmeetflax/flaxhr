-- Applied directly to the database on 5 Nov 2026 (complaint WhatsApp alerts);
-- recorded here so the repo matches the migration history.
alter table public.flax_complaints
  add column if not exists whatsapp_notified_at timestamptz,
  add column if not exists whatsapp_notify_error text;

-- Everything already logged counts as sent, so switching this on doesn't flood the groups.
update public.flax_complaints set whatsapp_notified_at = now() where whatsapp_notified_at is null;

create index if not exists flax_complaints_whatsapp_pending_idx
  on public.flax_complaints (created_at) where whatsapp_notified_at is null;
