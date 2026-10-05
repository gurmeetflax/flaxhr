-- Flax HR — Complaint cards list the complaint categories
--
-- run_complaint_card_scan() issues a red card for every n-th approved
-- on-duty customer complaint (n from card_reasons.threshold, default 3).
-- Its note only said "Auto: 3 genuine customer complaints while on shift".
-- Now it names what the complaints were and when, e.g.
--   "Auto: 3 complaints on shift — Wrong item ×2, Bad quality ×1 (4 Aug – 16 Aug)"
--
-- Card grouping and auto_key are unchanged (same ranking as before), so
-- no duplicate cards are issued. Existing complaint cards get the new note.

create or replace function core.complaint_type_label(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'Wrong_Item'              then 'Wrong item'
    when 'Missing_Item'            then 'Missing item'
    when 'Poor_Quality_Taste'      then 'Bad quality'
    when 'Quality_Issue'           then 'Bad quality'
    when 'Quantity_Issue'          then 'Short quantity'
    when 'Poor_Packaging_Spillage' then 'Packaging / spillage'
    when 'Order_Delayed'           then 'Order delayed'
    else coalesce(replace(p_type, '_', ' '), 'Other')
  end
$$;

-- One row per completed group of n complaints per employee.
create or replace function core.complaint_card_groups(p_n int)
returns table (
  employee_code     text,
  employee_id       uuid,
  last_complaint_id uuid,
  incident_date     date,
  note              text
)
language sql
stable
security definer
set search_path = core, public
as $$
  with ev as (
    select v.employee_code,
           c.id as complaint_id,
           c.complaint_create_date::date as d,
           (c.complaint_create_date at time zone 'Asia/Kolkata')::date as d_ist,
           core.complaint_type_label(c.complaint_type) as label
    from public.v_complaint_on_duty v
    join public.flax_complaints c on c.id = v.complaint_id
    where c.mark = 'approved'
      and c.complaint_create_date >= date '2026-08-01'
  ),
  ranked as (
    select ev.*,
           row_number() over (partition by ev.employee_code order by ev.d, ev.complaint_id) as rn
    from ev
  ),
  grouped as (
    select r.*, (r.rn - 1) / p_n as grp from ranked r
  ),
  label_counts as (
    select g.employee_code, g.grp, g.label, count(*) as k
    from grouped g group by 1, 2, 3
  ),
  groups as (
    select g.employee_code, g.grp,
           count(*) as size,
           min(g.d_ist) as first_d,
           max(g.d_ist) as last_d,
           (array_agg(g.complaint_id order by g.rn desc))[1] as last_complaint_id,
           (array_agg(g.d order by g.rn desc))[1] as last_d_utc
    from grouped g group by 1, 2
  )
  select gr.employee_code,
         e.id,
         gr.last_complaint_id,
         gr.last_d_utc,
         'Auto: ' || gr.size || ' complaints on shift — ' ||
         (select string_agg(lc.label || ' ×' || lc.k, ', ' order by lc.k desc, lc.label)
            from label_counts lc
           where lc.employee_code = gr.employee_code and lc.grp = gr.grp) ||
         ' (' || to_char(gr.first_d, 'FMDD Mon') ||
         case when gr.first_d <> gr.last_d then ' – ' || to_char(gr.last_d, 'FMDD Mon') else '' end ||
         ')'
  from groups gr
  join core.employees e on e.employee_code = gr.employee_code
  where gr.size = p_n
$$;

create or replace function public.run_complaint_card_scan()
returns integer
language plpgsql
security definer
set search_path = core, public
as $$
declare
  r core.card_reasons%rowtype;
  n int;
  red_expiry int;
  cnt int := 0;
  rec record;
begin
  select * into r from core.card_reasons
   where code = 'complaints_on_shift' and is_active and is_auto;
  if r.code is null then return 0; end if;
  n := coalesce((r.threshold->>'n')::int, 3);
  red_expiry := coalesce((core.get_app_setting('card_settings')->>'red_expiry_days')::int, 180);

  for rec in select * from core.complaint_card_groups(n) loop
    insert into core.cards (employee_id, reason_code, colour, incident_date, source,
                            expires_at, auto_key, notes)
    values (rec.employee_id, 'complaints_on_shift', 'red', rec.incident_date, 'auto',
            now() + (red_expiry || ' days')::interval,
            'complaints_on_shift:' || rec.employee_code || ':' || rec.last_complaint_id,
            rec.note)
    on conflict (employee_id, auto_key) where auto_key is not null do nothing;
    if found then cnt := cnt + 1; end if;
  end loop;
  return cnt;
end
$$;

-- Backfill the notes on cards already issued.
update core.cards c
   set notes = g.note
  from core.complaint_card_groups(
         coalesce((select (threshold->>'n')::int from core.card_reasons
                    where code = 'complaints_on_shift'), 3)
       ) g
 where c.reason_code = 'complaints_on_shift'
   and c.auto_key = 'complaints_on_shift:' || g.employee_code || ':' || g.last_complaint_id
   and c.notes is distinct from g.note;
