-- Flax HR — Migration 023: reset_employee_pin RPC
--
-- Lets admin/HR change an employee's 6-digit login PIN. PIN is the
-- employee's auth password, so this updates auth.users.encrypted_password
-- with a fresh bcrypt hash.
--
-- security definer + role gate. pgcrypto is already enabled in Supabase
-- (extensions schema); we reference crypt() / gen_salt() from there
-- explicitly to avoid relying on search_path.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.reset_employee_pin(
  p_employee_id uuid,
  p_new_pin     text
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  target_user uuid;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then
    raise exception 'INVALID_PIN' using errcode = 'P0001';
  end if;

  select user_id into target_user
    from core.employees
   where id = p_employee_id and deleted_at is null;

  if target_user is null then
    raise exception 'NO_AUTH_USER' using errcode = 'P0001';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target_user;
end;
$$;

grant execute on function public.reset_employee_pin(uuid, text) to authenticated;
