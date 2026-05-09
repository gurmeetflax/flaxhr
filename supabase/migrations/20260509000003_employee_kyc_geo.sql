-- Flax HR — Migration 030: Phase 9.5 — KYC fields + home geo + email rename
--
-- 1. Rename work_email → personal_email (auth login uses synthetic
--    employeeCodeToEmail, so this is a contact-only column).
-- 2. Add home_lat / home_lng for travel-allowance / commute maths.
-- 3. Add KYC columns: aadhaar / pan last-4 + doc paths + verified status.
-- 4. Trigger: stamp kyc_verified_at + kyc_verified_by on transition to
--    'verified' and emit a notification to the employee.
-- 5. Storage bucket `kyc-documents` is created in the next migration.

-- ==========================================================================
-- 1. Email rename (contact-only column; auth uses synthetic emails)
-- ==========================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'employees'
      and column_name = 'work_email'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'employees'
      and column_name = 'personal_email'
  ) then
    -- Drop the unique index that was created against work_email so we
    -- can rename the column cleanly. Recreate it on personal_email below.
    execute 'alter index if exists core.employees_work_email_unique rename to employees_personal_email_unique';
    execute 'alter table core.employees rename column work_email to personal_email';
  end if;
end $$;

-- ==========================================================================
-- 2. KYC + geo columns
-- ==========================================================================
alter table core.employees
  add column if not exists home_lat              double precision,
  add column if not exists home_lng              double precision,
  add column if not exists aadhaar_last4         char(4),
  add column if not exists pan_last4             char(4),
  add column if not exists aadhaar_doc_path      text,
  add column if not exists pan_doc_path          text,
  add column if not exists kyc_status            text not null default 'pending',
  add column if not exists kyc_verified_at       timestamptz,
  add column if not exists kyc_verified_by       uuid references auth.users(id),
  add column if not exists kyc_notes             text;

-- CHECK constraints (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_kyc_status_chk'
  ) then
    alter table core.employees
      add constraint employees_kyc_status_chk
      check (kyc_status in ('pending','submitted','verified','rejected'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'employees_aadhaar_last4_chk'
  ) then
    alter table core.employees
      add constraint employees_aadhaar_last4_chk
      check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'employees_pan_last4_chk'
  ) then
    alter table core.employees
      add constraint employees_pan_last4_chk
      check (pan_last4 is null or pan_last4 ~ '^[A-Z0-9]{4}$');
  end if;
end $$;

