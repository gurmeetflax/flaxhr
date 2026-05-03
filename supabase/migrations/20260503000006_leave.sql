-- Flax HR — Migration 015: Leave types, balances, requests
--
-- Policy: paid leave types decrement balance on approval; min_notice_days
-- enforced at submit time; half-day support.

create table if not exists core.leave_types (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null,
  name               text not null,
  is_paid            bool not null default true,
  accrual_per_month  numeric(5,2) not null default 0,
  max_balance        numeric(6,2),
  requires_approval  bool not null default true,
  min_notice_days    int  not null default 0 check (min_notice_days >= 0),
  allow_half_day     bool not null default true,
  is_active          bool not null default true,
  created_at         timestamptz not null default now()
);

create table if not exists core.leave_balances (
  employee_id    uuid not null references core.employees(id) on delete cascade,
  leave_type_id  uuid not null references core.leave_types(id) on delete cascade,
  balance        numeric(6,2) not null default 0,
  as_of          date not null default current_date,
  primary key (employee_id, leave_type_id)
);

create table if not exists core.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references core.employees(id) on delete cascade,
  leave_type_id   uuid not null references core.leave_types(id),
  start_date      date not null,
  end_date        date not null,
  half_day        text not null default 'none' check (half_day in ('none','first','second')),
  days            numeric(5,2) not null,
  reason          text,
  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected','cancelled')),
  decided_by      uuid references auth.users(id),
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists leave_req_emp_idx     on core.leave_requests (employee_id, created_at desc);
create index if not exists leave_req_status_idx  on core.leave_requests (status, created_at desc);

create or replace function core.touch_leave_request()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_lr_touch on core.leave_requests;
create trigger trg_lr_touch before update on core.leave_requests
  for each row execute function core.touch_leave_request();

drop trigger if exists trg_lr_audit on core.leave_requests;
create trigger trg_lr_audit after insert or update or delete on core.leave_requests
  for each row execute function core.log_audit();

alter table core.leave_types     enable row level security;
alter table core.leave_balances  enable row level security;
alter table core.leave_requests  enable row level security;

drop policy if exists lt_select_all on core.leave_types;
create policy lt_select_all on core.leave_types for select using (true);

drop policy if exists lt_admin_hr on core.leave_types;
create policy lt_admin_hr on core.leave_types for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists lb_self on core.leave_balances;
create policy lb_self on core.leave_balances for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

drop policy if exists lb_admin_hr on core.leave_balances;
create policy lb_admin_hr on core.leave_balances for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists lr_self_select on core.leave_requests;
create policy lr_self_select on core.leave_requests for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

drop policy if exists lr_admin_hr on core.leave_requests;
create policy lr_admin_hr on core.leave_requests for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists lr_manager on core.leave_requests;
create policy lr_manager on core.leave_requests for select
  using (
    core.has_role('manager')
    and exists (
      select 1 from core.employees e
      where e.id = core.leave_requests.employee_id
        and (e.outlet_id is null or core.has_outlet_access(e.outlet_id))
    )
  );

-- RPC: submit a leave request (employee).
create or replace function public.submit_leave_request(
  p_leave_type_id uuid,
  p_start_date    date,
  p_end_date      date,
  p_half_day      text default 'none',
  p_reason        text default null
) returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  my_emp  core.employees%rowtype;
  lt      core.leave_types%rowtype;
  bal     numeric(6,2);
  total_days numeric(5,2);
  new_id  uuid;
