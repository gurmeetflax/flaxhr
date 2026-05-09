-- Flax HR — Migration 029: Phase 9 — Employee profile fields + Birthday voucher
--
-- Adds optional profile fields (DOB, address, emergency contact) and a
-- gift-code pool with a daily birthday assignment runner.
--
-- The runner (`supabase/functions/birthday-runner`) is idempotent via
-- core.birthday_log's PK on (employee_id, wished_on).

-- ==========================================================================
-- 1. Profile fields on core.employees
-- ==========================================================================
alter table core.employees
  add column if not exists date_of_birth         date,
  add column if not exists address               text,
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text;

create index if not exists employees_dob_idx
  on core.employees (date_of_birth)
  where deleted_at is null and date_of_birth is not null;

-- Refresh public view to expose new columns.
drop view if exists public.v_employees;
create view public.v_employees
with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id, e.full_name,
         e.work_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         e.monthly_salary, e.exit_date, e.exit_reason,
         e.date_of_birth, e.address,
         e.emergency_contact_name, e.emergency_contact_phone,
         o.display_name as outlet_name,
         o.city as outlet_city
  from core.employees e
  left join public.flax_outlets o on o.id = e.outlet_id
  where e.deleted_at is null;

grant select on public.v_employees to authenticated;

-- ==========================================================================
-- 2. core.gift_codes — manual code pool (HR uploads pre-bought vouchers)
-- ==========================================================================
create table if not exists core.gift_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  provider      text not null default 'amazon',
  face_value    numeric(12,2) not null default 0,
  currency      text not null default 'INR',
  expires_on    date,
  assigned_to   uuid references core.employees(id) on delete set null,
  assigned_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid
);

create index if not exists gift_codes_unassigned_idx
  on core.gift_codes (provider, expires_on)
  where assigned_to is null;
create index if not exists gift_codes_assigned_emp_idx
  on core.gift_codes (assigned_to)
  where assigned_to is not null;

drop trigger if exists trg_gift_codes_audit on core.gift_codes;
create trigger trg_gift_codes_audit
  after insert or update or delete on core.gift_codes
  for each row execute function core.log_audit();

alter table core.gift_codes enable row level security;

drop policy if exists gift_codes_admin_hr_all on core.gift_codes;
create policy gift_codes_admin_hr_all on core.gift_codes
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- Recipient sees only their assigned code.
drop policy if exists gift_codes_self_select on core.gift_codes;
create policy gift_codes_self_select on core.gift_codes
  for select
  using (assigned_to in (select id from core.employees where user_id = auth.uid()));

drop policy if exists gift_codes_auditor_select on core.gift_codes;
create policy gift_codes_auditor_select on core.gift_codes
  for select
  using (core.has_role('auditor'));

