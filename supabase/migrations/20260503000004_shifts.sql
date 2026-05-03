-- Flax HR — Migration 013: Shift schedules
--
-- core.shifts            named shift templates per outlet (with grace + days)
-- core.employee_shifts   employee → shift assignment with effective_from/to

create table if not exists core.shifts (
  id                  uuid primary key default gen_random_uuid(),
  outlet_id           text not null references public.flax_outlets(id) on delete cascade,
  name                text not null,
  start_time          time not null,
  end_time            time not null,
  grace_in_minutes    int  not null default 10 check (grace_in_minutes between 0 and 240),
  grace_out_minutes   int  not null default 10 check (grace_out_minutes between 0 and 240),
  days_of_week        int[] not null default '{0,1,2,3,4,5,6}',
  is_active           bool not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (outlet_id, name)
);

create index if not exists shifts_outlet_idx on core.shifts (outlet_id, is_active);

create table if not exists core.employee_shifts (
  employee_id     uuid not null references core.employees(id) on delete cascade,
  shift_id        uuid not null references core.shifts(id) on delete cascade,
  effective_from  date not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  primary key (employee_id, effective_from)
);

create index if not exists employee_shifts_active_idx
  on core.employee_shifts (employee_id, effective_to);

drop trigger if exists trg_shifts_audit on core.shifts;
create trigger trg_shifts_audit after insert or update or delete on core.shifts
  for each row execute function core.log_audit();

drop trigger if exists trg_emp_shifts_audit on core.employee_shifts;
create trigger trg_emp_shifts_audit after insert or update or delete on core.employee_shifts
  for each row execute function core.log_audit();

create or replace function core.touch_shift()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_shifts_touch on core.shifts;
create trigger trg_shifts_touch before update on core.shifts
  for each row execute function core.touch_shift();

alter table core.shifts enable row level security;
alter table core.employee_shifts enable row level security;

drop policy if exists shifts_admin_hr on core.shifts;
create policy shifts_admin_hr on core.shifts for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists shifts_manager on core.shifts;
create policy shifts_manager on core.shifts for select
  using (core.has_role('manager') and core.has_outlet_access(outlet_id));

drop policy if exists shifts_select_emp on core.shifts;
create policy shifts_select_emp on core.shifts for select
  using (
    is_active and exists (
      select 1 from core.employee_shifts es
      join core.employees e on e.id = es.employee_id
      where es.shift_id = core.shifts.id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists emp_shifts_admin_hr on core.employee_shifts;
create policy emp_shifts_admin_hr on core.employee_shifts for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists emp_shifts_self on core.employee_shifts;
create policy emp_shifts_self on core.employee_shifts for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

-- Today's effective shift per employee (using employee's outlet timezone fallback Asia/Kolkata).
create or replace view public.v_today_shift as
  select e.id as employee_id,
         s.id as shift_id, s.outlet_id, s.name, s.start_time, s.end_time,
         s.grace_in_minutes, s.grace_out_minutes
  from core.employees e
  join core.employee_shifts es on es.employee_id = e.id
  join core.shifts s on s.id = es.shift_id
  where (es.effective_from <= current_date)
    and (es.effective_to is null or es.effective_to >= current_date)
    and s.is_active = true
    and extract(dow from current_date)::int = any(s.days_of_week);

grant select on public.v_today_shift to authenticated;

-- Self-service: my today shift
create or replace view public.v_my_today_shift as
  select * from public.v_today_shift
  where employee_id in (select id from core.employees where user_id = auth.uid());

grant select on public.v_my_today_shift to authenticated;

-- Admin/HR-friendly view of all employee→shift assignments.
create or replace view public.v_employee_shifts as
  select es.employee_id, es.shift_id, es.effective_from, es.effective_to,
         e.employee_code, e.full_name as employee_name,
         s.name as shift_name, s.start_time, s.end_time, s.outlet_id,
         o.display_name as outlet_name
  from core.employee_shifts es
  join core.employees e on e.id = es.employee_id
  join core.shifts s on s.id = es.shift_id
  left join public.flax_outlets o on o.id = s.outlet_id
  order by es.effective_from desc;

grant select on public.v_employee_shifts to authenticated;
