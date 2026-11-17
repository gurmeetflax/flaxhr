-- Admin leaderboard: everyone with training, ranked by points, with their
-- level, modules passed and badges. Admin logins usually have no employee
-- record, so they can't see the employee-side boards.

create or replace function public.training_admin_leaderboard()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
begin
  perform training.require_admin();
  return (select coalesce(jsonb_agg(x order by x.points desc, x.name), '[]'::jsonb) from (
    select e.id employee_id, e.full_name name, e.employee_code, e.outlet_id,
           coalesce(o.display_name, o.name) outlet, d.name designation,
           t.points, t.passed, t.assigned,
           rank() over (order by t.points desc) rk,
           case when t.points >= 1000 then 'Champion' when t.points >= 500 then 'Pro'
                when t.points >= 200 then 'Learner' else 'Starter' end level,
           (t.passed >= 1)::int + (t.first_try >= 1)::int + (t.perfect >= 1)::int + (t.on_time >= 3)::int
             + (t.safety_total > 0 and t.safety_passed = t.safety_total)::int
             + (t.assigned > 0 and t.passed = t.assigned)::int badges
    from training.points_table() t
    join core.employees e on e.id = t.employee_id
    left join public.flax_outlets o on o.id = e.outlet_id
    left join core.designations d on d.code = e.designation_code) x);
end $$;

revoke all on function public.training_admin_leaderboard() from public, anon;
grant execute on function public.training_admin_leaderboard() to authenticated;

notify pgrst, 'reload schema';