-- ==========================================================================
-- 3. core.birthday_log — idempotency for the daily runner
-- ==========================================================================
create table if not exists core.birthday_log (
  employee_id   uuid not null references core.employees(id) on delete cascade,
  wished_on     date not null,
  gift_code_id  uuid references core.gift_codes(id) on delete set null,
  notification_id uuid references core.notifications(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (employee_id, wished_on)
);

alter table core.birthday_log enable row level security;

drop policy if exists birthday_log_admin_hr_all on core.birthday_log;
create policy birthday_log_admin_hr_all on core.birthday_log
  for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists birthday_log_self_select on core.birthday_log;
create policy birthday_log_self_select on core.birthday_log
  for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

-- ==========================================================================
-- 4. View: who has a birthday today (IST)?
-- ==========================================================================
create or replace view public.v_birthday_today
with (security_invoker = true) as
  select e.id as employee_id,
         e.employee_code,
         e.full_name,
         e.work_email,
         e.outlet_id,
         e.date_of_birth
  from core.employees e
  where e.deleted_at is null
    and e.is_active = true
    and e.date_of_birth is not null
    and to_char(
      (now() at time zone 'Asia/Kolkata')::date,
      'MM-DD'
    ) = to_char(e.date_of_birth, 'MM-DD');

grant select on public.v_birthday_today to authenticated;

-- ==========================================================================
-- 5. Admin pool stats view + assign RPC for the runner
-- ==========================================================================
create or replace view public.v_gift_codes_stats
with (security_invoker = true) as
  select provider,
         count(*) filter (where assigned_to is null and (expires_on is null or expires_on >= current_date)) as available,
         count(*) filter (where assigned_to is not null) as assigned,
         count(*) filter (where assigned_to is null and expires_on < current_date) as expired
  from core.gift_codes
  group by provider;

grant select on public.v_gift_codes_stats to authenticated;

-- Assigns the next available gift code to an employee, writes birthday_log,
-- and emits a notification. Idempotent: a same-day repeat call no-ops.
create or replace function core.run_birthday_for_employee(
  p_employee uuid,
  p_today    date default null
) returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Kolkata')::date);
  v_emp   record;
  v_code  record;
  v_voucher_enabled boolean;
  v_subject text;
  v_body    text;
  v_notif_id uuid;
  v_existing record;
begin
  select * into v_existing from core.birthday_log
   where employee_id = p_employee and wished_on = v_today;
  if found then
    return v_existing.notification_id;
  end if;

  select id, full_name, work_email into v_emp
    from core.employees where id = p_employee and deleted_at is null and is_active = true;
  if not found then
    return null;
  end if;

  v_voucher_enabled := coalesce(
    (core.get_app_setting('birthday_voucher_enabled'))::boolean, false
  );

  if v_voucher_enabled then
    select * into v_code
      from core.gift_codes
     where assigned_to is null
       and (expires_on is null or expires_on >= v_today)
     order by expires_on nulls last, created_at
     limit 1
     for update skip locked;

    if found then
      update core.gift_codes
         set assigned_to = p_employee, assigned_at = now()
       where id = v_code.id;
    end if;
  end if;

  v_subject := coalesce(
    nullif((core.get_app_setting('birthday_email_subject'))::text, ''),
    'Happy birthday from Flax!'
  );
  -- Strip the JSON quotes if the setting is a json string.
  v_subject := trim(both '"' from v_subject);

  v_body := coalesce(
    nullif((core.get_app_setting('birthday_email_body'))::text, ''),
    '"Wishing you a wonderful day, {name}! Thanks for being part of Flax.{voucher}"'
  );
  v_body := trim(both '"' from v_body);
  v_body := replace(v_body, '{name}', coalesce(v_emp.full_name, ''));
  if v_code.code is not null then
    v_body := replace(v_body, '{voucher}',
      E'\n\nHere''s a small gift voucher (' || v_code.provider || '): ' || v_code.code);
  else
    v_body := replace(v_body, '{voucher}', '');
  end if;

  v_notif_id := core.notify(
    p_employee,
    'birthday',
    v_subject,
    v_body,
    jsonb_build_object('gift_code_id', v_code.id, 'wished_on', v_today)
  );

  insert into core.birthday_log (employee_id, wished_on, gift_code_id, notification_id)
  values (p_employee, v_today, v_code.id, v_notif_id);

  return v_notif_id;
end;
$$;

grant execute on function core.run_birthday_for_employee(uuid, date) to authenticated;

-- One-shot driver used by the edge function & manual re-runs.
create or replace function public.run_birthdays_today()
returns table (employee_id uuid, full_name text, notification_id uuid)
language plpgsql
security definer
set search_path = core, public
as $$
declare
  r record;
  v_id uuid;
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('service')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  for r in
    select b.employee_id, b.full_name from public.v_birthday_today b
  loop
    v_id := core.run_birthday_for_employee(r.employee_id);
    employee_id := r.employee_id;
    full_name   := r.full_name;
    notification_id := v_id;
    return next;
  end loop;
  return;
end;
$$;

grant execute on function public.run_birthdays_today() to authenticated;

-- ==========================================================================
-- 6. Seed templated email subject/body so HR can edit in Settings later.
-- ==========================================================================
insert into core.app_settings (key, value)
  values
    ('birthday_email_subject', '"Happy birthday from Flax!"'::jsonb),
    ('birthday_email_body',    '"Wishing you a wonderful day, {name}! Thanks for being part of Flax.{voucher}"'::jsonb)
  on conflict (key) do nothing;

notify pgrst, 'reload schema';
