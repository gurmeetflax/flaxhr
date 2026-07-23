-- Flax HR — Employee snapshot: uniforms, warnings, documents, aggregate view
--
-- Adds three master tables that were missing from the model, plus
-- v_employee_snapshot — a single row per employee with every count the
-- Snapshot page needs. Rendering the page shouldn't require multiple
-- round-trips per panel.
--
-- New tables:
--   core.uniforms            — items allocated per employee
--   core.warnings            — HR-issued warnings (verbal / written / final)
--   core.employee_documents  — offer letters, contracts, etc.
-- New view:
--   public.v_employee_snapshot

----------------------------------------------------------------------------
-- 1) core.uniforms
----------------------------------------------------------------------------
create table if not exists core.uniforms (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references core.employees(id) on delete cascade,
  item           text not null,          -- e.g. "T-shirt", "Cap", "Apron"
  size           text,                   -- e.g. "M", "42"
  quantity       int not null default 1 check (quantity > 0),
  allocated_on   date not null default current_date,
  returned_on    date,
  notes          text,
  allocated_by   uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists uniforms_emp_idx on core.uniforms (employee_id, allocated_on desc);

drop trigger if exists trg_uniforms_touch on core.uniforms;
create or replace function core.touch_uniform()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger trg_uniforms_touch before update on core.uniforms
  for each row execute function core.touch_uniform();

drop trigger if exists trg_uniforms_audit on core.uniforms;
create trigger trg_uniforms_audit after insert or update or delete on core.uniforms
  for each row execute function core.log_audit();

alter table core.uniforms enable row level security;

drop policy if exists uniforms_admin_hr on core.uniforms;
create policy uniforms_admin_hr on core.uniforms for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists uniforms_self on core.uniforms;
create policy uniforms_self on core.uniforms for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

----------------------------------------------------------------------------
-- 2) core.warnings
----------------------------------------------------------------------------
create table if not exists core.warnings (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references core.employees(id) on delete cascade,
  severity      text not null check (severity in ('verbal','written','final')),
  reason        text not null,
  note          text,
  document_path text,                    -- optional signed warning letter
  issued_by     uuid references auth.users(id),
  issued_at     timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists warnings_emp_idx on core.warnings (employee_id, issued_at desc);

drop trigger if exists trg_warnings_touch on core.warnings;
create or replace function core.touch_warning()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger trg_warnings_touch before update on core.warnings
  for each row execute function core.touch_warning();

drop trigger if exists trg_warnings_audit on core.warnings;
create trigger trg_warnings_audit after insert or update or delete on core.warnings
  for each row execute function core.log_audit();

alter table core.warnings enable row level security;

drop policy if exists warnings_admin_hr on core.warnings;
create policy warnings_admin_hr on core.warnings for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists warnings_self on core.warnings;
create policy warnings_self on core.warnings for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

----------------------------------------------------------------------------
-- 3) core.employee_documents
----------------------------------------------------------------------------
create table if not exists core.employee_documents (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references core.employees(id) on delete cascade,
  kind          text not null check (kind in (
                  'offer_letter','appointment_letter','contract','id_proof',
                  'address_proof','education','experience','resignation','other')),
  title         text,
  path          text not null,           -- storage bucket path
  issued_on     date,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz not null default now(),
  notes         text
);

create index if not exists emp_docs_emp_idx on core.employee_documents (employee_id, kind, uploaded_at desc);

drop trigger if exists trg_emp_docs_audit on core.employee_documents;
create trigger trg_emp_docs_audit after insert or update or delete on core.employee_documents
  for each row execute function core.log_audit();

alter table core.employee_documents enable row level security;

drop policy if exists emp_docs_admin_hr on core.employee_documents;
create policy emp_docs_admin_hr on core.employee_documents for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists emp_docs_self on core.employee_documents;
create policy emp_docs_self on core.employee_documents for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

