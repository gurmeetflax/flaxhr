-- Flax HR — Fix regularisation visibility + previous-month self view
--
-- 1. v_regularisations was created WITHOUT security_invoker, so it ran
--    with the view owner's rights and bypassed RLS — every authenticated
--    user could read every regularisation. Recreate with
--    security_invoker = true so the RLS policies on
--    attendance.regularisations apply (self / manager / admin / hr).

drop view if exists public.v_regularisations;

create view public.v_regularisations
with (security_invoker = true) as
  select r.id, r.employee_id, r.outlet_id, r.requested_for, r.type, r.reason,
         r.evidence_path, r.status, r.decided_by, r.decided_at, r.decision_note,
         r.created_at, r.updated_at,
         e.employee_code, e.full_name as employee_name,
         o.display_name as outlet_name, o.timezone as outlet_timezone
  from attendance.regularisations r
  join core.employees e on e.id = r.employee_id
  left join public.flax_outlets o on o.id = r.outlet_id
  order by r.created_at desc;

grant select on public.v_regularisations to authenticated;

notify pgrst, 'reload schema';
