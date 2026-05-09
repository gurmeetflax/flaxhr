-- Flax HR — Migration 038: /me incentives view (Phase 13.5)
create or replace view public.v_my_incentives
with (security_invoker = true) as
  select ln.run_id,
         ln.employee_id,
         r.outlet_id,
         o.display_name as outlet_name,
         r.period_month,
         r.status,
         ln.designation_code,
         ln.designation_name,
         ln.days_present,
         ln.points_per_day,
         ln.total_points,
         ln.sc_payable
    from core.outlet_sc_run_lines ln
    join core.outlet_sc_runs r on r.id = ln.run_id
    join core.employees e on e.id = ln.employee_id
    left join public.flax_outlets o on o.id = r.outlet_id
   where r.status = 'final'
     and e.user_id = auth.uid();
grant select on public.v_my_incentives to authenticated;
notify pgrst, 'reload schema';
