-- Flax HR — Migration 032: Phase 9.7 — first/last name split + admin KYC RPC
--
-- 1. Add first_name + last_name on core.employees. Backfill from
--    existing full_name (split on first space). Trigger keeps
--    full_name = trim(first || ' ' || last) so every existing view
--    that selects full_name keeps working.
--
-- 2. Add admin_set_kyc_document RPC. set_kyc_document was scoped to
--    self-uploads (path must match the caller's employee_id). Admin
--    uploads via Edit/Create now route through the new RPC, which
--    accepts an explicit p_employee uuid.

-- ==========================================================================
-- 1. first_name + last_name
-- ==========================================================================
alter table core.employees
  add column if not exists first_name text,
  add column if not exists last_name  text;

-- Backfill any rows that still have a populated full_name but null
-- first_name. Idempotent.
update core.employees
   set first_name = nullif(split_part(full_name, ' ', 1), ''),
       last_name  = nullif(regexp_replace(full_name, '^[^ ]+\s*', ''), '')
 where first_name is null
   and full_name is not null;

create or replace function core.sync_full_name()
returns trigger
language plpgsql
as $$
begin
  -- If first_name or last_name was provided (non-null), let it drive
  -- full_name. Otherwise fall back to whatever full_name was given.
  if new.first_name is not null or new.last_name is not null then
    new.full_name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  end if;
  -- full_name must always be non-empty (existing NOT NULL).
  if new.full_name is null or length(trim(new.full_name)) = 0 then
    raise exception 'full_name cannot be empty' using errcode = '23502';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_sync_name on core.employees;
create trigger trg_employees_sync_name
  before insert or update of first_name, last_name, full_name on core.employees
  for each row execute function core.sync_full_name();

-- Refresh public.v_employees to expose first_name + last_name.
drop view if exists public.v_employees;
create view public.v_employees
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id,
         e.first_name, e.last_name, e.full_name,
         e.personal_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         e.monthly_salary, e.exit_date, e.exit_reason,
         e.designation_code,
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

drop view if exists public.v_my_employee;
create view public.v_my_employee
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id,
         e.first_name, e.last_name, e.full_name,
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
-- 2. admin_set_kyc_document — admin/HR can write doc paths for any employee
-- ==========================================================================
create or replace function public.admin_set_kyc_document(
  p_employee uuid,
  p_kind     text,
  p_path     text
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_kind not in ('aadhaar', 'pan') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;
  if p_path is null or length(p_path) = 0 then
    raise exception 'EMPTY_PATH' using errcode = 'P0001';
  end if;
  if split_part(p_path, '/', 1) <> p_employee::text then
    raise exception 'PATH_NOT_FOR_EMPLOYEE' using errcode = 'P0001';
  end if;
  if p_kind = 'aadhaar' then
    update core.employees
       set aadhaar_doc_path = p_path,
           kyc_status = case
             when kyc_status in ('pending','rejected','verified') then 'submitted'
             else kyc_status
           end
     where id = p_employee;
  else
    update core.employees
       set pan_doc_path = p_path,
           kyc_status = case
             when kyc_status in ('pending','rejected','verified') then 'submitted'
             else kyc_status
           end
     where id = p_employee;
  end if;
end;
$$;

grant execute on function public.admin_set_kyc_document(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
