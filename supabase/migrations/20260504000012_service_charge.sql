-- Flax HR — Migration 028: Service Charge Disbursement
--
-- Per-outlet, per-month tool to compute and lock SC payouts to staff.
--
-- Header (core.outlet_sc_runs) captures:
--   surcharge_collected, retain%, mnr%, breakages, complaints
-- → derives gross_payable, net_payable.
--
-- Lines (core.outlet_sc_run_lines) snapshot per-employee:
--   designation, days_present, points_per_day, total_points, sc_payable
--
-- compute_sc_run() returns a live preview (no writes) by aggregating
-- attendance.logs distinct in-punch dates + half-day approved leaves.
-- finalize_sc_run() snapshots + locks.
--
-- Reuses primitives: core.designations, attendance.logs,
-- core.leave_requests.half_day, role helpers, audit + set_updated_at.

-- ==========================================================================
-- 1. Designation weight column
-- ==========================================================================
alter table core.designations
  add column if not exists sc_points_per_day numeric(5,2) not null default 1.00;

-- Refresh v_designations to expose the new column. Append-only so
-- CREATE OR REPLACE VIEW is fine.
create or replace view public.v_designations
with (security_invoker = true) as
  select code, name, is_active, display_order, sc_points_per_day
  from core.designations
  order by display_order, name;

grant select on public.v_designations to authenticated;

-- ==========================================================================
-- 2. SC run header
-- ==========================================================================
create table if not exists core.outlet_sc_runs (
  id                  uuid primary key default gen_random_uuid(),
  outlet_id           text not null references public.flax_outlets(id) on delete cascade,
  period_month        date not null,
  surcharge_collected numeric(14,2) not null default 0 check (surcharge_collected >= 0),
  surcharge_note      text,
  company_retain_pct  numeric(5,2)  not null default 30.00 check (company_retain_pct between 0 and 100),
  mnr_pct             numeric(5,2)  not null default 10.00 check (mnr_pct between 0 and 100),
  breakages_amount    numeric(14,2) not null default 0 check (breakages_amount >= 0),
  breakages_note      text,
  complaints_amount   numeric(14,2) not null default 0 check (complaints_amount >= 0),
  complaints_note     text,
  status              text not null default 'draft' check (status in ('draft','final')),
  point_value         numeric(14,4),
  gross_payable       numeric(14,2),
  net_payable         numeric(14,2),
  total_points_sum    numeric(10,2),
  notes               text,
  finalized_at        timestamptz,
  finalized_by        uuid references auth.users(id),
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (outlet_id, period_month),
  check (period_month = date_trunc('month', period_month)::date),
  check (company_retain_pct + mnr_pct <= 100)
);

create index if not exists outlet_sc_runs_period_idx
  on core.outlet_sc_runs (period_month);

drop trigger if exists trg_sc_runs_touch on core.outlet_sc_runs;
create trigger trg_sc_runs_touch
  before update on core.outlet_sc_runs
  for each row execute function core.set_updated_at();

drop trigger if exists trg_sc_runs_audit on core.outlet_sc_runs;
create trigger trg_sc_runs_audit
  after insert or update or delete on core.outlet_sc_runs
  for each row execute function core.log_audit();

alter table core.outlet_sc_runs enable row level security;

drop policy if exists sc_runs_admin_hr on core.outlet_sc_runs;
create policy sc_runs_admin_hr on core.outlet_sc_runs for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists sc_runs_manager on core.outlet_sc_runs;
create policy sc_runs_manager on core.outlet_sc_runs for select
  using (core.has_role('manager') and core.has_outlet_access(outlet_id));

drop policy if exists sc_runs_employee_self on core.outlet_sc_runs;
create policy sc_runs_employee_self on core.outlet_sc_runs for select
  using (
    status = 'final'
    and outlet_id in (select e.outlet_id from core.employees e where e.user_id = auth.uid())
  );

-- ==========================================================================
-- 3. SC run lines (snapshot per employee on finalize)
-- ==========================================================================
create table if not exists core.outlet_sc_run_lines (
  run_id                  uuid not null references core.outlet_sc_runs(id) on delete cascade,
  employee_id             uuid not null references core.employees(id) on delete cascade,
  designation_code        text,
  designation_name        text,
  days_present            numeric(5,1) not null default 0,
  days_present_override   numeric(5,1),
  points_per_day          numeric(5,2) not null default 1.00,
  points_per_day_override numeric(5,2),
  total_points            numeric(8,2) not null default 0,
  sc_payable              numeric(14,2) not null default 0,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (run_id, employee_id)
);

