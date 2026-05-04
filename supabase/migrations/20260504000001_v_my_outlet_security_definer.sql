-- Flax HR — Migration 016: Rebuild v_my_outlet so employees can see their outlet
--
-- Original v_my_outlet (in 20260503000001_punch_hard_block.sql) ran as
-- security_invoker, which on Supabase means it executes as the calling user.
-- The legacy public.flax_outlets table is not granted SELECT to the
-- `authenticated` role, so the join produced 0 rows for ordinary employees
-- and the PunchPage rendered "No outlet assigned" even when one was set.
--
-- Fix: rebuild the view with security_invoker = false (definer) and rely on
-- the WHERE clause `e.user_id = auth.uid()` to scope rows to the caller.

drop view if exists public.v_my_outlet;

create view public.v_my_outlet
with (security_invoker = false) as
  select o.id, o.display_name, o.name, o.city, o.timezone,
         o.address, o.lat, o.lng, o.geofence_radius_m
  from public.flax_outlets o
  join core.employees e on e.outlet_id = o.id
  where e.user_id = auth.uid()
    and e.is_active = true
    and e.deleted_at is null;

grant select on public.v_my_outlet to authenticated;
