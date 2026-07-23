-- Flax HR — Petpooja POS ingestion
--
-- Petpooja's Global API pushes one JSON blob per "SAVE AND PRINT" event
-- (an `orderdetails` event) to a public webhook URL. There's no auth
-- beyond an optional static token in the body. We host the webhook on a
-- Supabase Edge Function that just forwards the raw payload to
-- public.ingest_petpooja_order() — this migration provides the storage
-- + RPC + rollup view.
--
-- Model:
--   core.petpooja_restaurants — mapping Petpooja restID → flax_outlets.id
--                                plus the static token we agreed on
--   core.petpooja_orders      — one row per (rest_id, order_id_petpooja).
--                                idempotent; re-sends of the same order
--                                update the row instead of duplicating.
--   public.v_outlet_monthly_sales — extended to prefer the auto sum
--                                from petpooja_orders when nothing was
--                                manually entered.

----------------------------------------------------------------------------
-- 1. Restaurant mapping (per-outlet Petpooja credentials)
----------------------------------------------------------------------------
create table if not exists core.petpooja_restaurants (
  rest_id     text primary key,
  outlet_id   text not null references public.flax_outlets(id) on delete cascade,
  token       text,                 -- static token Petpooja sends in body
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists petpooja_rest_outlet_idx
  on core.petpooja_restaurants (outlet_id);

alter table core.petpooja_restaurants enable row level security;

drop policy if exists pp_rest_admin_hr on core.petpooja_restaurants;
create policy pp_rest_admin_hr on core.petpooja_restaurants for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop trigger if exists trg_pp_rest_touch on core.petpooja_restaurants;
create or replace function core.touch_petpooja_restaurant()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger trg_pp_rest_touch before update on core.petpooja_restaurants
  for each row execute function core.touch_petpooja_restaurant();

----------------------------------------------------------------------------
-- 2. Order table — one row per unique (rest_id, order_id_petpooja)
----------------------------------------------------------------------------
create table if not exists core.petpooja_orders (
  id                 uuid primary key default gen_random_uuid(),
  rest_id            text not null,
  outlet_id          text references public.flax_outlets(id) on delete set null,
  order_id_petpooja  bigint not null,
  invoice_id         text,
  order_type         text,           -- Dine In / Pick Up / Delivery
  payment_type       text,           -- Cash / Card / Online / Part Payment / Other
  order_from         text,           -- POS / Zomato / Swiggy / …
  sub_order_type     text,
  status             text,           -- Success / Cancelled
  core_total         numeric(14,2),
  total              numeric(14,2),
  discount_total     numeric(14,2) default 0,
  tax_total          numeric(14,2) default 0,
  packaging_charge   numeric(14,2) default 0,
  service_charge     numeric(14,2) default 0,
  delivery_charges   numeric(14,2) default 0,
  round_off          numeric(14,2) default 0,
  created_on         timestamptz,    -- when Petpooja printed the bill
  raw                jsonb not null, -- keep the whole payload for later mining
  received_at        timestamptz not null default now(),
  unique (rest_id, order_id_petpooja)
);

-- Note: can't index `date_trunc('month', created_on)` because
-- date_trunc(text, timestamptz) is STABLE (session-TZ dependent),
-- not IMMUTABLE. Plain (outlet_id, created_on) gives the planner the
-- same range-scan for month rollups.
create index if not exists pp_orders_outlet_created_idx
  on core.petpooja_orders (outlet_id, created_on desc);
create index if not exists pp_orders_status_idx
  on core.petpooja_orders (status);
create index if not exists pp_orders_created_idx
  on core.petpooja_orders (created_on desc);

alter table core.petpooja_orders enable row level security;

drop policy if exists pp_orders_admin_hr on core.petpooja_orders;
create policy pp_orders_admin_hr on core.petpooja_orders for select
  using (core.is_admin() or core.has_role('hr')
         or (core.has_role('manager') and (outlet_id is null or core.has_outlet_access(outlet_id))));

-- No INSERT / UPDATE policies for authenticated users — only the
-- SECURITY DEFINER RPC below writes here.

----------------------------------------------------------------------------
-- 3. Ingestion RPC — called by the Edge Function with the raw JSON
----------------------------------------------------------------------------
create or replace function public.ingest_petpooja_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_rest_id text;
  v_token   text;
  v_order   jsonb;
  v_outlet  text;
  v_stored_token text;
  v_order_pk bigint;
  v_status text;
begin
  -- Petpooja sends token either as top-level "token" or "Token".
  v_token := coalesce(
    nullif(p_payload->>'token', ''),
    nullif(p_payload->>'Token', '')
  );

  v_rest_id := p_payload->'properties'->'Restaurant'->>'restID';
  if v_rest_id is null then
    raise exception 'MISSING_RESTID' using errcode = 'P0001';
  end if;

  select outlet_id, token into v_outlet, v_stored_token
    from core.petpooja_restaurants
    where rest_id = v_rest_id;

  if v_outlet is null then
    raise exception 'UNKNOWN_RESTID: %', v_rest_id using errcode = 'P0001';
  end if;

  if v_stored_token is not null and v_stored_token <> '' then
    if v_token is null or v_token <> v_stored_token then
      raise exception 'INVALID_TOKEN' using errcode = 'P0001';
    end if;
  end if;

  v_order := p_payload->'properties'->'Order';
  if v_order is null then
    raise exception 'MISSING_ORDER' using errcode = 'P0001';
  end if;

  v_order_pk := (v_order->>'orderID')::bigint;
  v_status := coalesce(v_order->>'status', 'Success');

  insert into core.petpooja_orders (
    rest_id, outlet_id, order_id_petpooja, invoice_id,
    order_type, payment_type, order_from, sub_order_type, status,
    core_total, total, discount_total, tax_total,
    packaging_charge, service_charge, delivery_charges, round_off,
    created_on, raw
  ) values (
    v_rest_id, v_outlet, v_order_pk, v_order->>'customer_invoice_id',
    v_order->>'order_type', v_order->>'payment_type',
    v_order->>'order_from', v_order->>'sub_order_type', v_status,
    nullif(v_order->>'core_total', '')::numeric,
    nullif(v_order->>'total', '')::numeric,
    coalesce(nullif(v_order->>'discount_total', '')::numeric, 0),
    coalesce(nullif(v_order->>'tax_total', '')::numeric, 0),
    coalesce(nullif(v_order->>'packaging_charge', '')::numeric, 0),
    coalesce(nullif(v_order->>'service_charge', '')::numeric, 0),
    coalesce(nullif(v_order->>'delivery_charges', '')::numeric, 0),
    coalesce(nullif(v_order->>'round_off', '')::numeric, 0),
    nullif(v_order->>'created_on', '')::timestamptz,
    p_payload
  )
  on conflict (rest_id, order_id_petpooja) do update set
    invoice_id       = excluded.invoice_id,
    order_type       = excluded.order_type,
    payment_type     = excluded.payment_type,
    order_from       = excluded.order_from,
    sub_order_type   = excluded.sub_order_type,
    status           = excluded.status,
    core_total       = excluded.core_total,
    total            = excluded.total,
    discount_total   = excluded.discount_total,
    tax_total        = excluded.tax_total,
    packaging_charge = excluded.packaging_charge,
    service_charge   = excluded.service_charge,
    delivery_charges = excluded.delivery_charges,
    round_off        = excluded.round_off,
    created_on       = excluded.created_on,
    raw              = excluded.raw,
    received_at      = now();

  return jsonb_build_object(
    'ok', true,
    'rest_id', v_rest_id,
    'outlet_id', v_outlet,
    'order_id', v_order_pk,
    'status', v_status
  );
end $$;

-- Called only by the Edge Function using service_role, which bypasses
-- RLS. We still grant execute so the routing works cleanly.
grant execute on function public.ingest_petpooja_order(jsonb) to authenticated, anon, service_role;

----------------------------------------------------------------------------
-- 4. Rollups
----------------------------------------------------------------------------
-- v_outlet_petpooja_month: month-level Petpooja sum per outlet
drop view if exists public.v_outlet_petpooja_month;
create view public.v_outlet_petpooja_month
with (security_invoker = true) as
  select
    outlet_id,
    date_trunc('month', created_on at time zone 'Asia/Kolkata')::date as period_month,
    -- Cast to numeric(14,2) so the outer coalesce with
    -- outlet_monthly_sales.amount doesn't change the column's declared
    -- type (CREATE OR REPLACE VIEW forbids type changes).
    sum(total) filter (where status = 'Success')::numeric(14,2) as amount,
    count(*)  filter (where status = 'Success') as tickets
  from core.petpooja_orders
  where outlet_id is not null and created_on is not null
  group by outlet_id, date_trunc('month', created_on at time zone 'Asia/Kolkata');

grant select on public.v_outlet_petpooja_month to authenticated;

-- Extend v_outlet_monthly_sales: manual value wins, Petpooja sum fills
-- in when no manual entry exists. Same column list so existing frontend
-- keeps working.
create or replace view public.v_outlet_monthly_sales
with (security_invoker = true) as
  select
    coalesce(s.outlet_id, p.outlet_id)                                as outlet_id,
    coalesce(s.period_month, p.period_month)                          as period_month,
    coalesce(s.amount, p.amount)::numeric(14,2)                       as amount,
    coalesce(s.updated_at, now())                                     as updated_at,
    o.display_name                                                    as outlet_name,
    p.amount                                                          as auto_amount,
    p.tickets                                                         as auto_tickets,
    s.amount                                                          as manual_amount
  from public.v_outlet_petpooja_month p
  full outer join core.outlet_monthly_sales s
    on s.outlet_id = p.outlet_id and s.period_month = p.period_month
  left join public.flax_outlets o
    on o.id = coalesce(s.outlet_id, p.outlet_id)
  order by coalesce(s.period_month, p.period_month) desc,
           o.display_name;

grant select on public.v_outlet_monthly_sales to authenticated;

notify pgrst, 'reload schema';
