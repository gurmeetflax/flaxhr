-- Flax HR — Migration 018: Break RLS recursion between shifts and employee_shifts
--
-- Symptom: every read/write to core.shifts or core.employee_shifts via
-- PostgREST returned `42P17 infinite recursion detected in policy for
-- relation "shifts"`, breaking the Shifts and Roster pages entirely.
--
-- Root cause:
--   shifts_select_emp on core.shifts          -> queries core.employee_shifts
--   emp_shifts_manager on core.employee_shifts -> queries core.shifts
-- Postgres aborts to prevent the loop.
--
-- Fix:
-- 1. Drop shifts_select_emp. Employees do not need direct SELECT on
--    core.shifts; they read via the SECURITY DEFINER view v_my_today_shift,
--    which already filters to the caller's employee_id.
-- 2. Rewrite emp_shifts_manager so the shift→outlet lookup goes through a
--    SECURITY DEFINER helper that bypasses RLS, severing the recursion.

-- 1) Drop the recursive policy on core.shifts
drop policy if exists shifts_select_emp on core.shifts;

-- 2) SECURITY DEFINER helper that returns a shift's outlet_id without
--    going through RLS on core.shifts.
create or replace function core.shift_outlet(p_shift_id uuid)
returns text
language sql
security definer
stable
set search_path = core, public
as $$
  select outlet_id from core.shifts where id = p_shift_id;
$$;

grant execute on function core.shift_outlet(uuid) to authenticated;

-- 3) Replace emp_shifts_manager so it uses the helper instead of querying
--    core.shifts directly.
drop policy if exists emp_shifts_manager on core.employee_shifts;
create policy emp_shifts_manager on core.employee_shifts for all
  using (
    core.has_role('manager')
    and core.has_outlet_access(core.shift_outlet(core.employee_shifts.shift_id))
  )
  with check (
    core.has_role('manager')
    and core.has_outlet_access(core.shift_outlet(core.employee_shifts.shift_id))
  );

-- 4) Tell PostgREST to reload — no-op for table changes, harmless.
notify pgrst, 'reload schema';
