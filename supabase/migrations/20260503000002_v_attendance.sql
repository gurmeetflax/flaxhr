-- Flax HR — Migration 011: v_attendance for admin/HR/manager dashboard
--
-- Joins attendance.logs with the employee + outlet for cross-outlet listing.
-- security_invoker=true so the existing RLS on attendance.logs gates access:
--   - admin / hr  : all rows
--   - manager     : own outlet rows
--   - auditor     : all rows (read-only)
--   - employee    : own rows only

create or replace view public.v_attendance
with (security_invoker = true) as
  select
    l.id,
    l.type,
    l.punched_at,
    l.selfie_path,
    l.is_within_geofence,
    l.distance_m,
    l.lat,
    l.lng,
    l.source,
    l.outlet_id,
    o.display_name as outlet_name,
    o.timezone     as outlet_timezone,
    o.geofence_radius_m,
    e.id           as employee_id,
    e.employee_code,
    e.full_name    as employee_name
  from attendance.logs l
  join core.employees e on e.id = l.employee_id
  left join public.flax_outlets o on o.id = l.outlet_id
  order by l.punched_at desc;

grant select on public.v_attendance to authenticated;
