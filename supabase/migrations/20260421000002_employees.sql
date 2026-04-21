-- Flax HR — Migration 002: core.employees (minimal for auth + directory)
--
-- Keeps only fields needed for login, outlet assignment, and directory lookup.
-- The Employees module will ADD statutory, compensation, document columns later.

create table if not exists core.employees (
  id              uuid primary key default gen_random_uuid(),
  employee_code   text not null unique
                  check (employee_code ~ '^FLX-[A-Z0-9]{2,6}-[0-9]{4}$'),
  user_id         uuid unique references auth.users(id) on delete set null,
  full_name       text not null,
  work_email      text,
  phone           text,
  outlet_id       text references public.flax_outlets(id),
  is_active       boolean not null default true,
  hired_on        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists employees_outlet_idx
  on core.employees (outlet_id) where deleted_at is null;
create index if not exists employees_user_idx
  on core.employees (user_id) where deleted_at is null;
create index if not exists employees_active_idx
  on core.employees (is_active) where deleted_at is null;

drop trigger if exists trg_employees_updated_at on core.employees;
create trigger trg_employees_updated_at
  before update on core.employees
  for each row execute function core.set_updated_at();

drop trigger if exists trg_employees_audit on core.employees;
create trigger trg_employees_audit
  after insert or update or delete on core.employees
  for each row execute function core.log_audit();

alter table core.employees enable row level security;

-- Admins and HR: full access
drop policy if exists employees_admin_hr_all on core.employees;
create policy employees_admin_hr_all on core.employees
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- Managers can see employees at any outlet they have access to
drop policy if exists employees_manager_select on core.employees;
create policy employees_manager_select on core.employees
  for select
  using (core.has_role('manager') and (outlet_id is null or core.has_outlet_access(outlet_id)));

-- Employees can see their own row
drop policy if exists employees_self_select on core.employees;
create policy employees_self_select on core.employees
  for select
  using (user_id = auth.uid());

-- Auditors can read everything
drop policy if exists employees_auditor_select on core.employees;
create policy employees_auditor_select on core.employees
  for select
  using (core.has_role('auditor'));

-- Helper: current user's employee row (for /me dashboard and role resolution)
create or replace function api.my_employee()
returns core.employees
language sql
stable
security definer
set search_path = core, public
as $$
  select * from core.employees
  where user_id = auth.uid() and deleted_at is null
  limit 1;
$$;

grant execute on function api.my_employee() to authenticated;
