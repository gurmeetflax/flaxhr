-- Flax HR — Migration 006: phone uniqueness on employees
--
-- Only enforce phone uniqueness at the DB level (one phone = one person is
-- universally true). Duplicate full names are checked in the app before
-- submit so we can show a specific error, but we don't hard-block at the
-- DB because legitimate same-name cases exist across outlets.

create unique index if not exists employees_phone_unique
  on core.employees (phone)
  where phone is not null and deleted_at is null;
