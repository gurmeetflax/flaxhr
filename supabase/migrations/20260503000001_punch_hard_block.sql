-- Flax HR — Migration 010: Punch hard-block out-of-geofence + required selfie
--
-- Replaces public.punch() so that:
--   1. selfie_path is required (cannot be null/empty)
--   2. punch is rejected with ERRCODE 'P0001' (message starts with
--      'OUT_OF_GEOFENCE') when distance_m > geofence_radius_m
--   3. employee must be linked to an outlet with lat/lng configured
--   4. is_within_geofence is always true on inserted rows (legacy nulls/false
--      can still exist from before this migration)
--
-- Toggle behaviour (auto-detect next type from last log) is added so the UI
-- can call punch() without passing 'in' or 'out' explicitly.

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
  my_emp     core.employees%rowtype;
  outlet     public.flax_outlets%rowtype;
  dist_m     integer;
  radius_m   integer;
  next_type  text;
  last_type  text;
  new_row    attendance.logs%rowtype;
begin
  if p_selfie_path is null or length(btrim(p_selfie_path)) = 0 then
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

  -- Resolve next_type: explicit param wins; otherwise toggle from last log.
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
    my_emp.id, my_emp.outlet_id, next_type, now(), p_selfie_path, p_lat, p_lng,
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

-- Self-service view: the current employee's assigned outlet, including
-- coordinates + geofence radius. Used by the PunchPage to render a live
-- distance pill and validate before calling rpc('punch').
-- security_invoker = false (default) so the view runs as its owner. The WHERE
-- clause restricts rows to the calling user's own employee record.
create or replace view public.v_my_outlet as
  select o.id, o.display_name, o.name, o.city, o.timezone,
         o.address, o.lat, o.lng, o.geofence_radius_m
  from public.flax_outlets o
  join core.employees e on e.outlet_id = o.id
  where e.user_id = auth.uid()
    and e.is_active = true
    and e.deleted_at is null;

grant select on public.v_my_outlet to authenticated;
