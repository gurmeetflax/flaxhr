-- Flax HR — hiring: roles with requirements, candidates, CV scoring
--
-- HR opens a role (linked to a designation), uploads CVs, and the
-- cv-score edge function rates each CV 0–100 against the role's
-- requirements with Claude. Candidates move New → Shortlisted →
-- Interview → Selected / Rejected; interviews go on the director's
-- calendar via an emailed .ics invite with a Meet link. Admin/HR only.

create table if not exists core.hiring_roles (
  id               uuid primary key default gen_random_uuid(),
  designation_code text references core.designations(code),
  title            text not null,
  department       text not null default 'kitchen'
                     check (department in ('kitchen', 'service', 'management', 'office')),
  -- { summary, must_have[], nice_to_have[], min_experience_years, languages[], location, red_flags[] }
  requirements     jsonb not null default '{}'::jsonb,
  is_open          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists core.candidates (
  id                uuid primary key default gen_random_uuid(),
  role_id           uuid not null references core.hiring_roles(id) on delete cascade,
  full_name         text,
  phone             text,
  email             text,
  city              text,
  cv_path           text not null,
  cv_filename       text,
  cv_mime           text,
  status            text not null default 'new'
                      check (status in ('new', 'shortlisted', 'interview', 'selected', 'rejected')),
  score             integer check (score between 0 and 100),
  -- { summary, recommendation, years_experience, current_role, criteria[{requirement, kind, verdict, evidence}], strengths[], concerns[] }
  score_detail      jsonb,
  score_error       text,
  scored_at         timestamptz,
  interview_at      timestamptz,
  interview_minutes integer not null default 30,
  meet_link         text,
  interview_notes   text,
  invite_sent_at    timestamptz,
  employee_id       uuid references core.employees(id) on delete set null,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists candidates_role_idx on core.candidates (role_id, score desc nulls last);

alter table core.hiring_roles enable row level security;
alter table core.candidates enable row level security;

drop policy if exists hiring_roles_admin_hr on core.hiring_roles;
create policy hiring_roles_admin_hr on core.hiring_roles for all to authenticated
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists candidates_admin_hr on core.candidates;
create policy candidates_admin_hr on core.candidates for all to authenticated
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

grant select, insert, update, delete on core.hiring_roles, core.candidates to authenticated;

-- Private bucket for CVs (PDF, Word, photos), admin/HR only.
insert into storage.buckets (id, name, public, file_size_limit)
values ('cvs', 'cvs', false, 15728640)
on conflict (id) do nothing;

drop policy if exists cvs_admin_hr_select on storage.objects;
create policy cvs_admin_hr_select on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (core.is_admin() or core.has_role('hr')));
drop policy if exists cvs_admin_hr_insert on storage.objects;
create policy cvs_admin_hr_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (core.is_admin() or core.has_role('hr')));
drop policy if exists cvs_admin_hr_delete on storage.objects;
create policy cvs_admin_hr_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (core.is_admin() or core.has_role('hr')));

