-- Flax HR — Migration 033: Phase 9.6 — Multi-outlet membership
--
-- Some employees cover shifts at multiple outlets; area managers
-- visit many. core.employees.outlet_id stays as the *home* outlet
-- (back-compat for SC, dashboards, reports). The new join table is
-- the source of truth for "where is this employee allowed to punch".
--
-- A trigger keeps employee_outlets in sync with the home outlet:
-- whenever employees.outlet_id changes, ensure a corresponding
-- membership row exists with is_primary=true and demote any other.

-- ==========================================================================
-- 1. Membership table
-- ==========================================================================
create table if not exists core.employee_outlets (
  employee_id   uuid not null references core.employees(id) on delete cascade,
  outlet_id     text not null references public.flax_outlets(id) on delete cascade,
  role          text not null default 'occasional'
                check (role in ('home','occasional','area_manager')),
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (employee_id, outlet_id)
);

create unique index if not exists employee_outlets_one_primary_idx
  on core.employee_outlets (employee_id) where is_primary;
create index if not exists employee_outlets_outlet_idx
  on core.employee_outlets (outlet_id);

drop trigger if exists trg_employee_outlets_audit on core.employee_outlets;
create trigger trg_employee_outlets_audit
  after insert or update or delete on core.employee_outlets
  for each row execute function core.log_audit();

alter table core.employee_outlets enable row level security;

drop policy if exists employee_outlets_admin_hr_all on core.employee_outlets;
create policy employee_outlets_admin_hr_all on core.employee_outlets
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists employee_outlets_self_select on core.employee_outlets;
create policy employee_outlets_self_select on core.employee_outlets
  for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

drop policy if exists employee_outlets_manager_select on core.employee_outlets;
create policy employee_outlets_manager_select on core.employee_outlets
  for select
  using (core.has_role('manager') and core.has_outlet_access(outlet_id));

drop policy if exists employee_outlets_auditor_select on core.employee_outlets;
create policy employee_outlets_auditor_select on core.employee_outlets
  for select
  using (core.has_role('auditor'));

-- ==========================================================================
-- 2. Mirror trigger: keep home outlet membership in sync
-- ==========================================================================
create or replace function core.sync_home_outlet_membership()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  -- New home outlet is null: clear primary flag (membership rows kept).
  if new.outlet_id is null then
    update core.employee_outlets
       set is_primary = false
     where employee_id = new.id and is_primary;
    return new;
  end if;

  -- Demote any other primary first (the unique partial index prevents
  -- two primaries existing at once).
  update core.employee_outlets
     set is_primary = false
   where employee_id = new.id and outlet_id <> new.outlet_id and is_primary;

  insert into core.employee_outlets (employee_id, outlet_id, role, is_primary)
  values (new.id, new.outlet_id, 'home', true)
  on conflict (employee_id, outlet_id) do update
    set role = 'home', is_primary = true;

  return new;
end;
$$;

drop trigger if exists trg_employees_sync_home_outlet on core.employees;
create trigger trg_employees_sync_home_outlet
  after insert or update of outlet_id on core.employees
  for each row execute function core.sync_home_outlet_membership();

-- Backfill: every existing employee with a home outlet gets a row.
insert into core.employee_outlets (employee_id, outlet_id, role, is_primary)
select id, outlet_id, 'home', true
  from core.employees
 where outlet_id is not null
   and deleted_at is null
on conflict (employee_id, outlet_id) do update
  set role = 'home', is_primary = true;

-- ==========================================================================
-- 3. v_my_outlets — current user's allowed outlets with geofence info
-- ==========================================================================
create or replace view public.v_my_outlets
with (security_invoker = true) as
  select eo.employee_id,
         eo.outlet_id,
         eo.role,
         eo.is_primary,
         o.display_name as outlet_name,
         o.city as outlet_city,
         o.lat,
         o.lng,
         o.geofence_radius_m
    from core.employee_outlets eo
    join public.flax_outlets o on o.id = eo.outlet_id
   where eo.employee_id in (select id from core.employees where user_id = auth.uid())
     and o.active = true;

grant select on public.v_my_outlets to authenticated;

-- Admin variant: list any employee's outlets.
create or replace view public.v_employee_outlets
with (security_invoker = true) as
  select eo.employee_id,
         eo.outlet_id,
         eo.role,
         eo.is_primary,
         eo.created_at,
         o.display_name as outlet_name,
         o.city as outlet_city
    from core.employee_outlets eo
    join public.flax_outlets o on o.id = eo.outlet_id;

grant select on public.v_employee_outlets to authenticated;

