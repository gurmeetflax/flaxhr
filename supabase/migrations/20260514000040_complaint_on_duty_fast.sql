-- Complaints "on duty" view, rewritten so it stops timing out.
--
-- public.v_complaint_on_duty matched each complaint to whoever was
-- punched in at that outlet, but it found every punch-out by rescanning
-- all punches through v_attendance (which also sorts the whole table).
-- That grew past the 2-minute statement timeout around 21–24 Oct, so
-- the flax-refresh-on-duty (every 15 min) and flax-complaint-card-scan
-- (nightly) cron jobs have failed since. Same columns and same matching
-- rules; the punch-out is now one index lookup per punch-in.

create or replace view public.v_complaint_on_duty as
with iv as (
  select e.employee_code,
         e.full_name as employee_name,
         case i.outlet_id
           when 'indiranagar_flax_cafe' then 'indiranagar'
           when 'lp' then 'lower_parel'
           else i.outlet_id
         end as outlet_id,
         i.punched_at as in_at,
         coalesce(o.out_at, i.punched_at + interval '16 hours') as out_at,
         o.out_at is null as open_punch
  from attendance.logs i
  join core.employees e on e.id = i.employee_id
  left join lateral (
    select min(x.punched_at) as out_at
    from attendance.logs x
    where x.employee_id = i.employee_id and x.type = 'out'
      and x.punched_at > i.punched_at and x.punched_at <= i.punched_at + interval '16 hours'
  ) o on true
  where i.type = 'in'
), comp as (
  select c.id as complaint_id,
         c.flax_outlet_id as outlet,
         c.provider,
         c.complaint_type,
         c.complaint_create_date,
         case when c.provider = 'zomato' and c.order_details ? 'createdAt'
              then (c.order_details->>'createdAt')::timestamptz
              else c.complaint_create_date end as anchor_ts,
         c.provider = 'zomato' and c.order_details ? 'createdAt' as time_is_exact
  from public.flax_complaints c
), matched as (
  select c.complaint_id, c.outlet, c.provider, c.complaint_type, c.anchor_ts, c.time_is_exact,
         iv.employee_code, iv.employee_name, iv.open_punch, iv.in_at, iv.out_at,
         row_number() over (partition by c.complaint_id, iv.employee_code order by iv.in_at desc) as rn
  from comp c
  join iv on iv.outlet_id = c.outlet and c.anchor_ts >= iv.in_at and c.anchor_ts <= iv.out_at
)
select m.complaint_id, m.outlet, m.provider, m.complaint_type, m.anchor_ts, m.time_is_exact,
       m.employee_code, m.employee_name, ve.designation_name, m.open_punch, m.in_at, m.out_at
from matched m
left join public.v_employees ve on ve.employee_code = m.employee_code
where m.rn = 1;
