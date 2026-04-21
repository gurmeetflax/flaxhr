-- Flax HR — Migration 007: Attendance module
--
-- - attendance.logs          punch-in / punch-out events
-- - public.punch()           SECURITY DEFINER RPC (lat/lng + selfie_path in,
--                            server computes geofence distance + within flag)
-- - public.v_my_today_punches  self-service view for /me
-- - public.v_today_punches     cross-outlet view for admin/hr/manager
-- - storage.buckets           attendance-selfies (private, 2MB, image MIME)
-- - storage.objects policies  upload/read restricted to the user's own folder,
--                             plus a read-all policy for admin/hr/manager/auditor

create table if not exists attendance.logs (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references core.employees(id) on delete cascade,
  outlet_id             text references public.flax_outlets(id),
  type                  text not null check (type in ('in', 'out')),
  punched_at            timestamptz not null default now(),
  selfie_path           text,
  lat                   numeric(9,6),
  lng                   numeric(9,6),
  is_within_geofence    boolean,
  distance_m            integer,
  source                text not null default 'self' check (source in ('self','regularised')),
  device_info           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists logs_employee_day_idx on attendance.logs (employee_id, punched_at desc);
create index if not exists logs_outlet_day_idx   on attendance.logs (outlet_id, punched_at desc);
create index if not exists logs_day_idx          on attendance.logs (punched_at desc);

drop trigger if exists trg_logs_audit on attendance.logs;
create trigger trg_logs_audit after insert or update or delete on attendance.logs
  for each row execute function core.log_audit();

alter table attendance.logs enable row level security;

drop policy if exists logs_admin_hr on attendance.logs;
create policy logs_admin_hr on attendance.logs
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists logs_manager on attendance.logs;
create policy logs_manager on attendance.logs
  for select
  using (core.has_role('manager') and (outlet_id is null or core.has_outlet_access(outlet_id)));

drop policy if exists logs_auditor on attendance.logs;
create policy logs_auditor on attendance.logs
  for select
  using (core.has_role('auditor'));

drop policy if exists logs_self on attendance.logs;
create policy logs_self on attendance.logs
  for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

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
  my_emp   core.employees%rowtype;
  outlet   public.flax_outlets%rowtype;
  dist_m   integer;
  within   boolean;
  new_row  attendance.logs%rowtype;
begin
  if p_type not in ('in','out') then
    raise exception 'type must be in or out';
  end if;

  select * into my_emp
  from core.employees
  where user_id = auth.uid() and deleted_at is null and is_active = true
  limit 1;

  if my_emp.id is null then
    raise exception 'No active employee profile for this user';
  end if;

  select * into outlet from public.flax_outlets where id = my_emp.outlet_id;

  if outlet.lat is null or outlet.lng is null or p_lat is null or p_lng is null then
    within := null;
    dist_m := null;
  else
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
    within := dist_m <= coalesce(outlet.geofence_radius_m, 200);
  end if;

  insert into attendance.logs (
    employee_id, outlet_id, type, punched_at, selfie_path, lat, lng,
    is_within_geofence, distance_m, source, device_info
  ) values (
    my_emp.id, my_emp.outlet_id, p_type, now(), p_selfie_path, p_lat, p_lng,
    within, dist_m, 'self',
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

create or replace view public.v_my_today_punches
with (security_invoker = true) as
  select l.id, l.type, l.punched_at, l.selfie_path,
         l.is_within_geofence, l.distance_m, l.lat, l.lng, l.outlet_id
  from attendance.logs l
  join core.employees e on e.id = l.employee_id
  where e.user_id = auth.uid()
    and (l.punched_at at time zone 'Asia/Kolkata')::date
      = (now() at time zone 'Asia/Kolkata')::date
  order by l.punched_at desc;

grant select on public.v_my_today_punches to authenticated;

create or replace view public.v_today_punches
with (security_invoker = true) as
  select l.id, l.type, l.punched_at, l.selfie_path,
         l.is_within_geofence, l.distance_m, l.lat, l.lng,
         l.outlet_id,
         e.id as employee_id, e.employee_code, e.full_name,
         o.display_name as outlet_name
  from attendance.logs l
  join core.employees e on e.id = l.employee_id
  left join public.flax_outlets o on o.id = l.outlet_id
  where (l.punched_at at time zone 'Asia/Kolkata')::date
      = (now() at time zone 'Asia/Kolkata')::date
  order by l.punched_at desc;

grant select on public.v_today_punches to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-selfies',
  'attendance-selfies',
  false,
  2 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

drop policy if exists "attendance_selfies_insert_self" on storage.objects;
create policy "attendance_selfies_insert_self" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "attendance_selfies_select_self" on storage.objects;
create policy "attendance_selfies_select_self" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "attendance_selfies_select_staff" on storage.objects;
create policy "attendance_selfies_select_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance-selfies'
    and (core.is_admin() or core.has_role('hr')
         or core.has_role('manager') or core.has_role('auditor'))
  );
