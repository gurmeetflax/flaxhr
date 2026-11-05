-- No future punches.
--
-- An approved regularisation with a wrong date (29 Nov instead of 29 Oct)
-- became a punch in the future. The punch button and the punch function
-- take the latest punch of the day as the person's state, so a future
-- "out" made the app think they had already punched out: Pari Jaiswal
-- could only "Punch in" all day on 5 Nov. Eleven such punches existed.
--
--  * submit_regularisation refuses a time more than 5 minutes ahead.
--  * decide_regularisation refuses to approve one (reject it instead and
--    have the employee resubmit with the right date).
--  * The punch state (public.punch and v_my_today_punches) ignores any
--    punch after now(), so a stray future punch can't lock anyone out.

create or replace function public.submit_regularisation(p_requested_for timestamp with time zone, p_type text,
  p_reason text, p_outlet_id text default null::text, p_evidence_path text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'attendance', 'core', 'public'
as $function$
declare
  my_emp core.employees%rowtype;
  new_id uuid;
begin
  if p_type not in ('in','out') then
    raise exception 'INVALID_TYPE' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if p_requested_for > now() + interval '5 minutes' then
    raise exception 'FUTURE_TIME' using errcode = 'P0001';
  end if;
  select * into my_emp from core.employees
    where user_id = auth.uid() and is_active = true and deleted_at is null limit 1;
  if my_emp.id is null then
    raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001';
  end if;
  insert into attendance.regularisations
    (employee_id, outlet_id, requested_for, type, reason, evidence_path)
    values (my_emp.id, coalesce(p_outlet_id, my_emp.outlet_id), p_requested_for,
            p_type, p_reason, p_evidence_path)
    returning id into new_id;
  return new_id;
end $function$;

create or replace function public.decide_regularisation(p_id uuid, p_status text, p_note text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'attendance', 'core', 'public'
as $function$
declare
  reg attendance.regularisations%rowtype;
  is_authorised boolean;
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

  is_authorised := core.is_admin() or core.has_role('hr')
    or (core.has_role('manager') and (reg.outlet_id is null or core.has_outlet_access(reg.outlet_id)));
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

  if p_status = 'approved' then
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

-- public.punch has two overloads that both pick "last punch of the work
-- day"; make each ignore punches after now(). Rewritten in place so the
-- rest of each body stays exactly as deployed.
do $$
declare d text;
begin
  for d in
    select pg_get_functiondef(p.oid) from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = 'punch'
  loop
    if position('punched_at <= now()' in d) = 0 and position('and punched_at >= work_start' in d) > 0 then
      execute replace(d, 'and punched_at >= work_start', 'and punched_at >= work_start and punched_at <= now()');
    end if;
  end loop;
end $$;

create or replace view public.v_my_today_punches with (security_invoker = true) as
select l.id, l.type, l.punched_at, l.selfie_path, l.is_within_geofence, l.distance_m, l.lat, l.lng, l.outlet_id
from attendance.logs l
join core.employees e on e.id = l.employee_id
where e.user_id = auth.uid()
  and l.punched_at >= core.work_day_start_at(now(), 'Asia/Kolkata'::text)
  and l.punched_at <= now()
order by l.punched_at desc;

notify pgrst, 'reload schema';
