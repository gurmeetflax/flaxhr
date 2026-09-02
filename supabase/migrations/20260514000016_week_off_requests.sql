-- Flax HR — Week-off requests
--
-- Employees can request a paid day off ("week off") through the
-- Regularise page. Max 4 per calendar month per employee. Approved
-- requests automatically flow into payroll via the existing
-- leave_requests + is_paid path (compute_payroll already counts any
-- approved leave whose leave_type.is_paid = true).
--
-- Implementation: seeded leave_type 'week_off' + submit_week_off RPC
-- that enforces the monthly cap. Approval / rejection reuses the
-- existing decide_leave_request flow, so week-off requests show up in
-- /admin/leave/approvals with no extra code.

----------------------------------------------------------------------------
-- 1. Seed the leave type
----------------------------------------------------------------------------
insert into core.leave_types
  (code, name, is_paid, accrual_per_month, max_balance, requires_approval,
   min_notice_days, allow_half_day, is_active)
values
  ('week_off', 'Week off', true, 0, null, true, 0, false, true)
on conflict (code) do update
  set name              = excluded.name,
      is_paid           = excluded.is_paid,
      requires_approval = excluded.requires_approval,
      allow_half_day    = excluded.allow_half_day,
      is_active         = true;

----------------------------------------------------------------------------
-- 2. Submit RPC (enforces 4/month cap)
----------------------------------------------------------------------------
create or replace function public.submit_week_off(
  p_date   date,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  emp_id     uuid;
  type_id    uuid;
  month_start date;
  month_end   date;
  used        int;
  new_id      uuid;
begin
  -- Resolve caller's employee row
  select id into emp_id from core.employees where user_id = auth.uid();
  if emp_id is null then
    raise exception 'NOT_AN_EMPLOYEE' using errcode = 'P0001';
  end if;

  select id into type_id from core.leave_types where code = 'week_off' and is_active;
  if type_id is null then
    raise exception 'WEEK_OFF_TYPE_MISSING' using errcode = 'P0001';
  end if;

  month_start := date_trunc('month', p_date)::date;
  month_end   := (month_start + interval '1 month' - interval '1 day')::date;

  -- Count pending + approved week-offs for this employee in the same month.
  -- A week-off already booked on the same date is a duplicate.
  select count(*)
    into used
    from core.leave_requests
   where employee_id  = emp_id
     and leave_type_id = type_id
     and status in ('pending', 'approved')
     and start_date between month_start and month_end;

  if used >= 4 then
    raise exception 'WEEK_OFF_MONTHLY_CAP' using errcode = 'P0001',
      message = 'You have already requested 4 week-offs this month.';
  end if;

  if exists (
    select 1 from core.leave_requests
     where employee_id  = emp_id
       and leave_type_id = type_id
       and status in ('pending', 'approved')
       and start_date = p_date
  ) then
    raise exception 'WEEK_OFF_DUPLICATE' using errcode = 'P0001',
      message = 'A week-off is already requested for that date.';
  end if;

  insert into core.leave_requests
    (employee_id, leave_type_id, start_date, end_date, half_day, days, reason, status)
  values
    (emp_id, type_id, p_date, p_date, 'none', 1, p_reason, 'pending')
  returning id into new_id;

  return new_id;
end $$;

grant execute on function public.submit_week_off(date, text) to authenticated;

----------------------------------------------------------------------------
-- 3. Self-service view: my week-offs this month + remaining balance
----------------------------------------------------------------------------
drop view if exists public.v_my_week_offs;
create view public.v_my_week_offs
with (security_invoker = true) as
  select
    lr.id,
    lr.employee_id,
    lr.start_date          as off_date,
    lr.status,
    lr.reason,
    lr.decision_note,
    lr.decided_at,
    lr.created_at,
    date_trunc('month', lr.start_date)::date as period_month
  from core.leave_requests lr
  join core.leave_types lt on lt.id = lr.leave_type_id
  where lt.code = 'week_off'
    and lr.employee_id in (select id from core.employees where user_id = auth.uid());

grant select on public.v_my_week_offs to authenticated;

notify pgrst, 'reload schema';