----------------------------------------------------------------------------
-- 4) v_employee_snapshot — one row per employee with rollup counts
----------------------------------------------------------------------------
drop view if exists public.v_employee_snapshot;
create view public.v_employee_snapshot
with (security_invoker = true) as
with
  attn_30d as (
    select
      employee_id,
      count(*) filter (where status = 'late')    as late_count_30d,
      count(*) filter (where status = 'absent')  as absent_count_30d,
      count(*) filter (where status = 'present') as present_count_30d,
      count(*) filter (where status = 'on_leave') as on_leave_count_30d,
      round(avg(late_minutes) filter (where late_minutes is not null))::int as avg_late_minutes_30d
    from public.v_attendance_report
    where work_date >= current_date - 30
    group by employee_id
  ),
  leaves as (
    select employee_id, leaves_pending, leaves_used
    from public.v_employee_leave_summary
  ),
  pip as (
    select
      employee_id,
      count(*) filter (where status in ('open','review')) as pip_open_count,
      max(target_date) filter (where status in ('open','review')) as pip_target_date
    from core.pips group by employee_id
  ),
  warns as (
    select employee_id, count(*) as warning_count,
           max(issued_at) as last_warning_at
    from core.warnings group by employee_id
  ),
  uni as (
    select employee_id,
           count(*) filter (where returned_on is null) as uniform_active_count,
           sum(quantity) filter (where returned_on is null) as uniform_active_qty
    from core.uniforms group by employee_id
  ),
  docs as (
    select employee_id,
           bool_or(kind = 'offer_letter')       as has_offer_letter,
           bool_or(kind = 'appointment_letter') as has_appointment_letter,
           bool_or(kind = 'contract')           as has_contract,
           count(*)                             as document_count
    from core.employee_documents group by employee_id
  ),
  last_selfie as (
    select distinct on (l.employee_id)
      l.employee_id, l.selfie_path, l.punched_at
    from attendance.logs l
    where l.selfie_path is not null
    order by l.employee_id, l.punched_at desc
  )
select
  e.id                    as employee_id,
  e.employee_code,
  e.full_name             as employee_name,
  e.first_name,
  e.last_name,
  e.personal_email,
  e.phone,
  e.date_of_birth,
  e.hired_on,
  (current_date - e.hired_on) as tenure_days,
  e.designation_code,
  d.name                  as designation_name,
  e.outlet_id,
  o.display_name          as outlet_name,
  e.monthly_salary,
  e.kyc_status,
  e.emergency_contact_name,
  e.emergency_contact_phone,
  e.address,
  ls.selfie_path          as latest_selfie_path,
  ls.punched_at           as latest_selfie_at,
  coalesce(a.late_count_30d, 0)     as late_count_30d,
  coalesce(a.absent_count_30d, 0)   as absent_count_30d,
  coalesce(a.present_count_30d, 0)  as present_count_30d,
  coalesce(a.on_leave_count_30d, 0) as on_leave_count_30d,
  a.avg_late_minutes_30d,
  coalesce(l.leaves_pending, 0)     as leaves_pending,
  coalesce(l.leaves_used, 0)        as leaves_used,
  coalesce(p.pip_open_count, 0)     as pip_open_count,
  p.pip_target_date,
  coalesce(w.warning_count, 0)      as warning_count,
  w.last_warning_at,
  coalesce(u.uniform_active_count, 0) as uniform_active_count,
  coalesce(u.uniform_active_qty, 0)   as uniform_active_qty,
  coalesce(doc.has_offer_letter, false)       as has_offer_letter,
  coalesce(doc.has_appointment_letter, false) as has_appointment_letter,
  coalesce(doc.has_contract, false)           as has_contract,
  coalesce(doc.document_count, 0)             as document_count
from core.employees e
left join core.designations d on d.code = e.designation_code
left join public.flax_outlets o on o.id = e.outlet_id
left join attn_30d   a on a.employee_id = e.id
left join leaves     l on l.employee_id = e.id
left join pip        p on p.employee_id = e.id
left join warns      w on w.employee_id = e.id
left join uni        u on u.employee_id = e.id
left join docs       doc on doc.employee_id = e.id
left join last_selfie ls on ls.employee_id = e.id
where e.deleted_at is null;

grant select on public.v_employee_snapshot to authenticated;

notify pgrst, 'reload schema';
