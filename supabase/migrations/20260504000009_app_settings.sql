-- Flax HR — Migration 025: app settings + selfie_required toggle
--
-- Tiny key/value table for app-wide toggles. First customer is
-- selfie_required: when off, the punch RPC accepts a NULL selfie_path
-- and the client skips the camera capture step.
--
-- Future settings live in the same table (jsonb value), so we don't add
-- a new column or table for every flag.

create table if not exists core.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

drop trigger if exists trg_app_settings_audit on core.app_settings;
create trigger trg_app_settings_audit
  after insert or update or delete on core.app_settings
  for each row execute function core.log_audit();

drop trigger if exists trg_app_settings_touch on core.app_settings;
create trigger trg_app_settings_touch
  before update on core.app_settings
  for each row execute function core.set_updated_at();

alter table core.app_settings enable row level security;

drop policy if exists app_settings_read_all on core.app_settings;
create policy app_settings_read_all on core.app_settings
  for select using (auth.uid() is not null);

drop policy if exists app_settings_admin_write on core.app_settings;
create policy app_settings_admin_write on core.app_settings
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- Seed default: selfie_required = true (preserves existing behaviour).
insert into core.app_settings (key, value)
  values ('selfie_required', 'true'::jsonb)
  on conflict (key) do nothing;

-- Helper for server-side reads (used by the punch RPC).
create or replace function core.get_app_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = core, public
as $$
  select value from core.app_settings where key = p_key;
$$;

grant execute on function core.get_app_setting(text) to authenticated;

-- Public read view for the client.
create or replace view public.v_app_settings
with (security_invoker = true) as
  select key, value, updated_at
  from core.app_settings;

grant select on public.v_app_settings to authenticated;

-- Admin/HR-only write RPC.
create or replace function public.set_app_setting(
  p_key   text,
  p_value jsonb
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  insert into core.app_settings (key, value, updated_by)
    values (p_key, p_value, auth.uid())
    on conflict (key) do update
      set value = excluded.value,
          updated_by = auth.uid(),
          updated_at = now();
end;
$$;

grant execute on function public.set_app_setting(text, jsonb) to authenticated;

-- Re-create public.punch so the selfie check honours the
-- selfie_required app setting. Everything else is identical to the
-- punch_hard_block migration.
create or replace function public.punch(
  p_type        text,
  p_lat         numeric,
  p_lng         numeric,
  p_selfie_path text,
  p_user_agent  text default null
) returns jsonb
language plpgsql
security definer
set search_path = attendance, core, public
as $$
declare
  my_emp           core.employees%rowtype;
  outlet           public.flax_outlets%rowtype;
  dist_m           integer;
  radius_m         integer;
  next_type        text;
  last_type        text;
  new_row          attendance.logs%rowtype;
  selfie_required  boolean;
begin
  -- Read the toggle. Defaults to true if the row is missing for any reason.
  selfie_required := coalesce((core.get_app_setting('selfie_required'))::boolean, true);

  if selfie_required and (p_selfie_path is null or length(btrim(p_selfie_path)) = 0) then
    raise exception 'SELFIE_REQUIRED' using errcode = 'P0001';
  end if;

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

  if my_emp.outlet_id is null then
    raise exception 'NO_OUTLET_ASSIGNED' using errcode = 'P0001';
  end if;

  select * into outlet from public.flax_outlets where id = my_emp.outlet_id;

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
    my_emp.id, my_emp.outlet_id, next_type, now(),
    nullif(btrim(p_selfie_path), ''), p_lat, p_lng,
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

grant execute on function public.punch(text, numeric, numeric, text, text) to authenticated;
