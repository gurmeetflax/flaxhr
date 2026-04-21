-- Flax HR — Migration 003: Grants for PostgREST (Supabase Data API)
--
-- Grants schema USAGE and table privileges to the PostgREST roles so that
-- authenticated clients can query core.* and hr.* (subject to RLS).
-- Also grants execute on helper functions.
--
-- IMPORTANT: This alone is NOT enough for the client to see these schemas.
-- You also need to ADD 'core' and 'hr' to the project's "Exposed schemas"
-- in Supabase dashboard → Project Settings → API.

-- Schema-level usage
grant usage on schema core        to anon, authenticated;
grant usage on schema hr          to anon, authenticated;
grant usage on schema attendance  to anon, authenticated;
grant usage on schema api         to anon, authenticated;

-- Table privileges — RLS still enforces row access, this is just the
-- table-level gate.
grant select, insert, update, delete on all tables in schema core to authenticated;
grant select, insert, update, delete on all tables in schema hr   to authenticated;
grant select, insert, update, delete on all tables in schema attendance to authenticated;
grant select on all tables in schema api to authenticated;

-- Future tables created in these schemas get the same privileges.
alter default privileges in schema core
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema hr
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema attendance
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema api
  grant select on tables to authenticated;

-- Sequences — needed if any table uses sequences (none yet, all UUIDs).
grant usage, select on all sequences in schema core to authenticated;
grant usage, select on all sequences in schema hr   to authenticated;
grant usage, select on all sequences in schema attendance to authenticated;

alter default privileges in schema core grant usage, select on sequences to authenticated;
alter default privileges in schema hr   grant usage, select on sequences to authenticated;
alter default privileges in schema attendance grant usage, select on sequences to authenticated;

-- Functions (RLS helpers + my_employee)
grant execute on all functions in schema core to authenticated;
grant execute on all functions in schema api  to authenticated;

alter default privileges in schema core grant execute on functions to authenticated;
alter default privileges in schema api  grant execute on functions to authenticated;
