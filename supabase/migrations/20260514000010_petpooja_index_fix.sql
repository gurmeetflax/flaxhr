-- Flax HR — Fix Petpooja immutable-index error
--
-- 20260514000009 tried:
--   create index … on core.petpooja_orders (outlet_id, (date_trunc('month', created_on)));
-- which errors with:
--   42P17: functions in index expression must be marked IMMUTABLE
-- because date_trunc(text, timestamptz) is STABLE (result depends on
-- session timezone), not IMMUTABLE.
--
-- The functional index wasn't strictly necessary — the monthly rollup
-- query uses `date_trunc(...) at time zone 'Asia/Kolkata'` on the fly
-- and a plain (outlet_id, created_on desc) index gives the same range-
-- scan efficiency. Ship a plain composite instead and drop the earlier
-- attempt so re-runs don't error out again.

-- If the previous attempt somehow succeeded on part of the migration,
-- drop what it left behind. The rest of migration 000009 is idempotent
-- (create table if not exists, create or replace function, etc.) so
-- rerunning it after this migration will finish cleanly.

drop index if exists core.pp_orders_outlet_month_idx;

create index if not exists pp_orders_outlet_created_idx
  on core.petpooja_orders (outlet_id, created_on desc);

notify pgrst, 'reload schema';
