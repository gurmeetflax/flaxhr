-- Flax HR — Migration 026: Designations master + employee designation
--
-- Admins maintain a master list of job titles (cashier, manager, cook, …)
-- in /admin/settings. Every employee has a single designation chosen
-- from this list (nullable; new code on existing rows is simply unset).

create table if not exists core.designations (
  code           text primary key,
  name           text not null,
  is_active      bool not null default true,
  display_order  int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_designations_audit on core.designations;
create trigger trg_designations_audit
  after insert or update or delete on core.designations
  for each row execute function core.log_audit();

drop trigger if exists trg_designations_touch on core.designations;
create trigger trg_designations_touch
  before update on core.designations
  for each row execute function core.set_updated_at();

alter table core.designations enable row level security;

drop policy if exists desig_read_all on core.designations;
create policy desig_read_all on core.designations
  for select using (auth.uid() is not null);

drop policy if exists desig_admin_write on core.designations;
create policy desig_admin_write on core.designations
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- Seed sensible defaults for a food-retail crew. Admins can rename or
-- deactivate any of these; this is just to avoid an empty dropdown on
-- first run.
insert into core.designations (code, name, display_order) values
  ('cashier',   'Cashier',          10),
  ('cook',      'Cook',             20),
  ('helper',    'Kitchen helper',   30),
  ('cleaner',   'Cleaner',          40),
  ('delivery',  'Delivery',         50),
  ('manager',   'Manager',          60),
  ('hr',        'HR',               70),
  ('admin',     'Admin',            80)
on conflict (code) do nothing;

-- Read-only public view for dropdowns; mirrors the table.
create or replace view public.v_designations
with (security_invoker = true) as
  select code, name, is_active, display_order
  from core.designations
  order by display_order, name;

grant select on public.v_designations to authenticated;

-- Add the FK column on employees. on delete set null so deactivating /
-- deleting a designation doesn't cascade-delete employees.
alter table core.employees
  add column if not exists designation_code text
    references core.designations(code) on delete set null;

create index if not exists employees_designation_idx
  on core.employees (designation_code) where deleted_at is null;

-- Refresh v_employees to expose designation. Drop+recreate because the
-- new column slots in the middle of the existing column list (same
-- reason as Phase 8's v_employees refresh).
drop view if exists public.v_employees;
create view public.v_employees
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id, e.full_name,
         e.work_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         e.monthly_salary, e.exit_date, e.exit_reason,
         e.designation_code,
         d.name as designation_name,
         o.display_name as outlet_name,
         o.city as outlet_city
  from core.employees e
  left join public.flax_outlets o on o.id = e.outlet_id
  left join core.designations d on d.code = e.designation_code
  where e.deleted_at is null;

grant select on public.v_employees to authenticated;

-- v_my_employee for self-service: also expose designation_name.
create or replace view public.v_my_employee
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id, e.full_name,
         e.work_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.designation_code,
         d.name as designation_name
  from core.employees e
  left join core.designations d on d.code = e.designation_code
  where e.user_id = auth.uid() and e.deleted_at is null;

grant select on public.v_my_employee to authenticated;
