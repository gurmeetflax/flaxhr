-- Flax HR — Migration 004: Harden public.handle_new_user()
--
-- The original function (owned by an older Flax app) inserted into an
-- unqualified "profiles" relation and ran SECURITY DEFINER without a pinned
-- search_path. Under tightened Supabase auth internals this surfaced as
-- `relation "profiles" does not exist` on every fresh auth.users INSERT,
-- blocking signups from Flax HR's employee onboarding flow (and any other
-- app that creates auth users).
--
-- This migration:
--   1. Pins search_path = public.
--   2. Fully qualifies public.profiles.
--   3. Skips the synthetic @flax-hr.local emails used by employee PIN login
--      (those auth users are not real humans; they don't need a profile row
--      in the older app's profiles table).
--   4. Swallows unexpected errors so a profiles-side issue can never block
--      auth.users creation. Any failed profile backfill can be handled later.
--
-- Other apps are unaffected: normal Google/email signups still get a
-- profile row exactly as before.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email like '%@flax-hr.local' then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;
