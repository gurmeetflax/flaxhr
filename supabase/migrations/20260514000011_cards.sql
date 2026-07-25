-- Flax HR — Discipline card system
--
-- Yellow / Red / Green cards with configurable thresholds and reasons.
--
-- Core rules (all overridable via core.app_settings.card_settings):
--   * 3 active yellows -> auto 1 red (yellows retire)
--   * 2 active reds    -> mandatory PIP (linked to core.pips)
--   * Cards expire after `expiry_days` (default 90)
--   * 3 greens         -> offset 1 yellow
--   * Onboarding grace: first N days no auto-cards (default 60)
--
-- Every insert fires an alert to the card-alert Edge Function via
-- pg_net, which posts to Slack and sends personal email.

----------------------------------------------------------------------------
-- 1. Reasons catalog (editable via /admin/settings/cards)
----------------------------------------------------------------------------
create table if not exists core.card_reasons (
  code           text primary key,
  title          text not null,
  description    text,
  colour         text not null check (colour in ('yellow','red','green')),
  category       text not null check (category in
                   ('attendance','behaviour','skill','compliance','safety','excellence')),
  is_auto        boolean not null default false,
  threshold      jsonb,                -- e.g. {"late_minutes": 15}
                                       -- or   {"lates_in_days": {"n":3,"window":7}}
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function core.touch_card_reason()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_card_reason_touch on core.card_reasons;
create trigger trg_card_reason_touch before update on core.card_reasons
  for each row execute function core.touch_card_reason();

alter table core.card_reasons enable row level security;
drop policy if exists cr_read_all on core.card_reasons;
create policy cr_read_all on core.card_reasons for select using (true);
drop policy if exists cr_admin_write on core.card_reasons;
create policy cr_admin_write on core.card_reasons for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

-- Seed defaults if catalog is empty.
insert into core.card_reasons (code, title, colour, category, is_auto, threshold, description) values
  ('late_shift',        'Late arrival',                 'yellow','attendance', true,  '{"late_minutes":15}'::jsonb,
   'Arriving >15 minutes past scheduled shift start (after grace).'),
  ('repeated_lates',    'Repeated lates',               'yellow','attendance', true,  '{"n":3,"window_days":7}'::jsonb,
   '3 or more late arrivals in a rolling 7-day window.'),
  ('no_show',           'No-show / unauthorised absence','red',   'attendance', true,  null,
   'Scheduled to work but no punch and no approved leave for the day.'),
  ('break_overrun',     'Break overrun',                'yellow','behaviour',  false, '{"minutes":10}'::jsonb,
   'Break extended more than 10 minutes past allotted time.'),
  ('uniform_violation', 'Uniform violation',            'yellow','compliance', false, null,
   'Not in prescribed uniform or hygiene standard.'),
  ('rude_customer',     'Rude to customer (verified)',  'yellow','behaviour',  false, null,
   'Verified customer feedback of rude / unprofessional behaviour.'),
  ('customer_complaint','Customer complaint (severe)',  'red',   'behaviour',  false, null,
   'Severe verified customer complaint escalated by manager.'),
  ('cash_shortage',     'Cash / inventory shortage',    'red',   'compliance', false, '{"amount":500}'::jsonb,
   'Till or inventory short by more than configured amount.'),
  ('failed_eval',       'Failed evaluation',            'red',   'skill',      true,  '{"pct":40}'::jsonb,
   'Scored below configured percentage on a submitted evaluation.'),
  ('confrontation',     'Confrontation',                'red',   'behaviour',  false, null,
   'Physical or verbal confrontation with a colleague or customer.'),
  ('exceptional_shift', 'Exceptional shift',            'green', 'excellence', false, null,
   'Outstanding contribution during a shift (customer praise, cover, etc.).'),
  ('customer_praise',   'Customer praise',              'green', 'excellence', false, null,
   'Verified customer compliment (Google review, walk-in praise, etc.).')
on conflict (code) do nothing;

----------------------------------------------------------------------------
-- 2. Cards
----------------------------------------------------------------------------
create table if not exists core.cards (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references core.employees(id) on delete cascade,
  reason_code      text not null references core.card_reasons(code),
  colour           text not null check (colour in ('yellow','red','green')),
  incident_date    date not null default current_date,
  issued_by        uuid references auth.users(id),
  issued_at        timestamptz not null default now(),
  source           text not null default 'manual' check (source in ('manual','auto')),
  status           text not null default 'active' check (status in
                     ('active','expired','appealed','rescinded','acknowledged')),
  expires_at       timestamptz,
  acknowledged_at  timestamptz,
  notes            text,
  evidence_path    text,
  linked_pip_id    uuid references core.pips(id),
  linked_eval_id   uuid references core.evaluations(id),
  auto_key         text,             -- fingerprint for auto-cards (dedupe)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists cards_emp_status_idx on core.cards (employee_id, status);
create index if not exists cards_colour_active_idx on core.cards (colour, expires_at)
  where status = 'active';
create unique index if not exists cards_auto_key_uq on core.cards (employee_id, auto_key)
  where auto_key is not null;

create or replace function core.touch_card()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_cards_touch on core.cards;
create trigger trg_cards_touch before update on core.cards
  for each row execute function core.touch_card();

alter table core.cards enable row level security;

drop policy if exists cards_admin_hr on core.cards;
create policy cards_admin_hr on core.cards for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists cards_manager_read on core.cards;
create policy cards_manager_read on core.cards for select
  using (
    core.has_role('manager') and exists (
      select 1 from core.employees e
      where e.id = core.cards.employee_id
        and (e.outlet_id is null or core.has_outlet_access(e.outlet_id))
    )
  );

drop policy if exists cards_self_read on core.cards;
create policy cards_self_read on core.cards for select
  using (employee_id in (select id from core.employees where user_id = auth.uid()));

----------------------------------------------------------------------------
-- 3. Settings — populate defaults in core.app_settings.card_settings
----------------------------------------------------------------------------
insert into core.app_settings (key, value)
values (
  'card_settings',
  jsonb_build_object(
    'yellow_expiry_days', 90,
    'red_expiry_days',    180,
    'green_expiry_days',  90,
    'yellows_to_red',     3,
    'reds_to_pip',        2,
    'reds_to_termination_review', 3,
    'greens_offset_yellow', 3,
    'onboarding_grace_days', 60,
    'late_grace_minutes',   15,
    'lates_window_days',    7,
    'lates_window_n',       3,
    'alert_slack',          true,
    'alert_email',          true,
    'alert_function_url',
      'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/card-alert'
  )
)
on conflict (key) do nothing;

----------------------------------------------------------------------------
-- 4. RPC — manual card issue (admin/HR)
----------------------------------------------------------------------------
create or replace function public.issue_card(
  p_employee    uuid,
  p_reason_code text,
  p_notes       text default null,
  p_evidence    text default null,
  p_colour      text default null,          -- override reason's colour
  p_incident    date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  r core.card_reasons%rowtype;
  new_id uuid;
  cfg jsonb;
  colour text;
  expiry_days int;
begin
  if not (core.is_admin() or core.has_role('hr') or core.has_role('manager')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into r from core.card_reasons where code = p_reason_code and is_active;
  if r.code is null then raise exception 'UNKNOWN_REASON' using errcode = 'P0001'; end if;
  colour := coalesce(p_colour, r.colour);
  cfg := coalesce(core.get_app_setting('card_settings'), '{}'::jsonb);
  expiry_days := case colour
    when 'red'    then coalesce((cfg->>'red_expiry_days')::int,    180)
    when 'green'  then coalesce((cfg->>'green_expiry_days')::int,  90)
    else               coalesce((cfg->>'yellow_expiry_days')::int, 90)
  end;

  insert into core.cards (
    employee_id, reason_code, colour, incident_date,
    issued_by, source, notes, evidence_path, expires_at
  ) values (
    p_employee, p_reason_code, colour, p_incident,
    auth.uid(), 'manual', p_notes, p_evidence,
    now() + (expiry_days || ' days')::interval
  )
  returning id into new_id;

  return new_id;
end $$;
grant execute on function public.issue_card(uuid, text, text, text, text, date)
  to authenticated;

----------------------------------------------------------------------------
-- 5. RPC — auto-scan for lates + no-shows + failed evaluations
--    Idempotent per (employee, reason, day) via auto_key.
----------------------------------------------------------------------------
create or replace function public.run_card_auto_scan(
  p_date date default null
)
returns int
language plpgsql
security definer
set search_path = core, public, attendance
as $$
declare
  cfg jsonb;
  target date;
  grace_min int;
  win_days int;
  win_n int;
  grace_onboard int;
  count int := 0;
  rec record;
  auto_key_val text;
  new_expiry int;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    -- Allow the cron caller (service_role) too — it's SECURITY DEFINER
    -- so grants alone gate this.
    null;
  end if;

  target := coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date);
  cfg := coalesce(core.get_app_setting('card_settings'), '{}'::jsonb);
  grace_min := coalesce((cfg->>'late_grace_minutes')::int, 15);
  win_days  := coalesce((cfg->>'lates_window_days')::int, 7);
  win_n     := coalesce((cfg->>'lates_window_n')::int, 3);
  grace_onboard := coalesce((cfg->>'onboarding_grace_days')::int, 60);
  new_expiry := coalesce((cfg->>'yellow_expiry_days')::int, 90);

  -- (a) Single-shift lates on target date
  for rec in
    select r.employee_id
    from public.v_attendance_report r
    join core.employees e on e.id = r.employee_id
    where r.work_date = target
      and coalesce(r.late_minutes, 0) > grace_min
      and (e.hired_on is null or (target - e.hired_on) >= grace_onboard)
  loop
    auto_key_val := 'late_shift:' || target::text;
    insert into core.cards (employee_id, reason_code, colour, incident_date, source,
                             expires_at, auto_key, notes)
    values (rec.employee_id, 'late_shift', 'yellow', target, 'auto',
            now() + (new_expiry || ' days')::interval, auto_key_val,
            'Auto: > ' || grace_min || ' min late on ' || target::text)
    on conflict (employee_id, auto_key) where auto_key is not null do nothing;
    if found then count := count + 1; end if;
  end loop;

  -- (b) Repeated lates in rolling window ending target
  for rec in
    with lates as (
      select r.employee_id, r.work_date
      from public.v_attendance_report r
      join core.employees e on e.id = r.employee_id
      where r.work_date between (target - (win_days-1)) and target
        and coalesce(r.late_minutes, 0) > grace_min
        and (e.hired_on is null or (target - e.hired_on) >= grace_onboard)
    ),
    agg as (
      select employee_id, count(*) as c
      from lates group by employee_id
    )
    select employee_id from agg where c >= win_n
  loop
    auto_key_val := 'repeated_lates:' || target::text;
    insert into core.cards (employee_id, reason_code, colour, incident_date, source,
                             expires_at, auto_key, notes)
    values (rec.employee_id, 'repeated_lates', 'yellow', target, 'auto',
            now() + (new_expiry || ' days')::interval, auto_key_val,
            'Auto: ' || win_n || '+ lates in last ' || win_days || ' days')
    on conflict (employee_id, auto_key) where auto_key is not null do nothing;
    if found then count := count + 1; end if;
  end loop;

  -- (c) No-shows on target date (absent + not on leave + roster scheduled)
  for rec in
    select r.employee_id
    from public.v_attendance_report r
    join core.employees e on e.id = r.employee_id
    where r.work_date = target
      and r.status = 'absent'
      and r.scheduled_start_at is not null
      and (e.hired_on is null or (target - e.hired_on) >= grace_onboard)
  loop
    auto_key_val := 'no_show:' || target::text;
    insert into core.cards (employee_id, reason_code, colour, incident_date, source,
                             expires_at, auto_key, notes)
    values (rec.employee_id, 'no_show', 'red', target, 'auto',
            now() + (coalesce((cfg->>'red_expiry_days')::int, 180) || ' days')::interval,
            auto_key_val,
            'Auto: no punch on scheduled day ' || target::text)
    on conflict (employee_id, auto_key) where auto_key is not null do nothing;
    if found then count := count + 1; end if;
  end loop;

  return count;
end $$;
grant execute on function public.run_card_auto_scan(date) to authenticated;

----------------------------------------------------------------------------
-- 6. Expire cards past their expires_at (nightly maintenance)
----------------------------------------------------------------------------
create or replace function public.expire_old_cards()
returns int
language plpgsql
security definer
set search_path = core, public
as $$
declare
  n int;
begin
  update core.cards
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at <= now()
  returning 1 into n;
  return coalesce(n, 0);
end $$;
grant execute on function public.expire_old_cards() to authenticated;

----------------------------------------------------------------------------
-- 7. Snapshot view — active card counts per employee
----------------------------------------------------------------------------
drop view if exists public.v_employee_cards;
create view public.v_employee_cards
with (security_invoker = true) as
  select
    e.id as employee_id,
    count(*) filter (where c.status = 'active' and c.colour = 'yellow') as yellow_active,
    count(*) filter (where c.status = 'active' and c.colour = 'red')    as red_active,
    count(*) filter (where c.status = 'active' and c.colour = 'green')  as green_active,
    max(c.issued_at) filter (where c.status = 'active') as latest_card_at
  from core.employees e
  left join core.cards c on c.employee_id = e.id
  where e.deleted_at is null
  group by e.id;
grant select on public.v_employee_cards to authenticated;

drop view if exists public.v_cards;
create view public.v_cards
with (security_invoker = true) as
  select c.*, e.employee_code, e.full_name as employee_name,
         e.outlet_id, o.display_name as outlet_name,
         r.title as reason_title, r.category as reason_category
  from core.cards c
  join core.employees e on e.id = c.employee_id
  left join public.flax_outlets o on o.id = e.outlet_id
  join core.card_reasons r on r.code = c.reason_code;
grant select on public.v_cards to authenticated;

----------------------------------------------------------------------------
-- 8. Trigger — fire card-alert Edge Function on every new active card
----------------------------------------------------------------------------
create or replace function core.notify_card_issued()
returns trigger
language plpgsql
security definer
set search_path = core, public, extensions
as $$
declare
  cfg jsonb;
  url text;
begin
  cfg := coalesce(core.get_app_setting('card_settings'), '{}'::jsonb);
  url := coalesce(cfg->>'alert_function_url', '');
  if url = '' then return new; end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('card_id', new.id),
    headers := '{"content-type":"application/json"}'::jsonb
  );
  return new;
exception when others then
  -- Never break the insert if pg_net or the function is unavailable.
  return new;
end $$;

drop trigger if exists trg_card_issued_notify on core.cards;
create trigger trg_card_issued_notify
  after insert on core.cards
  for each row execute function core.notify_card_issued();

----------------------------------------------------------------------------
-- 9. pg_cron — nightly auto-scan + expire (23:30 IST = 18:00 UTC)
----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('cards-auto-scan','cards-expire');
    perform cron.schedule(
      'cards-auto-scan', '0 18 * * *',
      $sql$select public.run_card_auto_scan()$sql$
    );
    perform cron.schedule(
      'cards-expire', '15 18 * * *',
      $sql$select public.expire_old_cards()$sql$
    );
    raise notice 'Scheduled card auto-scan + expiry';
  else
    raise notice 'pg_cron not enabled — call run_card_auto_scan / expire_old_cards manually';
  end if;
end $$;

notify pgrst, 'reload schema';