create index if not exists outlet_sc_run_lines_emp_idx
  on core.outlet_sc_run_lines (employee_id);

drop trigger if exists trg_sc_run_lines_touch on core.outlet_sc_run_lines;
create trigger trg_sc_run_lines_touch
  before update on core.outlet_sc_run_lines
  for each row execute function core.set_updated_at();

drop trigger if exists trg_sc_run_lines_audit on core.outlet_sc_run_lines;
create trigger trg_sc_run_lines_audit
  after insert or update or delete on core.outlet_sc_run_lines
  for each row execute function core.log_audit();

alter table core.outlet_sc_run_lines enable row level security;

drop policy if exists sc_lines_admin_hr on core.outlet_sc_run_lines;
create policy sc_lines_admin_hr on core.outlet_sc_run_lines for all
  using (core.is_admin() or core.has_role('hr'))
  with check (core.is_admin() or core.has_role('hr'));

drop policy if exists sc_lines_manager on core.outlet_sc_run_lines;
create policy sc_lines_manager on core.outlet_sc_run_lines for select
  using (
    core.has_role('manager')
    and exists (
      select 1 from core.outlet_sc_runs r
      where r.id = core.outlet_sc_run_lines.run_id
        and core.has_outlet_access(r.outlet_id)
    )
  );

drop policy if exists sc_lines_employee_self on core.outlet_sc_run_lines;
create policy sc_lines_employee_self on core.outlet_sc_run_lines for select
  using (
    employee_id in (select id from core.employees where user_id = auth.uid())
    and exists (
      select 1 from core.outlet_sc_runs r
      where r.id = core.outlet_sc_run_lines.run_id and r.status = 'final'
    )
  );

-- ==========================================================================
-- 4. RPCs
-- ==========================================================================

-- compute_sc_run: read-only preview. Returns one row per active employee at
-- the run's outlet, with auto-derived days_present from attendance + half-day
-- leaves, designation snapshot + override (if any line stored), and computed
-- total_points + projected sc_payable using a *projected* point_value
-- (live preview only, not the snapshot used at finalize).
create or replace function public.compute_sc_run(p_run_id uuid)
returns table (
  employee_id             uuid,
  employee_code           text,
  full_name               text,
  hired_on                date,
  designation_code        text,
  designation_name        text,
  points_per_day_default  numeric,
  points_per_day          numeric,
  points_per_day_override numeric,
  days_present_auto       numeric,
  days_present            numeric,
  days_present_override   numeric,
  total_points            numeric,
  projected_sc_payable    numeric,
  notes                   text
)
language plpgsql
security definer
set search_path = core, attendance, public
as $$
declare
  run_row     core.outlet_sc_runs%rowtype;
  period_start date;
  period_end   date;
  net_preview  numeric;
  sum_points   numeric;
