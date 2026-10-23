-- Weekly roster review, emailed every Monday 15:00 IST.
--
-- Compares last week's roster with what happened: attendance from the
-- app, and orders/sales from Petpooja. The Inventory project pushes
-- actual orders per outlet, day and hour here every night through
-- public.ingest_outlet_hourly_orders() (same shared token as the
-- demand sync).
--
--   core.outlet_hourly_orders    actual orders and sales per IST day and hour
--   core.outlet_sales_targets    monthly sales target per outlet
--   public.weekly_roster_review  the report data for one week (Mon–Sun)
--   cron weekly-roster-review    Mondays 09:30 UTC → weekly-roster-review edge function

create table if not exists core.outlet_hourly_orders (
  outlet_id  text not null references public.flax_outlets(id) on delete cascade,
  day        date not null,                                    -- IST calendar date
  hour       smallint not null check (hour between 0 and 23),  -- IST
  orders     integer not null default 0,
  sales      numeric not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (outlet_id, day, hour)
);
alter table core.outlet_hourly_orders enable row level security;
create policy outlet_hourly_orders_read on core.outlet_hourly_orders for select to authenticated
  using (core.is_admin() or core.has_role('hr') or (core.has_role('manager') and core.has_outlet_access(outlet_id)));
grant select on core.outlet_hourly_orders to authenticated;

create table if not exists core.outlet_sales_targets (
  outlet_id  text not null references public.flax_outlets(id) on delete cascade,
  month      date not null check (extract(day from month) = 1),
  target     numeric not null check (target >= 0),
  updated_at timestamptz not null default now(),
  primary key (outlet_id, month)
);
alter table core.outlet_sales_targets enable row level security;
create policy outlet_sales_targets_admin on core.outlet_sales_targets for all to authenticated
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));
grant select, insert, update, delete on core.outlet_sales_targets to authenticated;

-- November 2026: ₹1.35 Cr split on October's daily pace.
insert into core.outlet_sales_targets (outlet_id, month, target) values
  ('indiranagar_flax_cafe', '2026-11-01', 1850000),
  ('powai',                 '2026-11-01', 1740000),
  ('andheri_west',          '2026-11-01', 1700000),
  ('lower_parel',           '2026-11-01', 1600000),
  ('bandra_khar',           '2026-11-01', 1400000),
  ('santacruz_kalina',      '2026-11-01', 1170000),
  ('breach_candy',          '2026-11-01',  980000),
  ('fort',                  '2026-11-01',  940000),
  ('malad',                 '2026-11-01',  940000),
  ('andheri_east',          '2026-11-01',  810000),
  ('goa',                   '2026-11-01',  370000)
on conflict (outlet_id, month) do update set target = excluded.target, updated_at = now();

create or replace function public.ingest_outlet_hourly_orders(p_token text, p_rows jsonb)
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

  insert into core.outlet_hourly_orders (outlet_id, day, hour, orders, sales)
  select m.outlet_id, (r->>'day')::date, (r->>'hour')::smallint,
         sum((r->>'orders')::int), sum(coalesce((r->>'sales')::numeric, 0))
  from jsonb_array_elements(p_rows) r
  join core.petpooja_outlet_map m on m.rest_id = r->>'rest_id'
  group by 1, 2, 3
  on conflict (outlet_id, day, hour) do update
    set orders = excluded.orders, sales = excluded.sales, refreshed_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.ingest_outlet_hourly_orders(text, jsonb) from public;
grant execute on function public.ingest_outlet_hourly_orders(text, jsonb) to anon, authenticated;