begin
  select * into my_emp from core.employees
    where user_id = auth.uid() and is_active = true and deleted_at is null;
  if my_emp.id is null then
    raise exception 'NO_ACTIVE_EMPLOYEE' using errcode = 'P0001';
  end if;

  select * into lt from core.leave_types where id = p_leave_type_id and is_active;
  if lt.id is null then
    raise exception 'INVALID_LEAVE_TYPE' using errcode = 'P0001';
  end if;

  if p_start_date < current_date + (lt.min_notice_days || ' days')::interval then
    raise exception 'NOTICE_PERIOD_NOT_MET' using errcode = 'P0001';
  end if;

  total_days := (p_end_date - p_start_date) + 1;
  if p_half_day in ('first','second') and total_days = 1 then
    total_days := 0.5;
  end if;

  if lt.is_paid then
    select coalesce(balance, 0) into bal
      from core.leave_balances
      where employee_id = my_emp.id and leave_type_id = lt.id;
    if coalesce(bal, 0) < total_days then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;
  end if;

  insert into core.leave_requests
    (employee_id, leave_type_id, start_date, end_date, half_day, days, reason)
    values (my_emp.id, lt.id, p_start_date, p_end_date, p_half_day, total_days, p_reason)
    returning id into new_id;
  return new_id;
end $$;

grant execute on function public.submit_leave_request(uuid, date, date, text, text) to authenticated;

-- RPC: decide a leave request (admin/hr/manager).
create or replace function public.decide_leave_request(
  p_id     uuid,
  p_status text,
  p_note   text default null
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  lr core.leave_requests%rowtype;
  lt core.leave_types%rowtype;
  is_authorised boolean;
begin
  if p_status not in ('approved','rejected') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  select * into lr from core.leave_requests where id = p_id for update;
  if lr.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if lr.status <> 'pending' then
    raise exception 'ALREADY_DECIDED' using errcode = 'P0001';
  end if;
  is_authorised := core.is_admin() or core.has_role('hr')
    or (core.has_role('manager') and exists (
         select 1 from core.employees e
         where e.id = lr.employee_id
           and (e.outlet_id is null or core.has_outlet_access(e.outlet_id))
       ));
  if not is_authorised then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update core.leave_requests
    set status = p_status, decided_by = auth.uid(), decided_at = now(),
        decision_note = p_note
    where id = p_id;

  if p_status = 'approved' then
    select * into lt from core.leave_types where id = lr.leave_type_id;
    if lt.is_paid then
      insert into core.leave_balances (employee_id, leave_type_id, balance, as_of)
        values (lr.employee_id, lr.leave_type_id, -lr.days, current_date)
        on conflict (employee_id, leave_type_id)
        do update set balance = core.leave_balances.balance - lr.days, as_of = current_date;
    end if;
  end if;

  return jsonb_build_object('id', lr.id, 'status', p_status);
end $$;

grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;

create or replace view public.v_leave_requests as
  select lr.*, lt.code as leave_code, lt.name as leave_name, lt.is_paid,
         e.employee_code, e.full_name as employee_name, e.outlet_id,
         o.display_name as outlet_name
  from core.leave_requests lr
  join core.leave_types lt on lt.id = lr.leave_type_id
  join core.employees e on e.id = lr.employee_id
  left join public.flax_outlets o on o.id = e.outlet_id
  order by lr.created_at desc;

grant select on public.v_leave_requests to authenticated;

create or replace view public.v_my_leave_balances as
  select lt.id as leave_type_id, lt.code, lt.name, lt.is_paid,
         coalesce(lb.balance, 0) as balance
  from core.leave_types lt
  left join core.leave_balances lb on lb.leave_type_id = lt.id
       and lb.employee_id in (select id from core.employees where user_id = auth.uid())
  where lt.is_active;

grant select on public.v_my_leave_balances to authenticated;

-- Seed default leave types (idempotent).
insert into core.leave_types (code, name, is_paid, accrual_per_month, max_balance, min_notice_days)
values
  ('CL', 'Casual',  true,  1.00, 12, 1),
  ('SL', 'Sick',    true,  0.83, 10, 0),
  ('EL', 'Earned',  true,  1.25, 30, 7),
  ('UL', 'Unpaid',  false, 0,    null, 0),
  ('CO', 'Comp-off',true,  0,    10, 1)
on conflict (code) do nothing;
