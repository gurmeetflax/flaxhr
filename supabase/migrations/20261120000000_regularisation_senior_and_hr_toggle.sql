-- Regularisation approval rights: senior employees go to the founder, and
-- HR's approval right becomes a toggle.
--
-- 1. A senior-level employee's regularisation can only be approved by an
--    Admin (the founder). HR and managers can no longer approve them.
--    "Senior" = a lead designation (is_lead) or a head-office leadership role
--    (roster_group is null: Area Manager, Operation Head, Operations Manager,
--    HR Manager). The set follows core.designations, so it tracks promotions.
-- 2. HR's right to approve everyone else's regularisations is now an
--    app setting, "hr_can_approve_regularisations" (default on), that only an
--    Admin can change (Settings → Admin). Managers keep approving their own
--    outlet's non-senior staff.

-- Who counts as senior.
create or replace function core.is_senior_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1
    from core.employees e
    join core.designations d on d.code = e.designation_code
    where e.id = p_employee_id
      and (d.is_lead or d.roster_group is null)
  );
$$;
grant execute on function core.is_senior_employee(uuid) to authenticated;

-- The HR toggle. Default on, so HR keeps approving regular staff until the
-- founder turns it off.
insert into core.app_settings (key, value)
  values ('hr_can_approve_regularisations', 'true'::jsonb)
  on conflict (key) do nothing;

-- Only an Admin may change this one key (it governs HR's own power, so HR
-- must not be able to switch it back on). Everything else is unchanged:
-- Admin or HR, as before.
create or replace function public.set_app_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if p_key = 'hr_can_approve_regularisations' then
    if not core.is_admin() then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  elsif not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  insert into core.app_settings (key, value, updated_by)
    values (p_key, p_value, auth.uid())
    on conflict (key) do update
      set value = excluded.value,
          updated_by = auth.uid(),
          updated_at = now();
end;
$$;
grant execute on function public.set_app_setting(text, jsonb) to authenticated;

-- Approval rule. Senior employees' regularisations: Admin only. Everyone
-- else: Admin, HR (while the toggle is on), or a manager with access to the
-- outlet. The rest of the function (the FUTURE_TIME guard and the missed
-- punch insert) is unchanged.
create or replace function public.decide_regularisation(p_id uuid, p_status text, p_note text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'attendance', 'core', 'public'
as $function$
declare
  reg attendance.regularisations%rowtype;
  is_authorised boolean;
  v_senior boolean;
  v_hr_ok boolean;
begin
  if p_status not in ('approved','rejected') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  select * into reg from attendance.regularisations where id = p_id for update;
  if reg.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if reg.status <> 'pending' then
    raise exception 'ALREADY_DECIDED' using errcode = 'P0001';
  end if;

  v_senior := core.is_senior_employee(reg.employee_id);
  v_hr_ok := coalesce((core.get_app_setting('hr_can_approve_regularisations'))::boolean, true);

  if v_senior then
    -- Senior employees: the founder decides, nobody else.
    is_authorised := core.is_admin();
  else
    is_authorised := core.is_admin()
      or (v_hr_ok and core.has_role('hr'))
      or (core.has_role('manager') and (reg.outlet_id is null or core.has_outlet_access(reg.outlet_id)));
  end if;
  if not is_authorised then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_status = 'approved' and reg.requested_for > now() + interval '5 minutes' then
    raise exception 'FUTURE_TIME' using errcode = 'P0001';
  end if;

  update attendance.regularisations
    set status = p_status,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_note = p_note
    where id = p_id;

  -- Only a missed punch adds a punch; a week off or leave day is read from
  -- the regularisation itself by core.attendance_days.
  if p_status = 'approved' and reg.category = 'missed_punch' then
    insert into attendance.logs (
      employee_id, outlet_id, type, punched_at, selfie_path, lat, lng,
      is_within_geofence, distance_m, source, device_info
    ) values (
      reg.employee_id, reg.outlet_id, reg.type, reg.requested_for,
      reg.evidence_path, null, null, null, null, 'regularised',
      jsonb_build_object('regularisation_id', reg.id, 'reason', reg.reason)
    );
  end if;

  return jsonb_build_object('id', reg.id, 'status', p_status);
end;
$function$;
