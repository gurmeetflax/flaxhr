-- Flax HR — Migration 005: public views for the current logged-in user
--
-- The Flax HR frontend needs to fetch the current user's roles and employee
-- row from core.* on every app load. Routing those queries through the
-- custom schema (`supabase.schema('core').from(...)`) requires the client
-- to set Accept-Profile: core on every request and is brittle across
-- client / SDK versions.
--
-- Simpler contract: expose two read-only views in the public schema. Each
-- filters by auth.uid() so a client just does `from('v_my_roles')` and
-- receives only their own rows. No schema switching required.
--
-- security_invoker = true means the underlying table's RLS runs under the
-- caller's identity, so the core.* policies still apply.

create or replace view public.v_my_roles
with (security_invoker = true) as
  select user_id, role, outlet_id
  from core.user_roles
  where user_id = auth.uid()
    and deleted_at is null;

create or replace view public.v_my_employee
with (security_invoker = true) as
  select id, employee_code, user_id, full_name, work_email, phone,
         outlet_id, is_active, hired_on
  from core.employees
  where user_id = auth.uid()
    and deleted_at is null;

grant select on public.v_my_roles    to authenticated;
grant select on public.v_my_employee to authenticated;
