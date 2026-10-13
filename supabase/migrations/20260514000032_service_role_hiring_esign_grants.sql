-- Edge functions (cv-score, interview-invite, esign-start, leegality-webhook)
-- use the service role for these tables; core grants nothing to it by default.
grant usage on schema core to service_role;
grant select, update on core.candidates to service_role;
grant select on core.hiring_roles to service_role;
grant select, update on core.sign_requests to service_role;
grant select on core.employees to service_role;
grant select, insert on core.employee_documents to service_role;
