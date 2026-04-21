-- Flax HR — Migration 001: Foundations
-- Additive only. Does not touch legacy hb_*, flax_* (except additive ALTER on flax_outlets),
-- employees, or onboarding_* tables.
--
-- Creates:
--   1. Schemas: core, hr, attendance, api
--   2. Shared utilities: core.set_updated_at, core.log_audit, core.audit_logs
--   3. core.user_roles with helper functions
--   4. hr.statutory_config (effective-dated) seeded with PF and ESIC
--   5. Additive columns on public.flax_outlets: address, lat, lng, geofence_radius_m

-- ==========================================================================
-- 1. Schemas
-- ==========================================================================
create schema if not exists core;
create schema if not exists hr;
create schema if not exists attendance;
create schema if not exists api;

comment on schema core is 'Flax shared platform: employees, roles, audit, notifications.';
comment on schema hr is 'Flax HR app: leaves, payroll, rosters, onboarding docs.';
comment on schema attendance is 'Flax attendance: logs, regularisations.';
comment on schema api is 'Stable read-only contract for other Flax apps. Views only.';

-- ==========================================================================
-- 2. Shared utilities
-- ==========================================================================

-- updated_at auto-setter
create or replace function core.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- audit log table
create table if not exists core.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid,
  action          text not null check (action in ('insert', 'update', 'delete')),
  schema_name     text not null,
  table_name      text not null,
  record_id       text,
  diff            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists audit_logs_table_idx
  on core.audit_logs (schema_name, table_name, created_at desc);
create index if not exists audit_logs_actor_idx
  on core.audit_logs (actor_id, created_at desc);

alter table core.audit_logs enable row level security;

-- generic audit trigger function
create or replace function core.log_audit()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  actor uuid;
  rec_id text;
  diff jsonb;
begin
  begin
    actor := auth.uid();
  exception when others then
    actor := null;
  end;

  if tg_op = 'DELETE' then
    rec_id := coalesce((to_jsonb(old)->>'id'), null);
    diff := to_jsonb(old);
    insert into core.audit_logs (actor_id, action, schema_name, table_name, record_id, diff)
    values (actor, 'delete', tg_table_schema, tg_table_name, rec_id, diff);
    return old;
  elsif tg_op = 'UPDATE' then
    rec_id := coalesce((to_jsonb(new)->>'id'), null);
    diff := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
    insert into core.audit_logs (actor_id, action, schema_name, table_name, record_id, diff)
    values (actor, 'update', tg_table_schema, tg_table_name, rec_id, diff);
    return new;
  else
    rec_id := coalesce((to_jsonb(new)->>'id'), null);
    diff := to_jsonb(new);
    insert into core.audit_logs (actor_id, action, schema_name, table_name, record_id, diff)
    values (actor, 'insert', tg_table_schema, tg_table_name, rec_id, diff);
    return new;
  end if;
end;
$$;

-- ==========================================================================
-- 3. core.user_roles + helpers
-- ==========================================================================
create table if not exists core.user_roles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('admin','hr','manager','auditor','employee','service')),
  outlet_id       text references public.flax_outlets(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (user_id, role, outlet_id)
);

create index if not exists user_roles_user_idx on core.user_roles (user_id) where deleted_at is null;
create index if not exists user_roles_outlet_idx on core.user_roles (outlet_id) where deleted_at is null;

drop trigger if exists trg_user_roles_updated_at on core.user_roles;
create trigger trg_user_roles_updated_at
  before update on core.user_roles
  for each row execute function core.set_updated_at();

drop trigger if exists trg_user_roles_audit on core.user_roles;
create trigger trg_user_roles_audit
  after insert or update or delete on core.user_roles
  for each row execute function core.log_audit();

alter table core.user_roles enable row level security;

-- has_role helper (checks active role for current user)
create or replace function core.has_role(_role text)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1 from core.user_roles
    where user_id = auth.uid()
      and role = _role
      and deleted_at is null
  );
$$;

-- is_admin shortcut
create or replace function core.is_admin()
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select core.has_role('admin');
$$;

-- has_outlet_access: does the user have any role for this outlet, or global?
create or replace function core.has_outlet_access(_outlet_id text)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1 from core.user_roles
    where user_id = auth.uid()
      and deleted_at is null
      and (outlet_id is null or outlet_id = _outlet_id)
  );
