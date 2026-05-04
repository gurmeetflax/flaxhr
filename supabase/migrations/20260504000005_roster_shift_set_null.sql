-- Flax HR — Migration 020: ON DELETE SET NULL for roster_entries.shift_id
--
-- Deleting a shift used to fail with a foreign-key violation if any
-- core.roster_entries rows referenced it. We want shift deletion to
-- succeed and turn the orphan roster cells into "no shift assigned"
-- (status stays planned/published; cells render blank in the UI).

alter table core.roster_entries
  drop constraint if exists roster_entries_shift_id_fkey;

alter table core.roster_entries
  add constraint roster_entries_shift_id_fkey
  foreign key (shift_id)
  references core.shifts (id)
  on delete set null;

notify pgrst, 'reload schema';
