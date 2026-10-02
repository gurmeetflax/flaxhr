-- Flax HR — Fix punch() regression from 20260514000019
--
-- The accuracy-guard migration rebuilt punch() from an old base and
-- lost three behaviours of the live version:
--   * selfie_required setting (global + per-employee) — selfie was
--     forced on every punch even with the setting off
--   * core.employee_outlets allow-list (OUTLET_NOT_ALLOWED)
--   * 4am work-day cutoff for the in/out toggle
-- Restore all three and keep the GPS accuracy guard.

create or replace function public.punch(
  p_type        text,
  p_lat         numeric,
  p_lng         numeric,
  p_selfie_path text,
  p_user_agent  text,
  p_outlet_id   text,
  p_accuracy_m  integer
) returns jsonb
language plpgsql
security definer
set search_path = attendance, core, public
as $body$
declare
  my_emp           core.employees%rowtype;
  outlet           public.flax_outlets%rowtype;
  dist_m           integer;
  radius_m         integer;
  next_type        text;
  last_type        text;
  new_row          attendance.logs%rowtype;
  selfie_required  boolean;
  use_outlet       text;
  work_start       timestamptz;
  max_accuracy     int;
begin
  if p_lat is null or p_lng is null then
    raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
  end if;

  select coalesce(nullif(value::text, 'null')::int, 0) into max_accuracy
    from core.app_settings where key = 'punch_max_accuracy_m';
  if coalesce(max_accuracy, 0) > 0
     and p_accuracy_m is not null and p_accuracy_m > max_accuracy then
    raise exception 'LOW_GPS_ACCURACY accuracy_m=% max_m=%', p_accuracy_m, max_accuracy
      using errcode = 'P0001';
  end if;

  select * into my_emp from core.employees
   where user_id = auth.uid() and deleted_at is null and is_active = true
   limit 1;
  if my_emp.id is null then
    raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001';
  end if;

  use_outlet := coalesce(p_outlet_id, my_emp.outlet_id);
  if use_outlet is null then
    raise exception 'NO_OUTLET_ASSIGNED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from core.employee_outlets
     where employee_id = my_emp.id and outlet_id = use_outlet
  ) then
    raise exception 'OUTLET_NOT_ALLOWED outlet_id=%', use_outlet using errcode = 'P0001';
  end if;

  selfie_required := coalesce(
    my_emp.selfie_required,
    (core.get_app_setting('selfie_required'))::boolean,
    true
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
    asin(sqrt(
      power(sin(radians(p_lat - outlet.lat) / 2), 2) +
      cos(radians(outlet.lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - outlet.lng) / 2), 2)
    ))
  )::integer;
  if dist_m > radius_m then
    raise exception 'OUT_OF_GEOFENCE distance_m=% radius_m=%', dist_m, radius_m
      using errcode = 'P0001';
  end if;

  work_start := core.work_day_start_at(now(), outlet.timezone);

  if p_type is null or p_type = '' or p_type = 'auto' then
    select type into last_type
      from attendance.logs
     where employee_id = my_emp.id
       and punched_at >= work_start
     order by punched_at desc
     limit 1;
    if last_type is null or last_type = 'out' then
      next_type := 'in';
    else
      next_type := 'out';
    end if;
  elsif p_type in ('in','out') then
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
    coalesce(jsonb_build_object('ua', p_user_agent, 'accuracy_m', p_accuracy_m), '{}'::jsonb)
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
$body$;

grant execute on function public.punch(text, numeric, numeric, text, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
