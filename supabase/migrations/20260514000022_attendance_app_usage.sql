-- Flax HR — who is (and isn't) punching in the app
--
-- One row per active employee with their punches since a chosen date,
-- so the Attendance tab can list people who haven't punched today or
-- haven't used the app since a given day. Regularised punches don't
-- count as using the app. Managers only see outlets they have access to.

create or replace function public.attendance_app_usage(p_since date default current_date)
returns table (
  employee_id    uuid,
  employee_code  text,
  full_name      text,
  phone          text,
  outlet_id      text,
  outlet_name    text,
  city           text,
  has_login      boolean,
  last_punch_at  timestamptz,
  punches_since  int,
  days_since     int,
  on_leave_today boolean
)
language plpgsql
stable
security definer
set search_path = core, attendance, public
as $$
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
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
  select e.id,
         e.employee_code,
         e.full_name,
         e.phone,
         e.outlet_id,
         o.display_name,
         o.city,
         e.user_id is not null,
         p.last_at,
         coalesce(p.n, 0)::int,
         coalesce(p.d, 0)::int,
         exists (
           select 1 from core.leave_requests lr
            where lr.employee_id = e.id
              and lr.status = 'approved'
              and (now() at time zone 'Asia/Kolkata')::date between lr.start_date and lr.end_date
         )
    from core.employees e
    left join public.flax_outlets o on o.id = e.outlet_id
    left join p on p.employee_id = e.id
   where e.is_active
     and e.deleted_at is null
     and (e.exit_date is null or e.exit_date > (now() at time zone 'Asia/Kolkata')::date)
     and (core.is_admin() or core.has_role('hr') or core.has_outlet_access(e.outlet_id))
   order by p.last_at nulls first, o.display_name, e.full_name;
end;
$$;

revoke all on function public.attendance_app_usage(date) from public, anon;
grant execute on function public.attendance_app_usage(date) to authenticated;

notify pgrst, 'reload schema';
