-- Flax HR — Migration 024: Simplify employee code to FLAX####
--
-- Drops the FLX-<OUTLET>-<NNNN> format. Every employee is renamed to a flat
-- FLAX#### code (4-digit zero-padded), and their auth.users.email is rewritten
-- in lockstep so PIN login keeps working (encrypted_password is untouched).
--
-- New hires are auto-numbered from a sequence; admins no longer type the code.
--
-- Sequence is seeded past current usage so existing numeric tails (e.g. the
-- 0001 in FLX-BND-0001) become FLAX0001 etc. The order is deterministic by
-- (created_at, id) so reruns on equivalent data produce equivalent results.

-- ==========================================================================
-- 1. Sequence + helper
-- ==========================================================================
create sequence if not exists core.employee_code_seq
  increment by 1
  minvalue 1
  start with 1;

create or replace function core.format_employee_code(n bigint)
returns text
language sql
immutable
as $$
  select 'FLAX' || lpad(n::text, 4, '0');
$$;

-- ==========================================================================
-- 2. Drop old CHECK so we can backfill
-- ==========================================================================
do $$
declare
  cn text;
begin
  select conname into cn
    from pg_constraint
   where conrelid = 'core.employees'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%FLX-%';
  if cn is not null then
    execute format('alter table core.employees drop constraint %I', cn);
  end if;
end $$;

-- ==========================================================================
-- 3. Backfill: rename every employee + matching auth.users.email
-- ==========================================================================
do $$
declare
  r          record;
  next_n     bigint;
  new_code   text;
  new_email  text;
begin
  -- Reset the sequence to start fresh (we will assign 0001..N to the existing
  -- rows in created_at order, then leave it pointing at N for new hires).
  perform setval('core.employee_code_seq', 1, false);

  for r in
    select id, user_id, employee_code
      from core.employees
     where deleted_at is null
     order by created_at asc, id asc
  loop
    next_n   := nextval('core.employee_code_seq');
    new_code := core.format_employee_code(next_n);
    new_email := lower(new_code) || '@flax-hr.local';

    update core.employees
       set employee_code = new_code,
           updated_at = now()
     where id = r.id;

    if r.user_id is not null then
      update auth.users
         set email = new_email,
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             updated_at = now()
       where id = r.user_id;
    else
      raise notice 'employee % has no user_id; skipping auth email rewrite', r.id;
    end if;
  end loop;

  -- Soft-deleted rows: rename them too so the unique index stays clean and
  -- restores never collide with new live codes.
  for r in
    select id, user_id, employee_code
      from core.employees
     where deleted_at is not null
     order by created_at asc, id asc
  loop
    next_n   := nextval('core.employee_code_seq');
    new_code := core.format_employee_code(next_n);
    new_email := lower(new_code) || '@flax-hr.local';

    update core.employees set employee_code = new_code where id = r.id;
    if r.user_id is not null then
      update auth.users
         set email = new_email,
             updated_at = now()
       where id = r.user_id;
    end if;
  end loop;
end $$;

-- ==========================================================================
-- 4. Add new CHECK
-- ==========================================================================
alter table core.employees
  add constraint employees_code_format_chk
  check (employee_code ~ '^FLAX[0-9]{4}$');

-- ==========================================================================
-- 5. BEFORE INSERT trigger: fill code from sequence if not provided
-- ==========================================================================
create or replace function core.assign_employee_code()
returns trigger
language plpgsql
as $$
begin
  if new.employee_code is null or new.employee_code = '' then
    new.employee_code := core.format_employee_code(nextval('core.employee_code_seq'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_assign_code on core.employees;
create trigger trg_employees_assign_code
  before insert on core.employees
  for each row execute function core.assign_employee_code();

-- ==========================================================================
-- 6. RPC: reserve the next code (used by the New Employee form for preview
-- and for explicit reservation when creating the auth user first).
-- ==========================================================================
create or replace function public.next_employee_code()
returns text
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return core.format_employee_code(nextval('core.employee_code_seq'));
end;
$$;

grant execute on function public.next_employee_code() to authenticated;