-- ==========================================================================
-- 3. Trigger: stamp + notify on KYC verification transition
-- ==========================================================================
create or replace function core.touch_kyc_verified()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if new.kyc_status is distinct from old.kyc_status then
    if new.kyc_status = 'verified' then
      new.kyc_verified_at := now();
      new.kyc_verified_by := auth.uid();
      perform core.notify(
        new.id,
        'kyc_verified',
        'KYC verified',
        'Your KYC has been verified. Thank you!',
        jsonb_build_object('verified_by', auth.uid())
      );
    elsif new.kyc_status = 'rejected' then
      perform core.notify(
        new.id,
        'kyc_rejected',
        'KYC rejected',
        coalesce('Reason: ' || new.kyc_notes, 'Please re-upload your KYC documents.'),
        jsonb_build_object('rejected_by', auth.uid())
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_kyc_status on core.employees;
create trigger trg_employees_kyc_status
  before update of kyc_status on core.employees
  for each row execute function core.touch_kyc_verified();

-- ==========================================================================
-- 4. Refresh public views to expose new columns
--    (drop+recreate; CREATE OR REPLACE can't reorder/insert columns mid-list)
-- ==========================================================================
drop view if exists public.v_employees;
create view public.v_employees
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id, e.full_name,
         e.personal_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         e.monthly_salary, e.exit_date, e.exit_reason,
         e.date_of_birth, e.address,
         e.emergency_contact_name, e.emergency_contact_phone,
         e.home_lat, e.home_lng,
         e.aadhaar_last4, e.pan_last4,
         e.kyc_status, e.kyc_verified_at, e.kyc_verified_by, e.kyc_notes,
         o.display_name as outlet_name,
         o.city as outlet_city
  from core.employees e
  left join public.flax_outlets o on o.id = e.outlet_id
  where e.deleted_at is null;

grant select on public.v_employees to authenticated;

-- v_my_employee — self-only view used by /me. Includes doc paths so
-- the client can request signed URLs to view its own uploads.
drop view if exists public.v_my_employee;
create view public.v_my_employee
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id, e.full_name,
         e.personal_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.monthly_salary,
         e.date_of_birth, e.address,
         e.emergency_contact_name, e.emergency_contact_phone,
         e.home_lat, e.home_lng,
         e.aadhaar_last4, e.pan_last4,
         e.aadhaar_doc_path, e.pan_doc_path,
         e.kyc_status, e.kyc_verified_at, e.kyc_notes
  from core.employees e
  where e.user_id = auth.uid() and e.deleted_at is null;

grant select on public.v_my_employee to authenticated;

-- ==========================================================================
-- 5. KYC RPCs
-- ==========================================================================
-- set_kyc_document: caller writes their own aadhaar/pan path. The path
-- must start with their own employee_id/ folder; otherwise reject.
create or replace function public.set_kyc_document(
  p_kind text,
  p_path text
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_emp uuid;
begin
  if p_kind not in ('aadhaar', 'pan') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;
  if p_path is null or length(p_path) = 0 then
    raise exception 'EMPTY_PATH' using errcode = 'P0001';
  end if;

  select id into v_emp from core.employees where user_id = auth.uid() limit 1;
  if v_emp is null then
    raise exception 'NO_EMPLOYEE' using errcode = 'P0001';
  end if;

  if split_part(p_path, '/', 1) <> v_emp::text then
    raise exception 'PATH_NOT_OWNED' using errcode = 'P0001';
  end if;

  if p_kind = 'aadhaar' then
    update core.employees
       set aadhaar_doc_path = p_path,
           kyc_status = case
             when kyc_status = 'verified' then 'submitted' -- re-upload resets
             when kyc_status in ('pending','rejected') then 'submitted'
             else kyc_status
           end
     where id = v_emp;
  else
    update core.employees
       set pan_doc_path = p_path,
           kyc_status = case
             when kyc_status = 'verified' then 'submitted'
             when kyc_status in ('pending','rejected') then 'submitted'
             else kyc_status
           end
     where id = v_emp;
  end if;
end;
$$;

grant execute on function public.set_kyc_document(text, text) to authenticated;

-- verify_kyc: admin/HR only. Persists notes + transitions status.
create or replace function public.verify_kyc(
  p_employee uuid,
  p_status   text,
  p_notes    text default null
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_status not in ('verified', 'rejected', 'pending') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  update core.employees
     set kyc_status = p_status,
         kyc_notes  = coalesce(p_notes, kyc_notes)
   where id = p_employee;
end;
$$;

grant execute on function public.verify_kyc(uuid, text, text) to authenticated;

-- signed_kyc_url: returns a 60s signed URL to the doc. Admin/HR/auditor
-- can fetch any; employees can fetch their own.
create or replace function public.signed_kyc_url(
  p_employee uuid,
  p_kind     text,
  p_expires  int default 60
) returns text
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_path  text;
  v_self  boolean;
  v_url   text;
begin
  if p_kind not in ('aadhaar','pan') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;

  v_self := exists (
    select 1 from core.employees
     where id = p_employee and user_id = auth.uid()
  );

  if not (v_self or core.is_admin() or core.has_role('hr') or core.has_role('auditor')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select case p_kind when 'aadhaar' then aadhaar_doc_path else pan_doc_path end
    into v_path
    from core.employees where id = p_employee;
  if v_path is null then
    return null;
  end if;

  -- Use storage.* helpers via PostgREST? Instead return path for the
  -- client to request a signed URL with the supabase-js client. The
  -- client can call supabase.storage.from('kyc-documents').createSignedUrl(path, expires).
  -- (We return the *path* here; the client requests the URL. Keeps this
  -- function pure-SQL and avoids depending on storage extensions.)
  v_url := v_path;
  return v_url;
end;
$$;

grant execute on function public.signed_kyc_url(uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
