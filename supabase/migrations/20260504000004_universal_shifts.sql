-- Flax HR — Migration 019: Universal shifts (outlet_id nullable)
--
-- Until now, every shift template lived under a specific outlet. Most
-- chains have one or two universal templates ("Morning 9–6", "Evening
-- 2–11") that apply across all outlets. Forcing per-outlet duplication
-- creates drift.
--
-- This migration:
-- 1. Makes core.shifts.outlet_id nullable. NULL means "applies to all
--    outlets" (a universal template).
-- 2. Drops the existing UNIQUE (outlet_id, name) constraint and replaces
--    it with two partial unique indexes so universal and per-outlet
--    shifts coexist without collision.
-- 3. Adjusts RLS so admin/HR can manage universal shifts; managers can
--    SELECT universal shifts but cannot create them (preventing scope
--    creep).
-- 4. Adjusts the v_today_shift / v_my_today_shift views so universal
--    shifts also resolve.
-- 5. Updates the manager helper function to handle null outlet_id (a
--    null outlet on a shift means "any outlet" — managers can read it).

-- 1) Make outlet_id nullable
alter table core.shifts alter column outlet_id drop not null;

-- 2) Replace UNIQUE (outlet_id, name) with two partial unique indexes
alter table core.shifts drop constraint if exists shifts_outlet_id_name_key;

create unique index if not exists shifts_universal_name_uq
  on core.shifts (name) where outlet_id is null;

create unique index if not exists shifts_outlet_name_uq
  on core.shifts (outlet_id, name) where outlet_id is not null;

-- 3) RLS — let managers SELECT universal shifts (read-only).
drop policy if exists shifts_manager on core.shifts;
create policy shifts_manager on core.shifts for select
  using (
    core.has_role('manager')
    and (outlet_id is null or core.has_outlet_access(outlet_id))
  );

-- admin_hr policy already exists and covers nullable outlet_id implicitly.

-- 4) Helper used by employee_shifts manager policy must not blow up on
--    universal shifts — it returns null for those, and has_outlet_access
--    already returns false on null which keeps managers out of universal
--    employee_shifts (admin/hr only).
create or replace function core.shift_outlet(p_shift_id uuid)
returns text
language sql
security definer
stable
set search_path = core, public
as $$
  select outlet_id from core.shifts where id = p_shift_id;
$$;

-- 5) Refresh views so universal shifts resolve at query time.
--    v_today_shift: an employee can match any shift whose outlet_id is
--    null OR equals their own employee.outlet_id.
create or replace view public.v_today_shift as
  select e.id as employee_id,
         s.id as shift_id, s.outlet_id, s.name, s.start_time, s.end_time,
         s.grace_in_minutes, s.grace_out_minutes
  from core.employees e
  join core.employee_shifts es on es.employee_id = e.id
  join core.shifts s on s.id = es.shift_id
  where (es.effective_from <= current_date)
    and (es.effective_to is null or es.effective_to >= current_date)
    and s.is_active = true
    and (s.outlet_id is null or s.outlet_id = e.outlet_id)
    and extract(dow from current_date)::int = any(s.days_of_week);

grant select on public.v_today_shift to authenticated;

create or replace view public.v_my_today_shift as
  select * from public.v_today_shift
  where employee_id in (select id from core.employees where user_id = auth.uid());

grant select on public.v_my_today_shift to authenticated;

notify pgrst, 'reload schema';
