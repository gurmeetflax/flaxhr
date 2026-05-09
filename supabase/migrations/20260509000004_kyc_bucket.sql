-- Flax HR — Migration 031: kyc-documents private bucket
--
-- Mirrors the attendance-selfies pattern but with employee_id as the
-- top-level folder (not auth.uid) so admin/HR can browse by employee.
-- Path scheme: {employee_id}/{aadhaar|pan}/{epoch}.{ext}
--
-- Employees can insert + read their own folder; admin/HR/auditor read all.
-- Employees cannot update or delete (audit-trail).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-documents',
  'kyc-documents',
  false,
  5 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "kyc_docs_insert_self" on storage.objects;
create policy "kyc_docs_insert_self" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] in (
      select id::text from core.employees where user_id = auth.uid()
    )
  );

drop policy if exists "kyc_docs_select_self" on storage.objects;
create policy "kyc_docs_select_self" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] in (
      select id::text from core.employees where user_id = auth.uid()
    )
  );

drop policy if exists "kyc_docs_select_staff" on storage.objects;
create policy "kyc_docs_select_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (core.is_admin() or core.has_role('hr')
         or core.has_role('auditor'))
  );

-- Admin/HR can also insert (e.g. uploading scanned docs on behalf of
-- the employee during onboarding).
drop policy if exists "kyc_docs_insert_staff" on storage.objects;
create policy "kyc_docs_insert_staff" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (core.is_admin() or core.has_role('hr'))
  );

-- No update/delete policies for employees → effectively forbidden.
-- Admin/HR can manage via service role / dashboard.
