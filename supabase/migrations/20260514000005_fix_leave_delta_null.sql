-- Flax HR — Fix apply_leave_balance_delta NULL propagation
--
-- Backfill was failing with:
--   null value in column "balance" of relation "leave_balances"
--   violates not-null constraint (23502)
--
-- Root cause: `select coalesce(balance, 0) into cur from core.leave_balances
--   where …` — when the row doesn't exist yet (which is exactly the
-- backfill / opening case), SELECT INTO leaves `cur` at NULL because the
-- coalesce only fires on rows that were returned. Then `cur + p_delta`
-- becomes NULL and the INSERT fails.
--
-- Fix: coalesce `cur` after the SELECT (also guards against a NULL
-- p_delta or a NULL max_balance interaction).

create or replace function core.apply_leave_balance_delta(
  p_employee    uuid,
  p_leave_type  uuid,
  p_delta       numeric,
  p_source      text,
  p_reason      text,
  p_effective   date default current_date,
  p_actor       uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = core, public
as $$
declare
  new_balance numeric(6,2);
  max_bal numeric(6,2);
  cur numeric(6,2);
begin
  select max_balance into max_bal from core.leave_types lt where lt.id = p_leave_type;

  select balance into cur
    from core.leave_balances
   where employee_id = p_employee and leave_type_id = p_leave_type;
  cur := coalesce(cur, 0);

  new_balance := cur + coalesce(p_delta, 0);

  if max_bal is not null and new_balance > max_bal then
    new_balance := max_bal;
  end if;

  insert into core.leave_balances (employee_id, leave_type_id, balance, as_of)
    values (p_employee, p_leave_type, new_balance, p_effective)
    on conflict (employee_id, leave_type_id)
    do update set balance = excluded.balance, as_of = excluded.as_of;

  insert into core.leave_balance_adjustments
    (employee_id, leave_type_id, delta, balance_after, reason, source, effective_on, created_by)
    values (p_employee, p_leave_type, new_balance - cur, new_balance,
            p_reason, p_source, p_effective, coalesce(p_actor, auth.uid()));

  return new_balance;
end;
$$;

notify pgrst, 'reload schema';
