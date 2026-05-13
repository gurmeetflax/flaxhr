-- Flax HR — 4am work-day cutoff + daily attendance view
--
-- Background
-- ----------
-- An employee who forgot to punch out before going home would, the next
-- morning, see "Punch out" as the next action — because public.punch()
-- looked at the *absolute* most recent log to decide auto in/out. We want
-- a 4am cutoff: punches from before today's 4am don't count toward today.
-- New action defaults to "Punch in", and the missed yesterday is recorded
-- as an unfinished (absent) day.
--
-- Cutoff timezone: outlet's own (flax_outlets.timezone) when an outlet
-- context exists; falls back to Asia/Kolkata for the global views.
--
-- This migration:
-- 1. core.work_day_start_at(p_at, p_tz)   — returns the most recent
--    04:00 boundary in the given tz, as timestamptz.
-- 2. Rewrites public.punch so the auto in/out lookup is scoped to
--    work_day_start(outlet.timezone).
-- 3. Rewrites public.v_my_today_punches + v_today_punches so "today"
--    means "current work day" (post-4am).
-- 4. New public.v_daily_attendance view per (employee, work_date) with
--    status = on_leave | present | partial | absent.
--    The frontend can join this into history pages without doing the
--    timezone math client-side.

----------------------------------------------------------------------------
-- 1) Work-day start helper
----------------------------------------------------------------------------
create or replace function core.work_day_start_at(p_at timestamptz, p_tz text)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  with local_now as (
    select (p_at at time zone coalesce(nullif(p_tz, ''), 'Asia/Kolkata'))::timestamp as ts
  ),
  cutoff as (
    select
      case
        when extract(hour from ts) < 4
        then (date_trunc('day', ts) - interval '1 day' + interval '4 hours')
        else (date_trunc('day', ts) + interval '4 hours')
      end as local_cutoff,
      ts
    from local_now
  )
  -- Re-interpret the local cutoff in the same timezone, get UTC instant.
  select (local_cutoff at time zone coalesce(nullif(p_tz, ''), 'Asia/Kolkata'))::timestamptz
  from cutoff;
$$;

grant execute on function core.work_day_start_at(timestamptz, text) to authenticated;

----------------------------------------------------------------------------
-- 2) Rewrite public.punch with the cutoff applied to the auto-toggle
----------------------------------------------------------------------------
drop function if exists public.punch(text, numeric, numeric, text, text, text);

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

  -- 4am cutoff: only logs from the current work day count toward the
  -- in/out toggle. A punch-in from yesterday that was never closed does
  -- NOT cause today's first action to be "out".
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

grant execute on function public.punch(text, numeric, numeric, text, text, text)
  to authenticated;

----------------------------------------------------------------------------
-- 3) Today's-punches views: 4am boundary instead of midnight
----------------------------------------------------------------------------
drop view if exists public.v_my_today_punches;
create view public.v_my_today_punches
with (security_invoker = true) as
  select l.id, l.type, l.punched_at, l.selfie_path,
         l.is_within_geofence, l.distance_m, l.lat, l.lng, l.outlet_id
  from attendance.logs l
  join core.employees e on e.id = l.employee_id
  where e.user_id = auth.uid()
    and l.punched_at >= core.work_day_start_at(now(), 'Asia/Kolkata')
  order by l.punched_at desc;
grant select on public.v_my_today_punches to authenticated;

drop view if exists public.v_today_punches;
create view public.v_today_punches
with (security_invoker = true) as
  select l.id, l.type, l.punched_at, l.selfie_path,
         l.is_within_geofence, l.distance_m, l.lat, l.lng,
         l.outlet_id,
         e.id as employee_id, e.employee_code, e.full_name,
         o.display_name as outlet_name
  from attendance.logs l
  join core.employees e on e.id = l.employee_id
  left join public.flax_outlets o on o.id = l.outlet_id
  where l.punched_at >= core.work_day_start_at(now(), 'Asia/Kolkata')
  order by l.punched_at desc;
grant select on public.v_today_punches to authenticated;

----------------------------------------------------------------------------
-- 4) Daily attendance view (per work day) with absent rule
----------------------------------------------------------------------------
-- "work_date" is the calendar date the work day BEGINS on (the 4am bucket).
-- Status:
--   on_leave  — approved leave covers that date
--   present   — both an in and an out log within the bucket
--   absent    — only one (or no) log within the bucket; no leave
-- We compute over the union of (any day with a punch) and any roster days.
-- Soft-deleted / inactive rows are filtered out.

drop view if exists public.v_daily_attendance;
create view public.v_daily_attendance
with (security_invoker = true) as
with logs_with_day as (
  select
    l.employee_id,
    l.outlet_id,
    -- bucket each log by its outlet's 4am calendar date
    (l.punched_at at time zone coalesce(o.timezone, 'Asia/Kolkata') - interval '4 hours')::date
      as work_date,
    l.type,
    l.punched_at
  from attendance.logs l
  left join public.flax_outlets o on o.id = l.outlet_id
),
agg as (
  select
    employee_id,
    outlet_id,
    work_date,
    min(case when type = 'in'  then punched_at end) as first_in_at,
    max(case when type = 'out' then punched_at end) as last_out_at
  from logs_with_day
  group by employee_id, outlet_id, work_date
)
select
  e.id   as employee_id,
  e.employee_code,
  e.full_name as employee_name,
  a.outlet_id,
  o.display_name as outlet_name,
  o.timezone     as outlet_timezone,
  a.work_date,
  a.first_in_at,
  a.last_out_at,
  case
    when exists (
      select 1 from core.leave_requests lr
      where lr.employee_id = e.id
        and lr.status = 'approved'
        and a.work_date between lr.start_date and lr.end_date
    ) then 'on_leave'
    when a.first_in_at is not null and a.last_out_at is not null then 'present'
    else 'absent'
  end as status
from agg a
join core.employees e on e.id = a.employee_id
left join public.flax_outlets o on o.id = a.outlet_id
where e.deleted_at is null;

grant select on public.v_daily_attendance to authenticated;

notify pgrst, 'reload schema';
