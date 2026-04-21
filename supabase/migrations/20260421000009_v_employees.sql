-- Flax HR — Migration 009: v_employees view
--
-- A public-schema read view for the admin Employees list, which needs each
-- employee enriched with their outlet's display_name and city. security_invoker
-- means core.employees RLS runs under the caller's identity, so managers only
-- see their outlet, employees only see themselves, auditors see everything.

create or replace view public.v_employees
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id, e.full_name,
         e.work_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         o.display_name as outlet_name,
         o.city as outlet_city
  from core.employees e
  left join public.flax_outlets o on o.id = e.outlet_id
  where e.deleted_at is null;

grant select on public.v_employees to authenticated;