-- Starter requirements per role. HR edits these in the app.
insert into core.hiring_roles (designation_code, title, department, requirements)
select v.code, v.title, v.dept, v.req::jsonb
  from (values
  ('c3', 'Commi III', 'kitchen', '{"summary":"Entry-level kitchen hand for a healthy-food kitchen: prep, basic cooking under supervision, hygiene.","must_have":["Any kitchen or food-prep experience, or hotel-management / culinary course","Basic knife skills and vegetable prep","Willing to work shifts, weekends and holidays","Lives within commuting distance of the outlet"],"nice_to_have":["Experience in salads, bowls, grills or a QSR/cafe kitchen","FSSAI / food-hygiene awareness","Understands Hindi or Marathi kitchen instructions"],"min_experience_years":0,"languages":["Hindi"],"location":"Mumbai / Bangalore / Goa","red_flags":["Frequent job changes (less than 3 months each)","No availability for weekends"]}'),
  ('c2', 'Commi II', 'kitchen', '{"summary":"Kitchen cook who runs a station with light supervision.","must_have":["1+ year in a commercial kitchen","Handles a station (cold, hot, grill or bakery) independently","Follows recipes and portion specs exactly","Food-safety and FIFO discipline"],"nice_to_have":["Continental, salads, bowls or healthy-food experience","Culinary diploma or hotel-management course","Experience in a high-volume delivery kitchen"],"min_experience_years":1,"languages":["Hindi"],"location":"Mumbai / Bangalore / Goa","red_flags":["Frequent job changes","Only home-cooking experience"]}'),
  ('c1', 'Commi I', 'kitchen', '{"summary":"Senior commi who owns a station, trains juniors and keeps prep ready for service.","must_have":["2+ years in a commercial kitchen","Owns a station and its mise en place","Trains Commi II/III","Strong hygiene, FIFO and wastage control"],"nice_to_have":["Continental / healthy / salad-bar background","Culinary diploma","Cafe or cloud-kitchen experience"],"min_experience_years":2,"languages":["Hindi"],"location":"Mumbai / Bangalore / Goa","red_flags":["Frequent job changes"]}'),
  ('cdp', 'Chef de Partie', 'kitchen', '{"summary":"Section head responsible for a section''s quality, prep, ordering and team during service.","must_have":["4+ years in commercial kitchens, 1+ as CDP or Demi CDP","Leads a section and a small team","Recipe costing, portion control and wastage control","Food-safety compliance (FSSAI)"],"nice_to_have":["Healthy, continental or Mediterranean cuisine","Menu development input","Multi-outlet or central-kitchen experience"],"min_experience_years":4,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["No supervisory experience"]}'),
  ('souschef', 'Sous Chef', 'kitchen', '{"summary":"Second-in-command who runs the kitchen on shift: team, quality, stock, hygiene audits.","must_have":["6+ years in professional kitchens, 2+ as CDP or above","Runs the kitchen in the Head Chef''s absence","Rostering, training and discipline of the kitchen team","Inventory, ordering, food cost and wastage control","Food-safety and audit compliance"],"nice_to_have":["Healthy / continental / salad-bowl concepts","Central kitchen or multi-outlet experience","Culinary degree"],"min_experience_years":6,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["No team-management experience"]}'),
  ('headchef', 'Head Chef', 'kitchen', '{"summary":"Leads the kitchen: menu execution, recipe standards, food cost, hiring and training.","must_have":["8+ years in professional kitchens, 2+ leading a kitchen","Menu development and recipe standardisation","Food cost and P&L awareness","Hiring, training and rostering kitchen teams","FSSAI and hygiene audit ownership"],"nice_to_have":["Healthy-food, nutrition-aware or Mediterranean menus","Multi-outlet or cloud-kitchen scaling","Culinary degree"],"min_experience_years":8,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["Only fine-dining a-la-minute experience with no volume","Very short tenures"]}'),
  ('km', 'Kitchen Manager', 'kitchen', '{"summary":"Runs kitchen operations and systems: stock, vendors, compliance, team.","must_have":["5+ years in kitchen operations with supervisory role","Inventory, ordering and vendor coordination","Food cost, wastage and yield tracking","Team rostering and discipline","Hygiene and audit compliance"],"nice_to_have":["Central-kitchen or multi-outlet experience","POS / inventory software (Petpooja etc.)"],"min_experience_years":5,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["No people-management experience"]}'),
  ('bh', 'Bakery Head', 'kitchen', '{"summary":"Leads bakery and pastry production: breads, healthy bakes, consistency and cost.","must_have":["5+ years in bakery or pastry, 2+ leading","Breads, sourdough or healthy bakes at volume","Recipe standardisation and costing","Hygiene and shelf-life control"],"nice_to_have":["Gluten-free, sugar-free or vegan baking","Bakery diploma"],"min_experience_years":5,"languages":["Hindi","English"],"location":"Mumbai","red_flags":["Only small home-bakery experience"]}'),
  ('c', 'Captain', 'service', '{"summary":"Front-of-house captain: guest service, order-taking, upselling and a small service team.","must_have":["2+ years in restaurant or cafe service","Confident with guests, takes and punches orders accurately","Knows the menu and upsells","Grooming and punctuality"],"nice_to_have":["Healthy-food / cafe concepts","POS experience (Petpooja)","Handles complaints calmly"],"min_experience_years":2,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["Frequent job changes","Poor communication"]}'),
  ('sc', 'Sr Captain', 'service', '{"summary":"Senior captain who runs the floor on a shift and trains stewards.","must_have":["3+ years in restaurant service, 1+ as captain","Runs a section or the floor during service","Trains and supervises stewards","Complaint handling and guest recovery"],"nice_to_have":["Opening / closing and cash handling","POS and aggregator order handling"],"min_experience_years":3,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["No supervisory experience"]}'),
  ('s', 'Steward', 'service', '{"summary":"Service staff: serving, clearing, table set-up and guest care.","must_have":["Willing to learn service standards","Basic spoken Hindi or English","Neat grooming, punctual, shift flexibility"],"nice_to_have":["Any restaurant, cafe or hotel service experience","Hotel-management course"],"min_experience_years":0,"languages":["Hindi"],"location":"Mumbai / Bangalore / Goa","red_flags":["No availability for weekends"]}'),
  ('ba', 'Barista', 'service', '{"summary":"Makes coffee and beverages to spec and serves guests at the counter.","must_have":["1+ year as a barista or coffee-bar staff","Espresso extraction, milk texturing and latte art basics","Cleanliness and machine upkeep"],"nice_to_have":["Specialty coffee or cold-brew experience","Smoothies / cold-pressed juices","Counter sales and POS"],"min_experience_years":1,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["Only instant / vending-machine coffee"]}'),
  ('cashier', 'Cashier', 'service', '{"summary":"Handles billing, payments, cash and aggregator orders at the counter.","must_have":["1+ year handling billing or cash","Accurate with POS, UPI and card payments","Cash reconciliation at shift end","Honest and detail-oriented"],"nice_to_have":["Petpooja / restaurant POS","Aggregator (Swiggy/Zomato) order handling"],"min_experience_years":1,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["Cash-shortage history"]}'),
  ('teammember', 'Team Member', 'service', '{"summary":"All-rounder for counter, service, packing and basic prep.","must_have":["Willing to work across counter, service and packing","Punctual, shift and weekend availability","Basic spoken Hindi or English"],"nice_to_have":["QSR / cafe experience","Aggregator order packing"],"min_experience_years":0,"languages":["Hindi"],"location":"Mumbai / Bangalore / Goa","red_flags":["No weekend availability"]}'),
  ('rm', 'Restaurant Manager', 'management', '{"summary":"Runs an outlet end-to-end: sales, guest experience, team, cost and compliance.","must_have":["5+ years in restaurant/cafe operations, 2+ managing an outlet","Owns outlet P&L, sales targets and food/labour cost","Rostering, hiring and training staff","Guest experience, reviews and complaint recovery","Licences, hygiene and audit compliance"],"nice_to_have":["Healthy-food / cafe brand experience","Aggregator growth (Swiggy/Zomato ratings, ads)","Petpooja / POS reports"],"min_experience_years":5,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["Very short tenures","No P&L ownership"]}'),
  ('cm', 'Cafe Manager', 'management', '{"summary":"Runs a cafe outlet: service, beverage and food quality, team and sales.","must_have":["4+ years in cafe/QSR operations, 1+ managing","Sales targets and daily reporting","Team rostering and training","Inventory and wastage control"],"nice_to_have":["Specialty coffee knowledge","Healthy-food concepts","Aggregator handling"],"min_experience_years":4,"languages":["Hindi","English"],"location":"Mumbai / Bangalore / Goa","red_flags":["No people-management experience"]}'),
  ('am', 'Area Manager', 'management', '{"summary":"Oversees several outlets: performance, audits, managers, rosters and expansion support.","must_have":["8+ years in F&B operations, 2+ managing multiple outlets","Multi-outlet P&L, sales and cost control","Coaches outlet managers; rosters and manpower planning","SOP, hygiene and audit enforcement","Data-driven: reads sales, cost and attendance reports"],"nice_to_have":["New outlet openings","Healthy / premium cafe brands","Field-heavy role across the city"],"min_experience_years":8,"languages":["Hindi","English"],"location":"Mumbai","red_flags":["Only single-outlet experience"]}'),
  ('opsmgr', 'Operations Manager', 'management', '{"summary":"Runs operations across outlets and central kitchen: SOPs, supply, people and numbers.","must_have":["8+ years in F&B operations leadership","Multi-outlet and central-kitchen operations","SOPs, audits and process design","Vendor, supply and inventory management","Team leadership and hiring"],"nice_to_have":["Scaling a chain or cloud kitchen","ERP / POS reporting"],"min_experience_years":8,"languages":["Hindi","English"],"location":"Mumbai","red_flags":["No multi-site experience"]}'),
  ('he', 'HR Executive', 'office', '{"summary":"HR for a growing restaurant chain: hiring, onboarding, attendance, payroll inputs and compliance.","must_have":["2+ years in HR, ideally hospitality or retail","Bulk hiring for frontline roles","Onboarding, KYC and documentation","Attendance, leave and payroll inputs","PF/ESIC/PT basics"],"nice_to_have":["HRMS / attendance-app experience","Employee engagement and grievance handling","MBA/PG in HR"],"min_experience_years":2,"languages":["Hindi","English","Marathi"],"location":"Mumbai (Head Office)","red_flags":["Only corporate white-collar hiring"]}'),
  ('act', 'Accountant', 'office', '{"summary":"Books, GST, payables/receivables and reconciliations for a multi-outlet F&B company.","must_have":["3+ years in accounting","Tally / Zoho Books","GST filing and TDS","Bank, vendor and aggregator reconciliations","B.Com or equivalent"],"nice_to_have":["Restaurant / multi-outlet accounting","Payroll and statutory compliance","CA Inter"],"min_experience_years":3,"languages":["English","Hindi"],"location":"Mumbai (Head Office)","red_flags":["No GST experience"]}'),
  ('mg1', 'Marketing Manager', 'office', '{"summary":"Grows the Flax brand: social, performance marketing, aggregator growth and campaigns.","must_have":["4+ years in marketing, ideally F&B/consumer brands","Instagram and content strategy","Performance marketing (Meta/Google)","Aggregator marketing (Swiggy/Zomato)","Reads data and reports ROI"],"nice_to_have":["Health / wellness brand experience","Influencer and community marketing","Design tools (Canva/Figma)"],"min_experience_years":4,"languages":["English","Hindi"],"location":"Mumbai (Head Office)","red_flags":["No measurable results in CV"]}'),
  ('smm', 'Sales Manager', 'office', '{"summary":"B2B / corporate sales: corporate meals, catering, subscriptions and partnerships. Field role.","must_have":["3+ years in B2B or corporate sales","Generates and closes leads independently","Field meetings with clients","Targets and pipeline reporting"],"nice_to_have":["F&B / catering / corporate-meal sales","Existing corporate network in Mumbai","CRM usage"],"min_experience_years":3,"languages":["English","Hindi"],"location":"Mumbai","red_flags":["Only inside/telesales with no closing"]}'),
  ('pm', 'Purchase Manager', 'office', '{"summary":"Buys ingredients and supplies for outlets and central kitchen at the right price and quality.","must_have":["4+ years in F&B or FMCG purchasing","Vendor sourcing and negotiation","Price, quality and specification control","Inventory and par-level planning"],"nice_to_have":["Fresh produce / organic sourcing","ERP / inventory systems"],"min_experience_years":4,"languages":["Hindi","English"],"location":"Mumbai","red_flags":["No food purchasing experience"]}'),
  ('dt', 'Data Analyst', 'office', '{"summary":"Turns sales, cost, attendance and marketing data into reports and decisions.","must_have":["2+ years in data / business analysis","Advanced Excel / Google Sheets","SQL","Dashboards (Looker Studio, Power BI or similar)"],"nice_to_have":["F&B / retail / aggregator data","Python","Forecasting"],"min_experience_years":2,"languages":["English"],"location":"Mumbai (Head Office)","red_flags":["No hands-on SQL"]}'),
  ('ea', 'Executive Assistant', 'office', '{"summary":"Supports the director: calendar, follow-ups, documents, coordination across teams.","must_have":["2+ years as EA or similar","Calendar, email and meeting management","Strong written and spoken English","Follows up and closes loops","Google Workspace / MS Office"],"nice_to_have":["Startup or F&B exposure","Basic finance / reporting"],"min_experience_years":2,"languages":["English","Hindi"],"location":"Mumbai (Head Office)","red_flags":["Poor written English in CV"]}')
  ) as v(code, title, dept, req)
 where not exists (select 1 from core.hiring_roles h where h.title = v.title);

-- Views for the app (security_invoker, so RLS above applies).
create or replace view public.v_hiring_roles with (security_invoker = true) as
select r.*,
       (select count(*) from core.candidates c where c.role_id = r.id) as candidates,
       (select count(*) from core.candidates c where c.role_id = r.id and c.status = 'new') as new_candidates,
       (select count(*) from core.candidates c where c.role_id = r.id and c.status = 'interview') as interviews
  from core.hiring_roles r;

create or replace view public.v_candidates with (security_invoker = true) as
select c.*, r.title as role_title, r.department, r.designation_code
  from core.candidates c
  join core.hiring_roles r on r.id = c.role_id;

grant select on public.v_hiring_roles, public.v_candidates to authenticated;

notify pgrst, 'reload schema';
