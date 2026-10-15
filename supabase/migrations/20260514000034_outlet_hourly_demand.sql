-- Busy hours from Petpooja, synced from the Inventory database.
--
-- Petpooja orders live in the Inventory project (public.petpooja_orders,
-- kept current by its own sync). Every night that project computes the
-- average orders per outlet × weekday × hour over the last 8 weeks and
-- posts them here through public.ingest_outlet_hourly_demand(), which
-- checks a shared token stored in this project's vault.
--
--  core.outlet_hourly_demand   average orders (all, and dine-in) per hour
--  core.petpooja_outlet_map    Petpooja restaurant id → Flax outlet
--  public.v_outlet_hourly_orders  now reads the synced averages

create table if not exists core.outlet_hourly_demand (
  outlet_id     text not null references public.flax_outlets(id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  hour          smallint not null check (hour between 0 and 23),   -- IST
  avg_orders    numeric not null,
  avg_dine_in   numeric not null default 0,
  refreshed_at  timestamptz not null default now(),
  primary key (outlet_id, weekday, hour)
);
alter table core.outlet_hourly_demand enable row level security;
create policy outlet_hourly_demand_read on core.outlet_hourly_demand for select to authenticated
  using (core.is_admin() or core.has_role('hr') or (core.has_role('manager') and core.has_outlet_access(outlet_id)));
grant select on core.outlet_hourly_demand to authenticated;

-- Petpooja restaurant ids for each outlet. (Separate from
-- core.petpooja_restaurants, which also authorises the order webhook.)
create table if not exists core.petpooja_outlet_map (
  rest_id    text primary key,
  outlet_id  text not null references public.flax_outlets(id) on delete cascade,
  notes      text
);
alter table core.petpooja_outlet_map enable row level security;
create policy petpooja_outlet_map_admin on core.petpooja_outlet_map for all to authenticated
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));
grant select, insert, update, delete on core.petpooja_outlet_map to authenticated;

insert into core.petpooja_outlet_map (rest_id, outlet_id, notes) values
  ('67409', 'lower_parel', 'Flax - Lower Parel'),
  ('374829', 'indiranagar_flax_cafe', 'Flax Cafe - Indiranagar'),
  ('61343', 'powai', 'Flax - Powai'),
  ('86112', 'andheri_west', 'Flax - Andheri'),
  ('67411', 'bandra_khar', 'Flax - Bandra'),
  ('321235', 'malad', 'Flax - Malad'),
  ('364954', 'santacruz_kalina', 'Flax - Kalina'),
  ('68713', 'breach_candy', 'Flax - Breach Candy'),
  ('330910', 'fort', 'Flax - Kalaghoda'),
  ('430772', 'andheri_east', 'Flax - Marol'),
  ('446886', 'goa', 'Flax - Goa')
on conflict (rest_id) do update set outlet_id = excluded.outlet_id, notes = excluded.notes;

-- Called by the Inventory project's nightly job. p_rows:
--   [{ "rest_id": "67409", "weekday": 3, "hour": 12, "avg_orders": 13.1, "avg_dine_in": 0.4 }, ...]
create or replace function public.ingest_outlet_hourly_demand(p_token text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_expected text;
  v_count integer;
begin
  select decrypted_secret into v_expected from vault.decrypted_secrets where name = 'inventory_demand_token';
  if v_expected is null or p_token is distinct from v_expected then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  create temp table _rows on commit drop as
  select m.outlet_id, (r->>'weekday')::smallint as weekday, (r->>'hour')::smallint as hour,
         sum((r->>'avg_orders')::numeric) as avg_orders, sum(coalesce((r->>'avg_dine_in')::numeric, 0)) as avg_dine_in
  from jsonb_array_elements(p_rows) r
  join core.petpooja_outlet_map m on m.rest_id = r->>'rest_id'
  group by 1, 2, 3;

  -- Hours with no orders any more drop to zero; the rest are replaced.
  update core.outlet_hourly_demand d set avg_orders = 0, avg_dine_in = 0, refreshed_at = now()
  where d.outlet_id in (select distinct outlet_id from _rows);
  insert into core.outlet_hourly_demand (outlet_id, weekday, hour, avg_orders, avg_dine_in)
  select outlet_id, weekday, hour, avg_orders, avg_dine_in from _rows
  on conflict (outlet_id, weekday, hour) do update
    set avg_orders = excluded.avg_orders, avg_dine_in = excluded.avg_dine_in, refreshed_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.ingest_outlet_hourly_demand(text, jsonb) from public;
grant execute on function public.ingest_outlet_hourly_demand(text, jsonb) to anon, authenticated;

-- Same leading columns as before, so the view is replaced in place.
create or replace view public.v_outlet_hourly_orders with (security_invoker = true) as
select outlet_id, weekday::int as weekday, hour::int as hour, round(avg_orders, 1) as avg_orders,
       round(avg_dine_in, 1) as avg_dine_in, refreshed_at
from core.outlet_hourly_demand
where avg_orders > 0;
grant select on public.v_outlet_hourly_orders to authenticated;

-- The shared token lives in both projects' vaults as 'inventory_demand_token'
-- (created by hand, not in this file).

notify pgrst, 'reload schema';
