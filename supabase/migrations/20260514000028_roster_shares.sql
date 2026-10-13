-- Flax HR — roster images shared to WhatsApp from the Android app
--
-- The roster "Send to WhatsApp" button renders the outlet's week as a PNG.
-- Browsers share the image directly; the Android app (no native share
-- plugin) uploads it here and sends a 14-day signed link instead.

insert into storage.buckets (id, name, public, file_size_limit)
values ('roster-shares', 'roster-shares', false, 5242880)
on conflict (id) do nothing;

drop policy if exists roster_shares_insert on storage.objects;
create policy roster_shares_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'roster-shares' and (core.is_admin() or core.has_role('hr') or core.has_role('manager')));

drop policy if exists roster_shares_select on storage.objects;
create policy roster_shares_select on storage.objects for select to authenticated
  using (bucket_id = 'roster-shares' and (core.is_admin() or core.has_role('hr') or core.has_role('manager')));
