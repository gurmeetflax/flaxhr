-- Monthly outlet sales from Petpooja, synced from the Inventory project.
--
-- The Inventory project's nightly job (hr_push_monthly_sales, alongside
-- hr_push_hourly_demand) posts each outlet's monthly bill total for the
-- last 14 months here. The dashboard's Sales and Manpower cost % read
-- v_outlet_monthly_sales, which prefers a manually entered amount and
-- otherwise uses these synced Petpooja totals.

create table if not exists core.outlet_sales_synced (
  outlet_id     text not null references public.flax_outlets(id) on delete cascade,
  period_month  date not null,
  amount        numeric(14,2) not null,
  tickets       integer not null default 0,
  refreshed_at  timestamptz not null default now(),
  primary key (outlet_id, period_month)
);
alter table core.outlet_sales_synced enable row level security;
create policy outlet_sales_synced_read on core.outlet_sales_synced for select to authenticated
  using (core.is_admin() or core.has_role('hr') or (core.has_role('manager') and core.has_outlet_access(outlet_id)));
grant select on core.outlet_sales_synced to authenticated;

create or replace function public.ingest_outlet_monthly_sales(p_token text, p_rows jsonb)
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
  insert into core.outlet_sales_synced (outlet_id, period_month, amount, tickets)
  select m.outlet_id, (r->>'period_month')::date, sum((r->>'amount')::numeric), sum((r->>'tickets')::int)
  from jsonb_array_elements(p_rows) r
  join core.petpooja_outlet_map m on m.rest_id = r->>'rest_id'
  group by 1, 2
  on conflict (outlet_id, period_month) do update
    set amount = excluded.amount, tickets = excluded.tickets, refreshed_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.ingest_outlet_monthly_sales(text, jsonb) from public;
grant execute on function public.ingest_outlet_monthly_sales(text, jsonb) to anon, authenticated;

-- Petpooja sales per month: synced from Inventory, plus any orders that
-- reached this project's own webhook. Same columns as before.
create or replace view public.v_outlet_petpooja_month with (security_invoker = true) as
select coalesce(s.outlet_id, l.outlet_id) as outlet_id,
       coalesce(s.period_month, l.period_month) as period_month,
       coalesce(s.amount, l.amount)::numeric(14,2) as amount,
       coalesce(s.tickets, l.tickets)::bigint as tickets
from core.outlet_sales_synced s
full join (
  select outlet_id,
         (date_trunc('month', created_on at time zone 'Asia/Kolkata'))::date as period_month,
         (sum(total) filter (where status = 'Success'))::numeric(14,2) as amount,
         count(*) filter (where status = 'Success') as tickets
  from core.petpooja_orders
  where outlet_id is not null and created_on is not null
  group by 1, 2
) l on l.outlet_id = s.outlet_id and l.period_month = s.period_month;

notify pgrst, 'reload schema';
