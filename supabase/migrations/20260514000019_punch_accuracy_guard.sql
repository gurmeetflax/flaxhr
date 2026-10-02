-- Flax HR — Server-side GPS accuracy guard for punches
--
-- Devices routinely report wifi-only ±2000 m fixes that let an
-- employee punch from blocks away as long as the (noisy) point
-- happens to land inside the geofence. Add an app-settings threshold
-- and reject anything wider.
--
-- Default 100 m — tweak via SQL or the admin settings UI:
--   update core.app_settings
--      set value = jsonb_build_object('punch_max_accuracy_m', 150)
--    where key = 'punch_max_accuracy_m';
--
-- Signature changes (adds p_accuracy_m), so we drop the old function
-- before recreating.

insert into core.app_settings (key, value)
values ('punch_max_accuracy_m', to_jsonb(100))
on conflict (key) do nothing;

drop function if exists public.punch(text, numeric, numeric, text, text);
drop function if exists public.punch(text, numeric, numeric, text, text, text);

create or replace function public.punch(
  p_type        text,
  p_lat         numeric,
  p_lng         numeric,
  p_selfie_path text,
  p_user_agent  text default null,
  p_outlet_id   text default null,
  p_accuracy_m  integer default null
) returns jsonb
language plpgsql
security definer
set search_path = attendance, core, public
as $$
declare
  my_emp        core.employees%rowtype;
  outlet        public.flax_outlets%rowtype;
  dist_m        integer;
  radius_m      integer;
  next_type     text;
  last_type     text;
  new_row       attendance.logs%rowtype;
  max_accuracy  int;
begin
  if p_selfie_path is null or length(btrim(p_selfie_path)) = 0 then
    raise exception 'SELFIE_REQUIRED' using errcode = 'P0001';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
  end if;

  -- Accuracy guard — reject fixes wider than the configured threshold.
  -- A null threshold or null accuracy means "don't check".
  select coalesce(nullif(value::text, 'null')::int, 0) into max_accuracy
    from core.app_settings where key = 'punch_max_accuracy_m';
  if max_accuracy is not null and max_accuracy > 0
     and p_accuracy_m is not null and p_accuracy_m > max_accuracy then
    raise exception 'LOW_GPS_ACCURACY accuracy_m=% max_m=%', p_accuracy_m, max_accuracy
      using errcode = 'P0001';
  end if;

  select * into my_emp
  from core.employees
  where user_id = auth.uid() and deleted_at is null and is_active = true
  limit 1;

  if my_emp.id is null then
    raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001';
  end if;

  if coalesce(p_outlet_id, my_emp.outlet_id) is null then
    raise exception 'NO_OUTLET_ASSIGNED' using errcode = 'P0001';
  end if;

  select * into outlet from public.flax_outlets
   where id = coalesce(p_outlet_id, my_emp.outlet_id);

  if outlet.id is null then
    raise exception 'OUTLET_NOT_FOUND' using errcode = 'P0001';
  end if;

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
    my_emp.id, outlet.id, next_type, now(), p_selfie_path, p_lat, p_lng,
    true, dist_m, 'self',
    coalesce(
      jsonb_build_object('ua', p_user_agent, 'accuracy_m', p_accuracy_m),
      '{}'::jsonb
    )
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

grant execute on function public.punch(text, numeric, numeric, text, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
