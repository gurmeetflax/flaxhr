-- Flax HR — Restore designation_name on v_employees
--
-- Migration 20260509000017 (statutory flags) rebuilt v_employees to add
-- pf_enabled/pt_enabled/esic_enabled columns, but dropped the
-- designation_name column that 20260514000001 had put in place. The
-- admin dashboard's Team panel and a few other spots select
-- designation_name, so PostgREST is 400'ing every "list employees"
-- call, which the UI renders as "No employees yet."
--
-- Fix: rebuild v_employees with both — statutory flags AND designation_name.
-- Column list is a superset of what any caller reads, so CREATE OR
-- REPLACE VIEW works and doesn't break v_employee_snapshot / other
-- dependents.

create or replace view public.v_employees
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
         e.selfie_required,
         e.pf_enabled, e.pt_enabled, e.esic_enabled,
         o.display_name as outlet_name,
         o.city as outlet_city,
         d.name as designation_name             -- appended at end so
    from core.employees e                       -- CREATE OR REPLACE VIEW
    left join public.flax_outlets o on o.id = e.outlet_id
    left join core.designations d on d.code = e.designation_code
   where e.deleted_at is null;

grant select on public.v_employees to authenticated;

notify pgrst, 'reload schema';
