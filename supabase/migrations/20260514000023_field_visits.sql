-- Flax HR — field staff and meeting check-in / check-out
--
-- Sales staff spend the day at client meetings, not an outlet, so:
--   1. core.employees.field_staff lets the day punch work from anywhere.
--      Location is still recorded; off-site punches are marked so.
--   2. attendance.field_visits logs each meeting: who, where (GPS at
--      check-in and check-out), client, purpose and outcome notes.
-- Writes go through the RPCs below; staff read only their own visits.

alter table core.employees
  add column if not exists field_staff boolean not null default false;

create table if not exists attendance.field_visits (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references core.employees(id) on delete cascade,
  client_name       text not null check (length(btrim(client_name)) > 0),
  purpose           text,
  check_in_at       timestamptz not null default now(),
  check_in_lat      numeric(9,6) not null,
  check_in_lng      numeric(9,6) not null,
  check_in_accuracy_m integer,
  check_out_at      timestamptz,
  check_out_lat     numeric(9,6),
  check_out_lng     numeric(9,6),
  check_out_accuracy_m integer,
  outcome           text,
  created_at        timestamptz not null default now()
);

create index if not exists field_visits_emp_idx on attendance.field_visits (employee_id, check_in_at desc);
create index if not exists field_visits_day_idx on attendance.field_visits (check_in_at desc);
-- One open meeting per person at a time.
create unique index if not exists field_visits_one_open
  on attendance.field_visits (employee_id) where check_out_at is null;

alter table attendance.field_visits enable row level security;

drop policy if exists field_visits_select on attendance.field_visits;
create policy field_visits_select on attendance.field_visits
  for select to authenticated
  using (
    employee_id in (select id from core.employees where user_id = auth.uid())
    or core.is_admin() or core.has_role('hr')
    or exists (
      select 1 from core.employees e
       where e.id = field_visits.employee_id and core.has_outlet_access(e.outlet_id)
         and core.has_role('manager')
    )
  );

grant select on attendance.field_visits to authenticated;

-- Admin listing with names and duration.
create or replace view public.v_field_visits
with (security_invoker = true) as
select v.id,
       v.employee_id,
       e.employee_code,
       e.full_name as employee_name,
       e.outlet_id,
       v.client_name,
       v.purpose,
       v.outcome,
       v.check_in_at,
       v.check_in_lat,
       v.check_in_lng,
       v.check_in_accuracy_m,
       v.check_out_at,
       v.check_out_lat,
       v.check_out_lng,
       v.check_out_accuracy_m,
       case when v.check_out_at is not null
            then round(extract(epoch from (v.check_out_at - v.check_in_at)) / 60)::int end as duration_min
  from attendance.field_visits v
  join core.employees e on e.id = v.employee_id;

grant select on public.v_field_visits to authenticated;

create or replace function public.field_visit_check_in(
  p_client_name text,
  p_purpose     text,
  p_lat         numeric,
  p_lng         numeric,
  p_accuracy_m  integer default null
) returns jsonb
language plpgsql
security definer
set search_path = attendance, core, public
as $$
declare
  my_emp core.employees%rowtype;
  new_row attendance.field_visits%rowtype;
begin
  if p_lat is null or p_lng is null then
    raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_client_name is null or length(btrim(p_client_name)) = 0 then
    raise exception 'CLIENT_REQUIRED' using errcode = 'P0001';
  end if;

  select * into my_emp from core.employees
   where user_id = auth.uid() and deleted_at is null and is_active = true
   limit 1;
  if my_emp.id is null then
    raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001';
  end if;
  if not my_emp.field_staff then
    raise exception 'NOT_FIELD_STAFF' using errcode = 'P0001';
  end if;
  if exists (select 1 from attendance.field_visits
              where employee_id = my_emp.id and check_out_at is null) then
    raise exception 'MEETING_ALREADY_OPEN' using errcode = 'P0001';
  end if;

  insert into attendance.field_visits (
    employee_id, client_name, purpose, check_in_lat, check_in_lng, check_in_accuracy_m
  ) values (
    my_emp.id, btrim(p_client_name), nullif(btrim(coalesce(p_purpose, '')), ''),
    p_lat, p_lng, p_accuracy_m
  )
  returning * into new_row;
  return to_jsonb(new_row);
end;
$$;

create or replace function public.field_visit_check_out(
  p_outcome    text,
  p_lat        numeric,
  p_lng        numeric,
  p_accuracy_m integer default null
) returns jsonb
language plpgsql
security definer
set search_path = attendance, core, public
as $$
declare
  my_emp core.employees%rowtype;
  new_row attendance.field_visits%rowtype;
begin
  if p_lat is null or p_lng is null then
    raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
  end if;

  select * into my_emp from core.employees
   where user_id = auth.uid() and deleted_at is null and is_active = true
   limit 1;
  if my_emp.id is null then
    raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001';
  end if;

  update attendance.field_visits
     set check_out_at = now(),
         check_out_lat = p_lat,
         check_out_lng = p_lng,
         check_out_accuracy_m = p_accuracy_m,
         outcome = nullif(btrim(coalesce(p_outcome, '')), '')
   where employee_id = my_emp.id and check_out_at is null
  returning * into new_row;

  if new_row.id is null then
    raise exception 'NO_OPEN_MEETING' using errcode = 'P0001';
  end if;
  return to_jsonb(new_row);
