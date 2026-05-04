-- Flax HR — Migration 017: Hotfix views + manager RLS
--
-- Root cause for the broken save/show flows in phases 2–7:
-- the legacy `public.flax_outlets` table is not granted SELECT to the
-- `authenticated` role. Several views (v_employees, v_attendance, v_roster,
-- v_leave_requests, etc.) join flax_outlets while running with
-- security_invoker = true, so non-admin queries silently return NULL outlet
-- columns or zero rows.
--
-- flax_outlets only contains non-sensitive outlet metadata (name, city,
-- lat/lng, geofence radius) that all signed-in employees already need for
-- geofence math, so granting SELECT to authenticated is safe and keeps
-- existing RLS-based row scoping on the underlying tables intact.
--
-- Also: managers can already write to core.shifts and core.roster_entries,
-- but not to core.employee_shifts. Adds a manager policy.
--
-- Finally: notify PostgREST so any tables added in phases 2–7 that haven't
-- been picked up by the schema cache become reachable from the API.

-- 1) Grant SELECT on flax_outlets so security_invoker views resolve --------
grant select on public.flax_outlets to authenticated;

-- 2) Manager RLS for core.employee_shifts ----------------------------------
drop policy if exists emp_shifts_manager on core.employee_shifts;
create policy emp_shifts_manager on core.employee_shifts for all
  using (
    core.has_role('manager') and exists (
      select 1 from core.shifts s
      where s.id = core.employee_shifts.shift_id
        and core.has_outlet_access(s.outlet_id)
    )
  )
  with check (
    core.has_role('manager') and exists (
      select 1 from core.shifts s
      where s.id = core.employee_shifts.shift_id
        and core.has_outlet_access(s.outlet_id)
    )
  );

-- 3) Reload PostgREST schema cache -----------------------------------------
notify pgrst, 'reload schema';
