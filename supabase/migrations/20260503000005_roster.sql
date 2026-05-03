-- Flax HR — Migration 014: Roster planning

create table if not exists core.roster_entries (
  id            uuid primary key default gen_random_uuid(),
  outlet_id     text not null references public.flax_outlets(id) on delete cascade,
  employee_id   uuid not null references core.employees(id) on delete cascade,
  shift_id      uuid references core.shifts(id),
  work_date     date not null,
  starts_at     timestamptz,
  ends_at       timestamptz,
  status        text not null default 'planned'
                  check (status in ('planned','published','swapped','off')),
  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists roster_outlet_date_idx on core.roster_entries (outlet_id, work_date);
create index if not exists roster_emp_date_idx    on core.roster_entries (employee_id, work_date);

create or replace function core.touch_roster()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_roster_touch on core.roster_entries;
create trigger trg_roster_touch before update on core.roster_entries
  for each row execute function core.touch_roster();

drop trigger if exists trg_roster_audit on core.roster_entries;
create trigger trg_roster_audit after insert or update or delete on core.roster_entries
  for each row execute function core.log_audit();

alter table core.roster_entries enable row level security;

drop policy if exists roster_admin_hr on core.roster_entries;
create policy roster_admin_hr on core.roster_entries for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists roster_manager on core.roster_entries;
create policy roster_manager on core.roster_entries for all
  using (core.has_role('manager') and core.has_outlet_access(outlet_id))
  with check (core.has_role('manager') and core.has_outlet_access(outlet_id));

drop policy if exists roster_self on core.roster_entries;
create policy roster_self on core.roster_entries for select
  using (
    status = 'published'
    and employee_id in (select id from core.employees where user_id = auth.uid())
  );

create or replace view public.v_roster as
  select r.*, e.employee_code, e.full_name as employee_name,
         s.name as shift_name, s.start_time, s.end_time,
         o.display_name as outlet_name, o.timezone as outlet_timezone
  from core.roster_entries r
  join core.employees e on e.id = r.employee_id
  left join core.shifts s on s.id = r.shift_id
  left join public.flax_outlets o on o.id = r.outlet_id
  order by r.work_date desc, r.starts_at;

grant select on public.v_roster to authenticated;

create or replace view public.v_my_roster as
  select * from public.v_roster
  where status = 'published'
    and employee_id in (select id from core.employees where user_id = auth.uid())
    and work_date >= current_date
  order by work_date asc, starts_at asc;

grant select on public.v_my_roster to authenticated;