$$;

-- Policies for core.user_roles:
-- - users can see their own roles
-- - admins can see/modify all
drop policy if exists user_roles_self_select on core.user_roles;
create policy user_roles_self_select on core.user_roles
  for select using (user_id = auth.uid());

drop policy if exists user_roles_admin_all on core.user_roles;
create policy user_roles_admin_all on core.user_roles
  for all using (core.is_admin()) with check (core.is_admin());

-- Policies for core.audit_logs: admins read only
drop policy if exists audit_logs_admin_select on core.audit_logs;
create policy audit_logs_admin_select on core.audit_logs
  for select using (core.is_admin());

-- ==========================================================================
-- 4. hr.statutory_config — effective-dated PF / ESIC / TDS / PT rules
-- ==========================================================================
create table if not exists hr.statutory_config (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('pf','esic','tds','pt')),
  effective_from   date not null,
  effective_to     date,
  config           jsonb not null,
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (kind, effective_from)
);

create index if not exists statutory_config_current_idx
  on hr.statutory_config (kind, effective_from desc)
  where deleted_at is null;

drop trigger if exists trg_statutory_config_updated_at on hr.statutory_config;
create trigger trg_statutory_config_updated_at
  before update on hr.statutory_config
  for each row execute function core.set_updated_at();

drop trigger if exists trg_statutory_config_audit on hr.statutory_config;
create trigger trg_statutory_config_audit
  after insert or update or delete on hr.statutory_config
  for each row execute function core.log_audit();

alter table hr.statutory_config enable row level security;

-- All authenticated users may read current statutory rules (needed for payroll display).
drop policy if exists statutory_config_auth_select on hr.statutory_config;
create policy statutory_config_auth_select on hr.statutory_config
  for select
  to authenticated
  using (deleted_at is null);

-- Only admins / HR may modify.
drop policy if exists statutory_config_admin_all on hr.statutory_config;
create policy statutory_config_admin_all on hr.statutory_config
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- Seed: PF
insert into hr.statutory_config (kind, effective_from, config, notes)
values (
  'pf',
  '2026-04-01',
  jsonb_build_object(
    'enabled', true,
    'employee_contribution_rate', 0.12,
    'employer_contribution_rate', 0.12,
    'employer_eps_rate', 0.0833,
    'employer_edli_rate', 0.005,
    'employer_admin_charges_rate', 0.005,
    'wage_ceiling', 15000,
    'apply_ceiling', true,
    'wage_components', jsonb_build_array('basic','da'),
    'voluntary_pf_allowed', true,
    'exempt_if_basic_above', null,
    'exempt_if_first_time_and_salary_above', 15000,
    'round_to_nearest_rupee', true
  ),
  'Seeded from v1 spec (2026-04-01).'
)
on conflict (kind, effective_from) do nothing;

-- Seed: ESIC
insert into hr.statutory_config (kind, effective_from, config, notes)
values (
  'esic',
  '2026-04-01',
  jsonb_build_object(
    'enabled', true,
    'employee_contribution_rate', 0.0075,
    'employer_contribution_rate', 0.0325,
    'gross_wage_threshold', 21000,
    'disability_threshold', 25000,
    'wage_components', jsonb_build_array('basic','hra','other_allowances','ot'),
    'contribution_period_rule', 'continue_till_period_end',
    'round_to_nearest_rupee', true
  ),
  'Seeded from v1 spec (2026-04-01).'
)
on conflict (kind, effective_from) do nothing;

-- ==========================================================================
-- 5. public.flax_outlets — additive columns for attendance geofence & address
-- ==========================================================================
alter table public.flax_outlets
  add column if not exists address text,
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6),
  add column if not exists geofence_radius_m integer default 200
    check (geofence_radius_m is null or geofence_radius_m between 25 and 5000);

comment on column public.flax_outlets.lat is 'Latitude for attendance geofence. Null = geofence disabled.';
comment on column public.flax_outlets.lng is 'Longitude for attendance geofence. Null = geofence disabled.';
comment on column public.flax_outlets.geofence_radius_m is 'Allowed distance in metres from outlet centre. Default 200.';
