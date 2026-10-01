-- Flax HR — Operations dashboard reacts to the city filter
--
-- Before this change admin_dashboard_summary accepted outlet_id only, so
-- selecting a city but leaving outlet = "All outlets" produced the
-- global KPI set. Add p_city so the dashboard pills behave as users
-- expect — every KPI narrows to the picked city.
--
-- Signature changes from (date, text) to (date, text, text), so we drop
-- the old function before recreating.

drop function if exists public.admin_dashboard_summary(date, text);

create or replace function public.admin_dashboard_summary(
  p_period_month date default current_date,
  p_outlet_id    text default null,
  p_city         text default null
) returns table (
  period_month       date,
  outlet_id          text,
  city               text,
  headcount          int,
  joiners            int,
  leavers            int,
  attrition_pct      numeric,
  manpower_cost      numeric,
  sales              numeric,
  manpower_cost_pct  numeric,
  present_today      int,
  late_today         int,
  absent_today       int,
  on_leave_today     int
)
language plpgsql
security definer
set search_path = core, attendance, public
as $$
declare
  period_start date := date_trunc('month', p_period_month)::date;
  period_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  hc_start     int;
  hc_end       int;
  hc_avg       numeric;
  total_sales  numeric;
  cost         numeric;
  joined       int;
  left_count   int;
  pres_today   int;
  late_count   int;
  rostered_today int;
  on_leave     int;
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select count(*) into hc_start from core.employees e
   where e.deleted_at is null
     and (e.hired_on is null or e.hired_on <= period_start)
     and (e.exit_date is null or e.exit_date >= period_start)
     and (p_outlet_id is null or e.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = e.outlet_id and o.city = p_city
     ));

  select count(*) into hc_end from core.employees e
   where e.deleted_at is null
     and (e.hired_on is null or e.hired_on <= period_end)
     and (e.exit_date is null or e.exit_date >= period_end)
     and (p_outlet_id is null or e.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = e.outlet_id and o.city = p_city
     ));

  hc_avg := nullif((hc_start + hc_end)::numeric / 2.0, 0);

  select count(*) into joined from core.employees e
   where e.deleted_at is null
     and e.hired_on between period_start and period_end
     and (p_outlet_id is null or e.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = e.outlet_id and o.city = p_city
     ));

  select count(*) into left_count from core.employees e
   where e.deleted_at is null
     and e.exit_date between period_start and period_end
     and (p_outlet_id is null or e.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = e.outlet_id and o.city = p_city
     ));

  select coalesce(sum(e.monthly_salary), 0) into cost from core.employees e
   where e.deleted_at is null
     and e.monthly_salary is not null
     and (e.hired_on is null or e.hired_on <= period_end)
     and (e.exit_date is null or e.exit_date >= period_start)
     and (p_outlet_id is null or e.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = e.outlet_id and o.city = p_city
     ));

  select coalesce(sum(s.amount), 0) into total_sales
    from core.outlet_monthly_sales s
   where s.period_month = period_start
     and (p_outlet_id is null or s.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = s.outlet_id and o.city = p_city
     ));

  select count(distinct l.employee_id) into pres_today
    from attendance.logs l
    join core.employees e on e.id = l.employee_id
   where l.type = 'in'
     and l.punched_at::date = current_date
     and (p_outlet_id is null or e.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = e.outlet_id and o.city = p_city
     ));

  select count(*) into rostered_today
    from core.roster_entries r
    join core.employees e on e.id = r.employee_id
   where r.work_date = current_date
     and r.status = 'published'
     and (p_outlet_id is null or e.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = e.outlet_id and o.city = p_city
     ));

  select count(*) into late_count from (
    select distinct on (l.employee_id)
      l.employee_id, l.punched_at, s.start_time, s.grace_in_minutes, e.outlet_id
      from attendance.logs l
      join core.employees e on e.id = l.employee_id
      left join core.roster_entries r on r.employee_id = l.employee_id and r.work_date = current_date
      left join core.shifts s on s.id = r.shift_id
     where l.type = 'in' and l.punched_at::date = current_date
     order by l.employee_id, l.punched_at asc
  ) firsts
  where firsts.start_time is not null
    and firsts.punched_at::time > (firsts.start_time + (firsts.grace_in_minutes || ' minutes')::interval)
    and (p_outlet_id is null or firsts.outlet_id = p_outlet_id)
    and (p_city is null or exists (
      select 1 from public.flax_outlets o
      where o.id = firsts.outlet_id and o.city = p_city
    ));

  select count(distinct lr.employee_id) into on_leave
    from core.leave_requests lr
    join core.employees e on e.id = lr.employee_id
   where lr.status = 'approved'
     and current_date between lr.start_date and lr.end_date
     and (p_outlet_id is null or e.outlet_id = p_outlet_id)
     and (p_city is null or exists (
       select 1 from public.flax_outlets o
       where o.id = e.outlet_id and o.city = p_city
     ));

  return query select
    period_start,
    p_outlet_id,
    p_city,
    coalesce(hc_end, 0),
    coalesce(joined, 0),
    coalesce(left_count, 0),
    case when hc_avg is null or hc_avg = 0 then 0 else round((left_count::numeric / hc_avg) * 100, 2) end,
    cost,
    total_sales,
    case when total_sales is null or total_sales = 0 then null else round((cost / total_sales) * 100, 2) end,
    coalesce(pres_today, 0),
    coalesce(late_count, 0),
    greatest(coalesce(rostered_today, 0) - coalesce(pres_today, 0) - coalesce(on_leave, 0), 0),
    coalesce(on_leave, 0);
end;
$$;

grant execute on function public.admin_dashboard_summary(date, text, text) to authenticated;

notify pgrst, 'reload schema';