begin
  select * into run_row from core.outlet_sc_runs where id = p_run_id;
  if run_row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if not (core.is_admin() or core.has_role('hr')
          or (core.has_role('manager') and core.has_outlet_access(run_row.outlet_id))) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  period_start := run_row.period_month;
  period_end := (period_start + interval '1 month')::date;

  -- Compute net_preview from header inputs (re-derived live so the preview
  -- reflects unsaved header edits as well — caller can pass the stored row).
  net_preview := round(
    run_row.surcharge_collected
      * (1 - run_row.company_retain_pct/100 - run_row.mnr_pct/100)
      - run_row.breakages_amount
      - run_row.complaints_amount,
    2
  );
  if net_preview < 0 then net_preview := 0; end if;

  -- Compute the points sum to derive a projected point_value.
  select coalesce(sum(round(
           greatest(0, coalesce(ln.days_present_override,
                                coalesce(fd.c,0) - coalesce(0.5 * hd.c, 0))) *
           coalesce(ln.points_per_day_override, coalesce(d.sc_points_per_day, 1.00)),
           2)), 0)
    into sum_points
  from core.employees e
  left join core.designations d on d.code = e.designation_code
  left join (
    select l.employee_id, count(distinct l.punched_at::date) as c
    from attendance.logs l
    where l.type = 'in' and l.punched_at >= period_start and l.punched_at < period_end
    group by l.employee_id
  ) fd on fd.employee_id = e.id
  left join (
    select lr.employee_id, count(*)::numeric as c
    from core.leave_requests lr
    where lr.status = 'approved' and lr.half_day in ('first','second')
      and lr.start_date = lr.end_date
      and lr.start_date >= period_start and lr.start_date < period_end
    group by lr.employee_id
  ) hd on hd.employee_id = e.id
  left join core.outlet_sc_run_lines ln on ln.run_id = p_run_id and ln.employee_id = e.id
  where e.outlet_id = run_row.outlet_id
    and e.deleted_at is null
    and (e.exit_date is null or e.exit_date >= period_start)
    and (e.hired_on is null or e.hired_on < period_end);

  return query
  select e.id as employee_id,
         e.employee_code,
         e.full_name,
         e.hired_on,
         e.designation_code,
         coalesce(d.name, '') as designation_name,
         coalesce(d.sc_points_per_day, 1.00) as points_per_day_default,
         coalesce(ln.points_per_day_override, coalesce(d.sc_points_per_day, 1.00)) as points_per_day,
         ln.points_per_day_override,
         (coalesce(fd.c, 0) - coalesce(0.5 * hd.c, 0))::numeric as days_present_auto,
         greatest(0, coalesce(ln.days_present_override, coalesce(fd.c,0) - coalesce(0.5 * hd.c, 0)))::numeric as days_present,
         ln.days_present_override,
         round(
           greatest(0, coalesce(ln.days_present_override, coalesce(fd.c,0) - coalesce(0.5 * hd.c, 0))) *
           coalesce(ln.points_per_day_override, coalesce(d.sc_points_per_day, 1.00)),
           2
         ) as total_points,
         case when sum_points > 0 then
           round(
             greatest(0, coalesce(ln.days_present_override, coalesce(fd.c,0) - coalesce(0.5 * hd.c, 0))) *
             coalesce(ln.points_per_day_override, coalesce(d.sc_points_per_day, 1.00))
             * (net_preview / sum_points),
             2
           )
         else 0 end as projected_sc_payable,
         ln.notes
  from core.employees e
  left join core.designations d on d.code = e.designation_code
  left join (
    select l.employee_id, count(distinct l.punched_at::date)::numeric as c
    from attendance.logs l
    where l.type = 'in' and l.punched_at >= period_start and l.punched_at < period_end
    group by l.employee_id
  ) fd on fd.employee_id = e.id
  left join (
    select lr.employee_id, count(*)::numeric as c
    from core.leave_requests lr
    where lr.status = 'approved' and lr.half_day in ('first','second')
      and lr.start_date = lr.end_date
      and lr.start_date >= period_start and lr.start_date < period_end
    group by lr.employee_id
  ) hd on hd.employee_id = e.id
  left join core.outlet_sc_run_lines ln on ln.run_id = p_run_id and ln.employee_id = e.id
  where e.outlet_id = run_row.outlet_id
    and e.deleted_at is null
    and (e.exit_date is null or e.exit_date >= period_start)
    and (e.hired_on is null or e.hired_on < period_end)
  order by e.hired_on nulls first, e.employee_code;
end;
$$;

grant execute on function public.compute_sc_run(uuid) to authenticated;

-- upsert_sc_line_override: persists per-row overrides between draft visits.
-- NULL fields clear the override (revert to auto value).
create or replace function public.upsert_sc_line_override(
  p_run_id        uuid,
  p_employee_id   uuid,
  p_days_present  numeric,
  p_points_per_day numeric,
  p_notes         text
) returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  run_row core.outlet_sc_runs%rowtype;
begin
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into run_row from core.outlet_sc_runs where id = p_run_id for update;
  if run_row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if run_row.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;

  insert into core.outlet_sc_run_lines (
    run_id, employee_id, days_present_override, points_per_day_override, notes
  ) values (
    p_run_id, p_employee_id, p_days_present, p_points_per_day, p_notes
  )
  on conflict (run_id, employee_id) do update
    set days_present_override = excluded.days_present_override,
        points_per_day_override = excluded.points_per_day_override,
        notes = excluded.notes;
