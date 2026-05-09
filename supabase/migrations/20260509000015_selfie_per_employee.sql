-- Flax HR — Migration 042: Per-employee selfie override
alter table core.employees
  add column if not exists selfie_required boolean;

drop view if exists public.v_employees;
create view public.v_employees with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id,
         e.first_name, e.last_name, e.full_name,
         e.personal_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         e.monthly_salary, e.exit_date, e.exit_reason,
         e.designation_code,
         e.date_of_birth, e.address,
         e.emergency_contact_name, e.emergency_contact_phone,
         e.home_lat, e.home_lng,
         e.aadhaar_last4, e.pan_last4,
         e.kyc_status, e.kyc_verified_at, e.kyc_verified_by, e.kyc_notes,
         e.selfie_required,
         o.display_name as outlet_name,
         o.city as outlet_city
    from core.employees e
    left join public.flax_outlets o on o.id = e.outlet_id
   where e.deleted_at is null;
grant select on public.v_employees to authenticated;

drop view if exists public.v_my_employee;
create view public.v_my_employee with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id,
         e.first_name, e.last_name, e.full_name,
         e.personal_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.monthly_salary,
         e.date_of_birth, e.address,
         e.emergency_contact_name, e.emergency_contact_phone,
         e.home_lat, e.home_lng,
         e.aadhaar_last4, e.pan_last4,
         e.aadhaar_doc_path, e.pan_doc_path,
         e.kyc_status, e.kyc_verified_at, e.kyc_notes,
         e.selfie_required
    from core.employees e
   where e.user_id = auth.uid() and e.deleted_at is null;
grant select on public.v_my_employee to authenticated;

drop function if exists public.punch(text, numeric, numeric, text, text, text);
create or replace function public.punch(
  p_type text, p_lat numeric, p_lng numeric, p_selfie_path text,
  p_user_agent text default null, p_outlet_id text default null
) returns jsonb
language plpgsql security definer set search_path = attendance, core, public as $$
declare
  my_emp core.employees%rowtype; outlet public.flax_outlets%rowtype;
  dist_m integer; radius_m integer; next_type text; last_type text;
  new_row attendance.logs%rowtype; selfie_required boolean; use_outlet text;
begin
  if p_lat is null or p_lng is null then raise exception 'LOCATION_REQUIRED' using errcode = 'P0001'; end if;
  select * into my_emp from core.employees
   where user_id = auth.uid() and deleted_at is null and is_active = true limit 1;
  if my_emp.id is null then raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001'; end if;
  use_outlet := coalesce(p_outlet_id, my_emp.outlet_id);
  if use_outlet is null then raise exception 'NO_OUTLET_ASSIGNED' using errcode = 'P0001'; end if;
  if not exists (select 1 from core.employee_outlets
     where employee_id = my_emp.id and outlet_id = use_outlet) then
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
  dist_m := (2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - outlet.lat) / 2), 2) +
      cos(radians(outlet.lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - outlet.lng) / 2), 2))))::integer;
  if dist_m > radius_m then
    raise exception 'OUT_OF_GEOFENCE distance_m=% radius_m=%', dist_m, radius_m using errcode = 'P0001';
  end if;
  if p_type is null or p_type = '' or p_type = 'auto' then
    select type into last_type from attendance.logs
     where employee_id = my_emp.id order by punched_at desc limit 1;
    if last_type is null or last_type = 'out' then next_type := 'in';
    else next_type := 'out'; end if;
  elsif p_type in ('in','out') then next_type := p_type;
  else raise exception 'INVALID_TYPE' using errcode = 'P0001'; end if;
  insert into attendance.logs (employee_id, outlet_id, type, punched_at, selfie_path, lat, lng,
    is_within_geofence, distance_m, source, device_info)
  values (my_emp.id, use_outlet, next_type, now(), p_selfie_path, p_lat, p_lng,
    true, dist_m, 'self', coalesce(jsonb_build_object('ua', p_user_agent), '{}'::jsonb))
  returning * into new_row;
  return jsonb_build_object(
    'id', new_row.id, 'type', new_row.type, 'punched_at', new_row.punched_at,
    'selfie_path', new_row.selfie_path, 'is_within_geofence', new_row.is_within_geofence,
    'distance_m', new_row.distance_m, 'outlet_id', new_row.outlet_id);
end;
$$;
grant execute on function public.punch(text, numeric, numeric, text, text, text) to authenticated;
notify pgrst, 'reload schema';
