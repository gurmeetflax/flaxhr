-- Flax HR — Migration 041: deleted-employees archive + restore RPC
create or replace view public.v_deleted_employees with (security_invoker = true) as
  select e.id, e.employee_code, e.first_name, e.last_name, e.full_name,
         e.personal_email, e.phone, e.outlet_id,
         e.deleted_at, e.exit_date, e.exit_reason,
         o.display_name as outlet_name,
         (select max(updated_at) from core.user_roles ur where ur.user_id = e.user_id) as roles_deleted_hint
    from core.employees e
    left join public.flax_outlets o on o.id = e.outlet_id
   where e.deleted_at is not null
   order by e.deleted_at desc;
grant select on public.v_deleted_employees to authenticated;

create or replace function public.restore_employee(p_id uuid)
returns void language plpgsql security definer set search_path = core, public as $$
declare v_user uuid;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode='P0001';
  end if;
  update core.employees set deleted_at = null, is_active = true where id = p_id
    returning user_id into v_user;
  if v_user is not null then
    update core.user_roles set deleted_at = null where user_id = v_user;
  end if;
end; $$;
grant execute on function public.restore_employee(uuid) to authenticated;
notify pgrst, 'reload schema';
