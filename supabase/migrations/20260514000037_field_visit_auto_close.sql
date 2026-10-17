-- Meetings left open (issue #66).
--
-- A meeting never checked out blocked every later check-in, and the app
-- only listed today's meetings, so the open one could not be seen or
-- closed. Two fixes here (the app now also shows any open meeting with a
-- Check out button):
--
--   attendance.auto_close_field_visits()  runs nightly just after the 4 am
--     IST work-day cutoff. A meeting still open from an earlier work day is
--     closed at the person's last punch-out that day; with no punch-out it
--     is closed with no duration (time_unknown) rather than inventing
--     hours.
--   auto_closed / time_unknown columns, shown in v_field_visits.

alter table attendance.field_visits add column if not exists auto_closed boolean not null default false;
alter table attendance.field_visits add column if not exists time_unknown boolean not null default false;

create or replace view public.v_field_visits
with (security_invoker = true) as
select v.id,
       v.employee_id,
       e.employee_code,
       e.full_name as employee_name,
       e.outlet_id,
       v.client_name,
       v.purpose,
       v.outcome,
       v.check_in_at,
       v.check_in_lat,
       v.check_in_lng,
       v.check_in_accuracy_m,
       v.check_out_at,
       v.check_out_lat,
       v.check_out_lng,
       v.check_out_accuracy_m,
       case when v.check_out_at is not null and not v.time_unknown
            then round(extract(epoch from (v.check_out_at - v.check_in_at)) / 60)::int end as duration_min,
       v.auto_closed,
       v.time_unknown
  from attendance.field_visits v
  join core.employees e on e.id = v.employee_id;

grant select on public.v_field_visits to authenticated;

create or replace function attendance.auto_close_field_visits()
returns integer
language plpgsql
security definer
set search_path = attendance, core, public
as $$
declare
  v record;
  last_out timestamptz;
  n integer := 0;
  today_start timestamptz := core.work_day_start_at(now(), 'Asia/Kolkata');
begin
  for v in
    select * from attendance.field_visits
     where check_out_at is null and check_in_at < today_start
  loop
    select max(l.punched_at) into last_out
      from attendance.logs l
     where l.employee_id = v.employee_id
       and l.type = 'out'
       and l.punched_at > v.check_in_at
       and l.punched_at < core.work_day_start_at(v.check_in_at, 'Asia/Kolkata') + interval '1 day';

    update attendance.field_visits
       set check_out_at = coalesce(last_out, v.check_in_at),
           auto_closed = true,
           time_unknown = last_out is null,
           outcome = coalesce(outcome,
             case when last_out is null then 'Auto-closed: no check-out, time unknown'
                  else 'Auto-closed at the day''s last punch-out' end)
     where id = v.id and check_out_at is null;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function attendance.auto_close_field_visits() from public, anon, authenticated;

-- 04:05 IST, just after the work-day cutoff.
select cron.schedule('field-visits-auto-close', '35 22 * * *', $$select attendance.auto_close_field_visits()$$);

notify pgrst, 'reload schema';
