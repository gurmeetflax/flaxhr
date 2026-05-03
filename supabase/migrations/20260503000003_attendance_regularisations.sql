-- Flax HR — Migration 012: Attendance regularisation requests
--
-- Employees can request a missed-punch correction (e.g. forgot to punch out).
-- HR/admin/managers approve. Approval inserts a row into attendance.logs with
-- source = 'regularised' and is_within_geofence = null.

create table if not exists attendance.regularisations (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references core.employees(id) on delete cascade,
  outlet_id       text references public.flax_outlets(id),
  requested_for   timestamptz not null,
  type            text not null check (type in ('in', 'out')),
  reason          text not null check (length(btrim(reason)) > 0),
  evidence_path   text,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by      uuid references auth.users(id),
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists regularisations_emp_idx
  on attendance.regularisations (employee_id, created_at desc);
create index if not exists regularisations_status_idx
  on attendance.regularisations (status, created_at desc);

drop trigger if exists trg_regs_audit on attendance.regularisations;
create trigger trg_regs_audit after insert or update or delete on attendance.regularisations
  for each row execute function core.log_audit();

-- Auto-bump updated_at
create or replace function attendance.touch_regularisation()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_regs_touch on attendance.regularisations;
create trigger trg_regs_touch before update on attendance.regularisations
  for each row execute function attendance.touch_regularisation();

alter table attendance.regularisations enable row level security;

drop policy if exists regs_self_insert on attendance.regularisations;
create policy regs_self_insert on attendance.regularisations
  for insert
  with check (
    employee_id in (select id from core.employees where user_id = auth.uid())
    and status = 'pending'
  );

drop policy if exists regs_self_select on attendance.regularisations;
create policy regs_self_select on attendance.regularisations
  for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

drop policy if exists regs_self_cancel on attendance.regularisations;
create policy regs_self_cancel on attendance.regularisations
  for update
  using (
    employee_id in (select id from core.employees where user_id = auth.uid())
    and status = 'pending'
  )
  with check (status in ('pending', 'cancelled'));

drop policy if exists regs_admin_hr on attendance.regularisations;
create policy regs_admin_hr on attendance.regularisations
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists regs_manager on attendance.regularisations;
create policy regs_manager on attendance.regularisations
  for select
  using (core.has_role('manager') and (outlet_id is null or core.has_outlet_access(outlet_id)));

-- RPC: decide a regularisation. Approving inserts a row into attendance.logs.
create or replace function public.decide_regularisation(
  p_id     uuid,
  p_status text,                -- 'approved' or 'rejected'
  p_note   text default null
) returns jsonb
language plpgsql
security definer
set search_path = attendance, core, public
as $$
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
$$;

grant execute on function public.decide_regularisation(uuid, text, text) to authenticated;

-- RPC: employee submits a new regularisation request.
create or replace function public.submit_regularisation(
  p_requested_for timestamptz,
  p_type          text,
  p_reason        text,
  p_outlet_id     text default null,
  p_evidence_path text default null
) returns uuid
language plpgsql
security definer
set search_path = attendance, core, public
as $$
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
end $$;

grant execute on function public.submit_regularisation(timestamptz, text, text, text, text) to authenticated;

-- View for admin/manager queues + employee's own
create or replace view public.v_regularisations as
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