-- ==========================================================================
-- 4. Admin RPC to add/remove extra outlets
-- ==========================================================================
create or replace function public.set_employee_outlets(
  p_employee uuid,
  p_outlet_ids text[],
  p_role       text default 'occasional'
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_home text;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_role not in ('occasional','area_manager') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;

  select outlet_id into v_home from core.employees where id = p_employee;

  -- Remove existing non-primary memberships not in the new set.
  delete from core.employee_outlets
   where employee_id = p_employee
     and is_primary = false
     and outlet_id <> all(coalesce(p_outlet_ids, '{}'::text[]));

  -- Upsert each requested outlet (skip the home outlet if it sneaks in).
  if p_outlet_ids is not null then
    insert into core.employee_outlets (employee_id, outlet_id, role, is_primary)
    select p_employee, oid, p_role, false
      from unnest(p_outlet_ids) as oid
     where oid <> coalesce(v_home, '')
    on conflict (employee_id, outlet_id) do update
      set role = excluded.role
       where core.employee_outlets.is_primary = false;
  end if;
end;
$$;

grant execute on function public.set_employee_outlets(uuid, text[], text) to authenticated;

-- ==========================================================================
-- 5. Update punch() — accept optional p_outlet_id and validate membership
-- ==========================================================================
-- Drop the previous 5-arg signature; recreate with 6 args (p_outlet_id last,
-- nullable so existing call sites still work via name-based binding).
drop function if exists public.punch(text, numeric, numeric, text, text);

create or replace function public.punch(
  p_type        text,
  p_lat         numeric,
  p_lng         numeric,
  p_selfie_path text,
  p_user_agent  text default null,
  p_outlet_id   text default null
) returns jsonb
language plpgsql
security definer
set search_path = attendance, core, public
as $$
declare
  my_emp     core.employees%rowtype;
  outlet     public.flax_outlets%rowtype;
  dist_m     integer;
  radius_m   integer;
  next_type  text;
  last_type  text;
  new_row    attendance.logs%rowtype;
  selfie_required boolean;
  use_outlet text;
begin
  if p_lat is null or p_lng is null then
    raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
  end if;

  select * into my_emp
  from core.employees
  where user_id = auth.uid() and deleted_at is null and is_active = true
  limit 1;

  if my_emp.id is null then
    raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001';
  end if;

  -- Pick the target outlet. Caller passes one explicitly; otherwise
  -- fall back to the home outlet for back-compat.
  use_outlet := coalesce(p_outlet_id, my_emp.outlet_id);

  if use_outlet is null then
    raise exception 'NO_OUTLET_ASSIGNED' using errcode = 'P0001';
  end if;

  -- Validate membership: caller must be a member of use_outlet.
  if not exists (
    select 1 from core.employee_outlets
     where employee_id = my_emp.id
       and outlet_id = use_outlet
  ) then
    raise exception 'OUTLET_NOT_ALLOWED outlet_id=%', use_outlet
      using errcode = 'P0001';
  end if;

  selfie_required := coalesce(
    (core.get_app_setting('selfie_required'))::boolean, true
  );
  if selfie_required and (p_selfie_path is null or length(btrim(p_selfie_path)) = 0) then
    raise exception 'SELFIE_REQUIRED' using errcode = 'P0001';
  end if;

  select * into outlet from public.flax_outlets where id = use_outlet;

  if outlet.lat is null or outlet.lng is null then
    raise exception 'OUTLET_GEOFENCE_NOT_CONFIGURED' using errcode = 'P0001';
  end if;

  radius_m := coalesce(outlet.geofence_radius_m, 200);

  dist_m := (
    2 * 6371000 *
    asin(
      sqrt(
        power(sin(radians(p_lat - outlet.lat) / 2), 2) +
        cos(radians(outlet.lat)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - outlet.lng) / 2), 2)
      )
    )
  )::integer;

  if dist_m > radius_m then
    raise exception 'OUT_OF_GEOFENCE distance_m=% radius_m=%', dist_m, radius_m
      using errcode = 'P0001';
  end if;

  if p_type is null or p_type = '' or p_type = 'auto' then
    select type into last_type
    from attendance.logs
    where employee_id = my_emp.id
    order by punched_at desc
    limit 1;

    if last_type is null or last_type = 'out' then
      next_type := 'in';
    else
      next_type := 'out';
    end if;
  elsif p_type in ('in', 'out') then
    next_type := p_type;
  else
    raise exception 'INVALID_TYPE' using errcode = 'P0001';
  end if;

  insert into attendance.logs (
    employee_id, outlet_id, type, punched_at, selfie_path, lat, lng,
    is_within_geofence, distance_m, source, device_info
  ) values (
    my_emp.id, use_outlet, next_type, now(), p_selfie_path, p_lat, p_lng,
    true, dist_m, 'self',
    coalesce(jsonb_build_object('ua', p_user_agent), '{}'::jsonb)
  )
  returning * into new_row;

  return jsonb_build_object(
    'id', new_row.id,
    'type', new_row.type,
    'punched_at', new_row.punched_at,
    'selfie_path', new_row.selfie_path,
    'is_within_geofence', new_row.is_within_geofence,
    'distance_m', new_row.distance_m,
    'outlet_id', new_row.outlet_id
  );
end;
$$;

grant execute on function public.punch(text, numeric, numeric, text, text, text) to authenticated;

notify pgrst, 'reload schema';
