-- Flax HR — documents employees sign (step 1: data model)
--
--   core.legal_entities  the employing company per state (letterhead,
--                        GSTIN, signatory). Picked from the outlet's city.
--   core.position_terms  probation / notice / hours / week offs per
--                        designation — terms vary by position.
--   core.doc_templates   the letter and policy texts with {{placeholders}}
--                        and how each is signed (Aadhaar eSign or in-app).
--   core.sign_requests   one document sent to one employee. The rendered
--                        HTML is frozen at send time, so what was signed
--                        never changes even if the template is edited.

create table if not exists core.legal_entities (
  id               uuid primary key default gen_random_uuid(),
  state            text not null,
  cities           text[] not null default '{}',
  legal_name       text not null,
  trade_name       text not null default 'Flax',
  address          text,
  gstin            text,
  signatory_name   text not null default 'Gurmeet Singh',
  signatory_title  text not null default 'Director',
  signature_path   text,            -- PNG in the 'signatures' bucket
  is_pending       boolean not null default false,
  updated_at       timestamptz not null default now()
);

create table if not exists core.position_terms (
  designation_code       text primary key references core.designations(code) on delete cascade,
  probation_months       integer not null default 3,
  notice_days_probation  integer not null default 7,
  notice_days_confirmed  integer not null default 15,
  shift_hours            numeric not null default 9,
  week_offs_per_month    integer not null default 4,
  duties                 text,
  updated_at             timestamptz not null default now()
);

create table if not exists core.doc_templates (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null unique check (kind in (
                 'offer_letter', 'appointment_letter', 'attendance_policy',
                 'conduct_policy', 'nda', 'deduction_consent')),
  title        text not null,
  body         text not null,         -- HTML with {{placeholders}}
  sign_method  text not null default 'in_app' check (sign_method in ('in_app', 'aadhaar')),
  audience     text not null default 'all' check (audience in ('all', 'new_joiner', 'uniform')),
  is_active    boolean not null default true,
  version      integer not null default 1,
  updated_at   timestamptz not null default now()
);

create table if not exists core.sign_requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references core.employees(id) on delete cascade,
  template_id      uuid references core.doc_templates(id) on delete set null,
  kind             text not null,
  title            text not null,
  template_version integer,
  rendered_html    text not null,
  merge_data       jsonb not null default '{}'::jsonb,
  sign_method      text not null check (sign_method in ('in_app', 'aadhaar')),
  status           text not null default 'sent'
                     check (status in ('sent', 'viewed', 'signed', 'declined', 'cancelled')),
  sent_by          uuid default auth.uid(),
  sent_at          timestamptz not null default now(),
  viewed_at        timestamptz,
  signed_at        timestamptz,
  signed_via       text check (signed_via in ('in_app', 'aadhaar')),
  signer_name      text,
  signature_path   text,
  signed_pdf_path  text,
  audit            jsonb,
  provider_ref     text,
  declined_reason  text,
  reminded_at      timestamptz
);

create index if not exists sign_requests_emp_idx on core.sign_requests (employee_id, sent_at desc);
create index if not exists sign_requests_status_idx on core.sign_requests (status, sent_at);
-- Only one open request per employee per document kind.
create unique index if not exists sign_requests_one_open
  on core.sign_requests (employee_id, kind) where status in ('sent', 'viewed');

alter table core.legal_entities enable row level security;
alter table core.position_terms enable row level security;
alter table core.doc_templates enable row level security;
alter table core.sign_requests enable row level security;

drop policy if exists legal_entities_admin_hr on core.legal_entities;
create policy legal_entities_admin_hr on core.legal_entities for all to authenticated
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));
drop policy if exists position_terms_admin_hr on core.position_terms;
create policy position_terms_admin_hr on core.position_terms for all to authenticated
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));
drop policy if exists doc_templates_admin_hr on core.doc_templates;
create policy doc_templates_admin_hr on core.doc_templates for all to authenticated
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));
drop policy if exists sign_requests_admin_hr on core.sign_requests;
create policy sign_requests_admin_hr on core.sign_requests for all to authenticated
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));
-- Employees read their own; signing goes through an RPC (step 2).
drop policy if exists sign_requests_self_select on core.sign_requests;
create policy sign_requests_self_select on core.sign_requests for select to authenticated
  using (employee_id in (select id from core.employees where user_id = auth.uid()) and status <> 'cancelled');

grant select, insert, update, delete on core.legal_entities, core.position_terms, core.doc_templates, core.sign_requests to authenticated;

-- Signatures: the director's signature image and employees' drawn signatures.
insert into storage.buckets (id, name, public, file_size_limit)
values ('signatures', 'signatures', false, 2097152)
on conflict (id) do nothing;
drop policy if exists signatures_admin_hr on storage.objects;
create policy signatures_admin_hr on storage.objects for all to authenticated
  using (bucket_id = 'signatures' and (core.is_admin() or core.has_role('hr')))
  with check (bucket_id = 'signatures' and (core.is_admin() or core.has_role('hr')));

create or replace view public.v_sign_requests with (security_invoker = true) as
select r.id, r.employee_id, r.template_id, r.kind, r.title, r.template_version, r.sign_method,
       r.status, r.sent_at, r.viewed_at, r.signed_at, r.signed_via, r.signer_name,
       r.signed_pdf_path, r.declined_reason, r.reminded_at,
       e.employee_code, e.full_name as employee_name, e.outlet_id, o.display_name as outlet_name
  from core.sign_requests r
  join core.employees e on e.id = r.employee_id
  left join flax_outlets o on o.id = e.outlet_id;
grant select on public.v_sign_requests to authenticated;

-- ── Seeds ───────────────────────────────────────────────────────────────
insert into core.legal_entities (state, cities, legal_name, address, gstin, is_pending)
select * from (values
  ('Maharashtra', array['mumbai'], 'Health and Beyond Foods Private Limited',
   'Floor-1, 12A, Laxmi Industrial Estate, Delisle Road, Near Peninsula Corporate Park, Shankarrao Naram Marg, Lower Parel, Mumbai, Maharashtra 400013',
   '27AAFCH4572C2ZO', false),
  ('Karnataka', array['bangalore'], 'Health and Beyond Foods Private Limited', null, null, true),
  ('Goa', array['goa'], 'Health and Beyond Foods Private Limited', null, null, true)
) v(state, cities, legal_name, address, gstin, is_pending)
where not exists (select 1 from core.legal_entities);

-- Terms by level; HR edits per position.
insert into core.position_terms (designation_code, probation_months, notice_days_probation, notice_days_confirmed)
select d.code,
       case when lvl = 'frontline' then 3 else 6 end,
       case lvl when 'frontline' then 7 when 'supervisor' then 15 else 30 end,
       case lvl when 'frontline' then 15 when 'supervisor' then 30 else 60 end
  from (
    select code,
           case
             when code in ('cdp','cd','dcdp','sc','si','souschef','bh','sk','km','cm','rm','mg','dm') then 'supervisor'
             when code in ('headchef','csc','am','opsmgr','oh','he','act','mg1','smm','pm','dt','ea','ae','gm2','ntrm','admin') then 'senior'
             else 'frontline'
           end as lvl
      from core.designations
  ) d
on conflict (designation_code) do nothing;