end;
$$;

revoke all on function public.field_visit_check_in(text, text, numeric, numeric, integer) from public, anon;
revoke all on function public.field_visit_check_out(text, numeric, numeric, integer) from public, anon;
grant execute on function public.field_visit_check_in(text, text, numeric, numeric, integer) to authenticated;
grant execute on function public.field_visit_check_out(text, numeric, numeric, integer) to authenticated;

-- Day punch: field staff may punch away from the outlet. Identical to
-- 20260514000020 except the geofence check and is_within_geofence.
create or replace function public.punch(p_type text, p_lat numeric, p_lng numeric, p_selfie_path text, p_user_agent text, p_outlet_id text, p_accuracy_m integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'attendance', 'core', 'public'
as $function$
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
  if dist_m > radius_m and not my_emp.field_staff then
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
    dist_m <= radius_m, dist_m, 'self',
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
$function$;

-- Expose the flag to the signed-in employee (column appended at the end).
create or replace view public.v_my_employee with (security_invoker = true) as
select id, employee_code, user_id, first_name, last_name, full_name, personal_email, phone,
       outlet_id, is_active, hired_on, monthly_salary, date_of_birth, address,
       emergency_contact_name, emergency_contact_phone, home_lat, home_lng, aadhaar_last4,
       pan_last4, aadhaar_doc_path, pan_doc_path, kyc_status, kyc_verified_at, kyc_notes,
       selfie_required, pf_enabled, pt_enabled, esic_enabled, field_staff
  from core.employees e
 where user_id = auth.uid() and deleted_at is null;

create or replace view public.v_employees with (security_invoker = true) as
select e.id, e.employee_code, e.user_id, e.first_name, e.last_name, e.full_name, e.personal_email,
       e.phone, e.outlet_id, e.is_active, e.hired_on, e.created_at, e.updated_at, e.monthly_salary,
       e.exit_date, e.exit_reason, e.designation_code, e.date_of_birth, e.address,
       e.emergency_contact_name, e.emergency_contact_phone, e.home_lat, e.home_lng, e.aadhaar_last4,
       e.pan_last4, e.kyc_status, e.kyc_verified_at, e.kyc_verified_by, e.kyc_notes,
       e.selfie_required, e.pf_enabled, e.pt_enabled, e.esic_enabled,
       o.display_name as outlet_name, o.city as outlet_city, d.name as designation_name,
       e.field_staff
  from core.employees e
  left join flax_outlets o on o.id = e.outlet_id
  left join core.designations d on d.code = e.designation_code
 where e.deleted_at is null;

-- Azhar (sales) is the first field staff member.
update core.employees set field_staff = true where employee_code = 'FLAX0201';

notify pgrst, 'reload schema';

-- Let the daily Slack digest (service role) read app usage too.
create or replace function public.attendance_app_usage(p_since date default current_date)
returns table (
  employee_id uuid, employee_code text, full_name text, phone text, outlet_id text, outlet_name text,
  city text, has_login boolean, last_punch_at timestamptz, punches_since int, days_since int, on_leave_today boolean
)
language plpgsql stable security definer
set search_path = core, attendance, public
as $$
declare
  is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if not (is_service or core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return query
  with p as (
    select l.employee_id,
           max(l.punched_at) as last_at,
           count(*) filter (where l.punched_at >= (p_since::timestamp at time zone 'Asia/Kolkata')) as n,
           count(distinct (l.punched_at at time zone 'Asia/Kolkata')::date)
             filter (where l.punched_at >= (p_since::timestamp at time zone 'Asia/Kolkata')) as d
      from attendance.logs l
     where l.source is distinct from 'regularised'
     group by l.employee_id
  )
  select e.id, e.employee_code, e.full_name, e.phone, e.outlet_id, o.display_name, o.city,
         e.user_id is not null, p.last_at, coalesce(p.n, 0)::int, coalesce(p.d, 0)::int,
         exists (
           select 1 from core.leave_requests lr
            where lr.employee_id = e.id and lr.status = 'approved'
              and (now() at time zone 'Asia/Kolkata')::date between lr.start_date and lr.end_date
         )
    from core.employees e
    left join public.flax_outlets o on o.id = e.outlet_id
    left join p on p.employee_id = e.id
   where e.is_active
     and e.deleted_at is null
     and (e.exit_date is null or e.exit_date > (now() at time zone 'Asia/Kolkata')::date)
     and (is_service or core.is_admin() or core.has_role('hr') or core.has_outlet_access(e.outlet_id))
   order by p.last_at nulls first, o.display_name, e.full_name;
end;
$$;
grant execute on function public.attendance_app_usage(date) to service_role;

notify pgrst, 'reload schema';
