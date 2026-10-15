-- Edge functions use the service role (roster-reminder, cv-score,
-- esign, slack digests). The core schema granted it nothing by default,
-- so each new function hit "permission denied". Give it read access to
-- core, now and for tables added later; writes stay per table.
grant usage on schema core to service_role;
grant select on all tables in schema core to service_role;
alter default privileges in schema core grant select on tables to service_role;
