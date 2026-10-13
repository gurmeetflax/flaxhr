-- Flax HR — documents to sign, step 2: signing
--
-- * signed-docs bucket: final signed PDFs, under <employee_id>/. Employees
--   read their own folder and may upload their own in-app signed copy.
-- * sign_requests.provider_url / provider_status: the Leegality signing
--   link and last status, so a letter is never sent to Leegality twice.
-- * employee_documents accepts the new kinds and links back to the request.
-- * RPCs for the employee side: mark viewed, and sign in the app (the
--   Aadhaar path is completed server-side by the leegality-webhook function).

alter table core.sign_requests add column if not exists provider_url text;
alter table core.sign_requests add column if not exists provider_status text;
alter table core.sign_requests add column if not exists content_sha256 text;

alter table core.employee_documents drop constraint if exists employee_documents_kind_check;
alter table core.employee_documents add constraint employee_documents_kind_check check (kind in (
  'offer_letter', 'appointment_letter', 'contract', 'id_proof', 'address_proof', 'education',
  'experience', 'resignation', 'other',
  'attendance_policy', 'conduct_policy', 'nda', 'deduction_consent'));
alter table core.employee_documents add column if not exists sign_request_id uuid references core.sign_requests(id) on delete set null;

insert into storage.buckets (id, name, public, file_size_limit)
values ('signed-docs', 'signed-docs', false, 20971520)
on conflict (id) do nothing;

drop policy if exists signed_docs_admin_hr on storage.objects;
create policy signed_docs_admin_hr on storage.objects for all to authenticated
  using (bucket_id = 'signed-docs' and (core.is_admin() or core.has_role('hr')))
  with check (bucket_id = 'signed-docs' and (core.is_admin() or core.has_role('hr')));
drop policy if exists signed_docs_self_select on storage.objects;
create policy signed_docs_self_select on storage.objects for select to authenticated
  using (bucket_id = 'signed-docs'
         and (storage.foldername(name))[1] in (select id::text from core.employees where user_id = auth.uid()));
drop policy if exists signed_docs_self_insert on storage.objects;
create policy signed_docs_self_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'signed-docs'
              and (storage.foldername(name))[1] in (select id::text from core.employees where user_id = auth.uid()));

-- Employees' drawn signatures live under signatures/<employee_id>/.
drop policy if exists signatures_self_insert on storage.objects;
create policy signatures_self_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures'
              and (storage.foldername(name))[1] in (select id::text from core.employees where user_id = auth.uid()));
drop policy if exists signatures_self_select on storage.objects;
create policy signatures_self_select on storage.objects for select to authenticated
  using (bucket_id = 'signatures'
         and (storage.foldername(name))[1] in (select id::text from core.employees where user_id = auth.uid()));

-- Employee's own documents (with the frozen letter HTML for reading).
create or replace view public.v_my_sign_requests with (security_invoker = true) as
select r.id, r.kind, r.title, r.sign_method, r.status, r.sent_at, r.viewed_at, r.signed_at,
       r.signed_via, r.signed_pdf_path, r.rendered_html, r.provider_url, r.provider_status
  from core.sign_requests r
 where r.employee_id in (select id from core.employees where user_id = auth.uid())
   and r.status <> 'cancelled';
grant select on public.v_my_sign_requests to authenticated;

create or replace function public.mark_document_viewed(p_request_id uuid)
returns void
language sql
security definer
set search_path = core, public
as $$
  update core.sign_requests
     set status = 'viewed', viewed_at = coalesce(viewed_at, now())
   where id = p_request_id
     and status = 'sent'
     and employee_id in (select id from core.employees where user_id = auth.uid());
$$;

-- In-app signature. Allowed for in-app documents, and for Aadhaar
-- documents once an Aadhaar attempt was started (the agreed fallback).
create or replace function public.sign_document_in_app(
  p_request_id      uuid,
  p_signer_name     text,
  p_signature_path  text,
  p_signed_pdf_path text,
  p_client          jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  r     core.sign_requests%rowtype;
  emp   core.employees%rowtype;
  hdrs  jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  now_  timestamptz := now();
begin
  select * into emp from core.employees where user_id = auth.uid() and deleted_at is null limit 1;
  if emp.id is null then
    raise exception 'NO_EMPLOYEE' using errcode = 'P0001';
  end if;
  select * into r from core.sign_requests where id = p_request_id and employee_id = emp.id for update;
  if r.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.status not in ('sent', 'viewed') then
    raise exception 'ALREADY_%', upper(r.status) using errcode = 'P0001';
  end if;
  if r.sign_method = 'aadhaar' and r.provider_ref is null then
    raise exception 'AADHAAR_FIRST' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_signer_name), '') = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if split_part(p_signature_path, '/', 1) <> emp.id::text or split_part(p_signed_pdf_path, '/', 1) <> emp.id::text then
    raise exception 'BAD_PATH' using errcode = 'P0001';
  end if;

  update core.sign_requests
     set status = 'signed',
         signed_at = now_,
         signed_via = 'in_app',
         signer_name = btrim(p_signer_name),
         signature_path = p_signature_path,
         signed_pdf_path = p_signed_pdf_path,
         viewed_at = coalesce(viewed_at, now_),
         audit = jsonb_build_object(
           'method', 'in_app',
           'aadhaar_fallback', r.sign_method = 'aadhaar',
           'signed_at', now_,
           'employee_code', emp.employee_code,
           'user_id', auth.uid(),
           'ip', coalesce(hdrs->>'x-forwarded-for', hdrs->>'x-real-ip'),
           'user_agent', hdrs->>'user-agent',
           'content_sha256', r.content_sha256,
           'client', p_client
         )
   where id = r.id;

  insert into core.employee_documents (employee_id, kind, title, path, issued_on, notes, sign_request_id)
  values (emp.id, r.kind, r.title, p_signed_pdf_path, now_::date, 'Signed in the Flax HR app', r.id);

  return jsonb_build_object('ok', true, 'signed_at', now_);
end;
$$;

revoke all on function public.mark_document_viewed(uuid) from public, anon;
revoke all on function public.sign_document_in_app(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.mark_document_viewed(uuid) to authenticated;
grant execute on function public.sign_document_in_app(uuid, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