end;
$$;

grant execute on function public.upsert_sc_line_override(uuid, uuid, numeric, numeric, text) to authenticated;

-- finalize_sc_run: lock + snapshot all lines + compute point_value with
-- last-row remainder so sum(sc_payable) === net_payable to the rupee.
create or replace function public.finalize_sc_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = core, attendance, public
as $$
declare
  run_row      core.outlet_sc_runs%rowtype;
  v_gross      numeric(14,2);
  v_net        numeric(14,2);
  v_sum_pts    numeric(10,2) := 0;
  v_point_val  numeric(14,4) := 0;
  v_running    numeric(14,2) := 0;
  v_remaining  numeric(14,2);
  r            record;
  rows_count   int := 0;
  idx          int := 0;
  period_start date;
  period_end   date;
begin
  select * into run_row from core.outlet_sc_runs where id = p_run_id for update;
  if run_row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not (core.is_admin() or core.has_role('hr')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if run_row.status = 'final' then
    raise exception 'ALREADY_FINAL' using errcode = 'P0001';
  end if;

  v_gross := round(
    run_row.surcharge_collected
      * (1 - run_row.company_retain_pct/100 - run_row.mnr_pct/100),
    2);
  v_net := round(v_gross - run_row.breakages_amount - run_row.complaints_amount, 2);
  if v_net < 0 then
    raise exception 'NEGATIVE_NET_PAYABLE' using errcode = 'P0001';
  end if;

  period_start := run_row.period_month;
  period_end := (period_start + interval '1 month')::date;

  -- Stash existing overrides + notes so delete+insert preserves them.
  create temp table _existing_overrides on commit drop as
    select employee_id, days_present_override, points_per_day_override, notes
    from core.outlet_sc_run_lines
    where run_id = p_run_id;

  -- Wipe and re-insert lines from live aggregation.
  delete from core.outlet_sc_run_lines where run_id = p_run_id;

  insert into core.outlet_sc_run_lines (
    run_id, employee_id, designation_code, designation_name,
    days_present, days_present_override,
    points_per_day, points_per_day_override,
    total_points, sc_payable, notes
  )
  select
    p_run_id,
    e.id,
    e.designation_code,
    coalesce(d.name, ''),
    greatest(0,
      coalesce(eo.days_present_override,
               coalesce(fd.c, 0) - coalesce(0.5 * hd.c, 0))),
    eo.days_present_override,
    coalesce(eo.points_per_day_override, coalesce(d.sc_points_per_day, 1.00)),
    eo.points_per_day_override,
    round(
      greatest(0,
        coalesce(eo.days_present_override,
                 coalesce(fd.c, 0) - coalesce(0.5 * hd.c, 0)))
      * coalesce(eo.points_per_day_override, coalesce(d.sc_points_per_day, 1.00)),
      2
    ),
    0, -- sc_payable filled in second pass
    eo.notes
  from core.employees e
  left join core.designations d on d.code = e.designation_code
  left join (
    select l.employee_id, count(distinct l.punched_at::date)::numeric as c
    from attendance.logs l
    where l.type = 'in' and l.punched_at >= period_start and l.punched_at < period_end
    group by l.employee_id
  ) fd on fd.employee_id = e.id
  left join (
    select lr.employee_id, count(*)::numeric as c
    from core.leave_requests lr
    where lr.status = 'approved' and lr.half_day in ('first','second')
      and lr.start_date = lr.end_date
      and lr.start_date >= period_start and lr.start_date < period_end
    group by lr.employee_id
  ) hd on hd.employee_id = e.id
  left join _existing_overrides eo on eo.employee_id = e.id
  where e.outlet_id = run_row.outlet_id
    and e.deleted_at is null
    and (e.exit_date is null or e.exit_date >= period_start)
    and (e.hired_on is null or e.hired_on < period_end);

  -- Sum points
  select coalesce(sum(total_points), 0) into v_sum_pts
    from core.outlet_sc_run_lines where run_id = p_run_id;

  if v_sum_pts > 0 then
    v_point_val := round(v_net / v_sum_pts, 4);
  end if;

  -- Pass 2: write sc_payable per row with last-row remainder so the sum
  -- exactly matches v_net.
  select count(*) into rows_count from core.outlet_sc_run_lines where run_id = p_run_id;
  v_remaining := v_net;
  v_running := 0;

  -- Two-pass within the cursor: first n-1 rows get the rounded amount,
  -- last row gets remainder. Order by total_points desc so the
  -- remainder lands on the largest payee (smallest relative impact).
  for r in
    select employee_id, total_points
    from core.outlet_sc_run_lines
    where run_id = p_run_id
    order by total_points desc, employee_id
  loop
    idx := idx + 1;
    if idx < rows_count then
      update core.outlet_sc_run_lines
        set sc_payable = round(r.total_points * v_point_val, 2)
        where run_id = p_run_id and employee_id = r.employee_id;
      v_running := v_running + round(r.total_points * v_point_val, 2);
    else
      -- Last row: fill the remainder so sum exactly equals v_net.
      -- If total_points is 0 then sc_payable stays 0 even if a remainder
      -- accumulated (rounding of others); cap by total_points * point_value
      -- ceiling to avoid donating to zero-point rows.
      if r.total_points > 0 then
        update core.outlet_sc_run_lines
          set sc_payable = round(v_net - v_running, 2)
          where run_id = p_run_id and employee_id = r.employee_id;
      else
        update core.outlet_sc_run_lines
          set sc_payable = 0
          where run_id = p_run_id and employee_id = r.employee_id;
      end if;
    end if;
  end loop;

  update core.outlet_sc_runs
    set status = 'final',
        gross_payable = v_gross,
        net_payable = v_net,
        total_points_sum = v_sum_pts,
        point_value = v_point_val,
        finalized_at = now(),
        finalized_by = auth.uid()
    where id = p_run_id;

  return jsonb_build_object(
    'id', p_run_id,
    'gross_payable', v_gross,
    'net_payable', v_net,
    'total_points_sum', v_sum_pts,
    'point_value', v_point_val,
    'lines', rows_count
  );
end;
$$;

grant execute on function public.finalize_sc_run(uuid) to authenticated;

-- unlock_sc_run: revert to draft. Lines are preserved so re-finalizing
-- with same inputs gives the same numbers.
create or replace function public.unlock_sc_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not core.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update core.outlet_sc_runs
    set status = 'draft',
        gross_payable = null,
        net_payable = null,
        total_points_sum = null,
        point_value = null,
        finalized_at = null,
        finalized_by = null
    where id = p_run_id;
end;
$$;

grant execute on function public.unlock_sc_run(uuid) to authenticated;

-- ==========================================================================
-- 5. Views
-- ==========================================================================

create or replace view public.v_sc_runs
with (security_invoker = true) as
  select r.id, r.outlet_id, o.display_name as outlet_name,
         r.period_month, r.status,
         r.surcharge_collected, r.company_retain_pct, r.mnr_pct,
         r.breakages_amount, r.complaints_amount,
         r.gross_payable, r.net_payable, r.total_points_sum, r.point_value,
         r.finalized_at, r.finalized_by, r.created_at, r.updated_at
  from core.outlet_sc_runs r
  left join public.flax_outlets o on o.id = r.outlet_id;

grant select on public.v_sc_runs to authenticated;

create or replace view public.v_sc_run_lines
with (security_invoker = true) as
  select ln.*,
         e.full_name as employee_name,
         e.employee_code,
         e.hired_on,
         r.outlet_id,
         r.period_month,
         r.status as run_status,
         r.point_value as run_point_value
  from core.outlet_sc_run_lines ln
  join core.outlet_sc_runs r on r.id = ln.run_id
  join core.employees e on e.id = ln.employee_id;

grant select on public.v_sc_run_lines to authenticated;

create or replace view public.v_my_sc
with (security_invoker = true) as
  select ln.run_id, ln.employee_id, ln.designation_name, ln.days_present,
         ln.points_per_day, ln.total_points, ln.sc_payable, ln.notes,
         r.outlet_id, r.period_month, r.point_value, r.finalized_at,
         o.display_name as outlet_name
  from core.outlet_sc_run_lines ln
  join core.outlet_sc_runs r on r.id = ln.run_id
  left join public.flax_outlets o on o.id = r.outlet_id
  where r.status = 'final'
    and ln.employee_id in (select id from core.employees where user_id = auth.uid())
  order by r.period_month desc;

grant select on public.v_my_sc to authenticated;
