-- Auto roster: what each outlet needs, its rules, and how designations
-- group into roster roles.
--
--  core.staffing_needs   how many people of each roster group an outlet
--                        needs in a time block on a weekday ("Sat 12-15:
--                        2 kitchen, 1 service"). Filled by hand, or
--                        suggested from Petpooja orders per hour.
--  core.roster_rules     per-outlet rules: busiest days (no week offs),
--                        max people off per day, seniority thresholds.
--  designations.roster_group / is_lead
--                        kitchen / service / barista / management / support,
--                        and whether the role can lead a shift.
--  public.v_outlet_hourly_orders
--                        average orders per weekday and hour over the last
--                        8 weeks, for suggesting staffing needs.

alter table core.designations add column if not exists roster_group text
  check (roster_group in ('kitchen', 'service', 'barista', 'management', 'support', 'office'));
alter table core.designations add column if not exists is_lead boolean not null default false;

-- Starting groups by name; editable in Settings → Designations.
update core.designations set roster_group = case
    when name ~* '(chef|commi|cdp|dcdp|kst|kitchen|bakery|food packer|packing|dispatch)' then 'kitchen'
    when name ~* '(barista)' then 'barista'
    when name ~* '(captain|steward|team member|cashier|customer service)' then 'service'
    when name ~* '(restaurant manager|cafe manager|^manager$|shift incharge|area manager|operation)' then 'management'
    when name ~* '(house keeping|office boy|watchman|store)' then 'support'
    else 'office'
  end
where roster_group is null;

-- Roaming roles (area / operations managers) aren't rostered at an outlet.
update core.designations set roster_group = null
where name in ('Area Manager', 'Operations Manager', 'Operation Head');

update core.designations set is_lead = true
where name ~* '(head chef|sous chef|chef de partie|^cdp$|dcdp|kitchen manager|bakery head|sr captain|^captain$|shift incharge|manager)';

create table if not exists core.staffing_needs (
  id           uuid primary key default gen_random_uuid(),
  outlet_id    text not null references public.flax_outlets(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  block_start  time not null,
  block_end    time not null,                                     -- may pass midnight
  roster_group text not null check (roster_group in ('kitchen', 'service', 'barista', 'management', 'support', 'office')),
  headcount    smallint not null check (headcount between 0 and 50),
  source       text not null default 'manual' check (source in ('manual', 'petpooja')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists staffing_needs_outlet_idx on core.staffing_needs (outlet_id, weekday);

create table if not exists core.roster_rules (
  outlet_id          text primary key references public.flax_outlets(id) on delete cascade,
  busiest_days       smallint[] not null default '{0,6}', -- no week offs (0 = Sunday, 6 = Saturday)
  max_off_per_day    smallint not null default 2,
  senior_months      smallint not null default 12,       -- this long at Flax counts as experienced
  new_joiner_months  smallint not null default 3,        -- pair these with experienced staff
  orders_per_staff_hour numeric not null default 8,       -- for Petpooja suggestions
  updated_at         timestamptz not null default now()
);

alter table core.staffing_needs enable row level security;
alter table core.roster_rules enable row level security;

drop policy if exists staffing_needs_admin_hr on core.staffing_needs;
create policy staffing_needs_admin_hr on core.staffing_needs for all to authenticated
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));
drop policy if exists staffing_needs_manager on core.staffing_needs;
create policy staffing_needs_manager on core.staffing_needs for all to authenticated
  using (core.has_role('manager') and core.has_outlet_access(outlet_id))
  with check (core.has_role('manager') and core.has_outlet_access(outlet_id));

drop policy if exists roster_rules_admin_hr on core.roster_rules;
create policy roster_rules_admin_hr on core.roster_rules for all to authenticated
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));
drop policy if exists roster_rules_manager on core.roster_rules;
create policy roster_rules_manager on core.roster_rules for all to authenticated
  using (core.has_role('manager') and core.has_outlet_access(outlet_id))
  with check (core.has_role('manager') and core.has_outlet_access(outlet_id));

grant select, insert, update, delete on core.staffing_needs, core.roster_rules to authenticated;

-- Average completed orders per weekday × hour (IST), last 8 weeks.
create or replace view public.v_outlet_hourly_orders
with (security_invoker = true) as
select
  o.outlet_id,
  extract(dow from o.created_on at time zone 'Asia/Kolkata')::int as weekday,
  extract(hour from o.created_on at time zone 'Asia/Kolkata')::int as hour,
  round(count(*)::numeric / 8, 1) as avg_orders
from core.petpooja_orders o
where o.outlet_id is not null
  and o.created_on >= now() - interval '8 weeks'
  and coalesce(o.status, 'Success') not ilike '%cancel%'
group by 1, 2, 3;

grant select on public.v_outlet_hourly_orders to authenticated;

-- Designations view gains the roster fields (appended, so existing columns keep their order).
create or replace view public.v_designations as
select code, name, is_active, display_order, sc_points_per_day, roster_group, is_lead
from core.designations
order by display_order, name;

notify pgrst, 'reload schema';
