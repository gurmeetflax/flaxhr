-- Flax HR — Migration 008: case-insensitive unique work_email for employees
--
-- Keeps two employees from sharing the same corporate email. Partial so
-- NULLs are unconstrained (not every employee has a corporate mailbox) and
-- soft-deleted rows don't block a reuse.

create unique index if not exists employees_work_email_unique
  on core.employees (lower(work_email))
  where work_email is not null and deleted_at is null;