-- One week of roster vs attendance vs orders. A business day runs
-- 04:00–04:00 IST, so orders before 4am count towards the previous day.
-- "Stretched" = more than 5 orders an hour per person punched in;
-- "uncovered" = orders came in with nobody punched in.
create or replace function public.weekly_roster_review(p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path = core, public, attendance
as $$
with wk as (
  select p_week_start as d0, p_week_start + 6 as d1,
         p_week_start - 7 as p0, p_week_start - 1 as p1,
         date_trunc('month', p_week_start + 6)::date as m0
),
outs as (
  select o.id, coalesce(o.display_name, o.id) as name
  from public.flax_outlets o
  where exists (select 1 from core.roster_entries r, wk where r.outlet_id = o.id and r.work_date between wk.d0 and wk.d1)
     or exists (select 1 from core.outlet_hourly_orders h, wk where h.outlet_id = o.id and h.day between wk.d0 and wk.d1 + 1)
),
ros as (
  select r.outlet_id, r.employee_id, r.work_date, r.status, r.shift_id, coalesce(r.notes, '') as notes
  from core.roster_entries r, wk
  where r.work_date between wk.d0 and wk.d1
),
att as (
  select a.employee_id, a.work_date, coalesce(a.first_in_outlet_id, a.outlet_id) as outlet_id,
         a.first_in_at, a.last_out_at, coalesce(a.late_minutes, 0) as late_minutes,
         coalesce(a.worked_minutes, 0) as worked_minutes, coalesce(a.overtime_minutes, 0) as overtime_minutes
  from public.v_attendance_report_detailed a, wk
  where a.work_date between wk.d0 and wk.d1 and a.first_in_at is not null
),
lv as (
  select distinct lr.employee_id, g::date as d
  from core.leave_requests lr, wk, generate_series(greatest(lr.start_date, wk.d0), least(lr.end_date, wk.d1), interval '1 day') g
  where lr.status = 'approved' and lr.start_date <= wk.d1 and lr.end_date >= wk.d0
),
shift_rows as (
  select r.*, a.first_in_at, a.late_minutes,
         (a.first_in_at is not null) as attended,
         (a.first_in_at is null and r.work_date < (now() at time zone 'Asia/Kolkata')::date
            and not exists (select 1 from lv where lv.employee_id = r.employee_id and lv.d = r.work_date)) as no_show
  from ros r
  left join att a on a.employee_id = r.employee_id and a.work_date = r.work_date
  where r.status in ('planned', 'published', 'swapped') and r.shift_id is not null
),
unrostered as (
  select a.outlet_id, a.employee_id, a.work_date
  from att a
  where not exists (select 1 from shift_rows s where s.employee_id = a.employee_id and s.work_date = a.work_date)
),
ord as (
  select h.outlet_id,
         case when h.hour < 4 then h.day - 1 else h.day end as bday,
         h.day, h.hour, h.orders, h.sales
  from core.outlet_hourly_orders h, wk
  where h.day between wk.p0 and wk.d1 + 1
),
load as (
  select o.outlet_id, o.bday, o.hour, o.orders,
         (select count(*) from att a
           where a.outlet_id = o.outlet_id
             and a.first_in_at <= ((o.day + make_interval(hours => o.hour::int, mins => 30)) at time zone 'Asia/Kolkata')
             and coalesce(a.last_out_at, a.first_in_at + interval '9 hours')
                 >= ((o.day + make_interval(hours => o.hour::int, mins => 30)) at time zone 'Asia/Kolkata')) as staff_on
  from ord o, wk
  where o.bday between wk.d0 and wk.d1 and o.orders > 0
),
per_outlet as (
  select o.id as outlet_id, o.name,
    (select count(*) from shift_rows s where s.outlet_id = o.id) as rostered,
    (select count(*) from shift_rows s where s.outlet_id = o.id and s.attended) as attended,
    (select count(*) from shift_rows s where s.outlet_id = o.id and s.no_show) as no_shows,
    (select count(*) from shift_rows s where s.outlet_id = o.id and s.late_minutes > 15) as late,
    (select count(*) from unrostered u where u.outlet_id = o.id) as unrostered,
    (select round(sum(a.worked_minutes) / 60.0) from att a where a.outlet_id = o.id) as worked_hours,
    (select round(sum(a.overtime_minutes) / 60.0) from att a where a.outlet_id = o.id) as overtime_hours,
    (select coalesce(sum(orders), 0) from ord, wk where ord.outlet_id = o.id and ord.bday between wk.d0 and wk.d1) as orders,
    (select coalesce(round(sum(sales)), 0) from ord, wk where ord.outlet_id = o.id and ord.bday between wk.d0 and wk.d1) as sales,
    (select coalesce(sum(orders), 0) from ord, wk where ord.outlet_id = o.id and ord.bday between wk.p0 and wk.p1) as orders_prev,
    (select coalesce(round(sum(sales)), 0) from ord, wk where ord.outlet_id = o.id and ord.bday between wk.p0 and wk.p1) as sales_prev,
    (select count(*) from load l where l.outlet_id = o.id and l.staff_on > 0 and l.orders::numeric / l.staff_on > 5) as stretched_hours,
    (select count(*) from load l where l.outlet_id = o.id and l.staff_on = 0) as uncovered_hours,
    (select coalesce(sum(l.orders), 0) from load l where l.outlet_id = o.id and l.staff_on = 0) as uncovered_orders,
    (select jsonb_build_object('hour', l.hour, 'orders', round(avg(l.orders), 1), 'staff', round(avg(l.staff_on), 1))
       from load l where l.outlet_id = o.id group by l.hour order by avg(l.orders) desc limit 1) as peak,
    (select round(sum(h.sales)) from core.outlet_hourly_orders h, wk
      where h.outlet_id = o.id and h.day >= wk.m0 and h.day <= wk.d1) as month_sales,
    (select t.target from core.outlet_sales_targets t, wk where t.outlet_id = o.id and t.month = wk.m0) as month_target
  from outs o
),
people as (
  select e.full_name as name, coalesce(fo.display_name, s.outlet_id) as outlet,
         count(*) filter (where s.no_show) as no_shows,
         count(*) filter (where s.late_minutes > 15) as late,
         max(s.late_minutes) as worst_late_min
  from shift_rows s
  join core.employees e on e.id = s.employee_id
  left join public.flax_outlets fo on fo.id = s.outlet_id
  group by 1, 2
  having count(*) filter (where s.no_show) > 0 or count(*) filter (where s.late_minutes > 15) >= 2
)
select jsonb_build_object(
  'week_start', (select d0 from wk),
  'week_end', (select d1 from wk),
  'outlets', coalesce((select jsonb_agg(to_jsonb(p) order by p.sales desc) from per_outlet p), '[]'::jsonb),
  'people', coalesce((select jsonb_agg(to_jsonb(x) order by x.no_shows desc, x.late desc) from people x), '[]'::jsonb)
);
$$;

revoke all on function public.weekly_roster_review(date) from public, anon, authenticated;
grant execute on function public.weekly_roster_review(date) to service_role;

create or replace function public.fire_weekly_roster_review()
returns bigint
language plpgsql
security definer
set search_path = core, public, extensions
as $$
declare
  secret text := coalesce(core.get_app_setting('attendance_slack')->>'cron_shared_secret', '');
  req_id bigint;
begin
  select net.http_post(
    url := 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/weekly-roster-review',
    body := '{}'::jsonb,
    headers := case when secret = '' then '{"content-type":"application/json"}'::jsonb
                    else jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secret) end,
    timeout_milliseconds := 30000
  ) into req_id;
  return req_id;
end $$;

revoke all on function public.fire_weekly_roster_review() from public, anon, authenticated;

-- Mondays 15:00 IST.
select cron.schedule('weekly-roster-review', '30 9 * * 1', 'select public.fire_weekly_roster_review()');

notify pgrst, 'reload schema';
