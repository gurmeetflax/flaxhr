-- My attendance (employee app): the signed-in employee's own month from
-- core.attendance_days, the same calculation the monthly report and the
-- payroll run use.

create or replace function public.my_attendance_month(p_from date, p_to date)
returns table (employee_id uuid, d date, status text, reason text, pairs jsonb, worked_minutes integer,
               late_minutes integer, early_minutes integer, ot_minutes integer, short_minutes integer,
               is_late boolean, long_shift boolean, sched_start timestamptz, sched_end timestamptz)
language plpgsql stable
security definer
set search_path to 'core', 'attendance', 'public'
as $function$
declare v_emp uuid;
begin
  if p_to < p_from or p_to - p_from > 62 then raise exception 'BAD_RANGE' using errcode = 'P0001'; end if;
  select e.id into v_emp from core.employees e where e.user_id = auth.uid() and e.deleted_at is null
   order by e.created_at desc limit 1;
  if v_emp is null then return; end if;
  return query select v_emp, a.* from core.attendance_days(v_emp, p_from, p_to) a order by a.d;
end; $function$;

revoke all on function public.my_attendance_month(date, date) from public, anon;
grant execute on function public.my_attendance_month(date, date) to authenticated;

notify pgrst, 'reload schema';
