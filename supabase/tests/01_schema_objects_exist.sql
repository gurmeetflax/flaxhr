-- Smoke test: every object the frontend depends on must exist in the DB.
-- Run after every supabase db push. Failure aborts the CI job.

do $$
declare
  t text;
  missing text[] := array[]::text[];
begin
  -- Tables
  for t in select unnest(array[
    'core.employees',
    'core.shifts',
    'core.employee_shifts',
    'core.roster_entries',
    'core.leave_types',
    'core.leave_balances',
    'core.leave_requests',
    'attendance.logs',
    'attendance.regularisations',
    'public.flax_outlets',
    'core.notifications',
    'core.notification_prefs',
    'core.gift_codes',
    'core.birthday_log',
    'core.uniforms',
    'core.warnings',
    'core.employee_documents'
  ]) loop
    if to_regclass(t) is null then
      missing := missing || t;
    end if;
  end loop;

  -- Views (in public)
  for t in select unnest(array[
    'public.v_employees',
    'public.v_my_employee',
    'public.v_my_roles',
    'public.v_my_outlet',
    'public.v_my_today_punches',
    'public.v_today_punches',
    'public.v_daily_attendance',
    'public.v_attendance_report',
    'public.v_employee_leave_summary',
    'public.v_employee_snapshot',
    'public.v_attendance',
    'public.v_regularisations',
    'public.v_today_shift',
    'public.v_my_today_shift',
    'public.v_employee_shifts',
    'public.v_roster',
    'public.v_my_roster',
    'public.v_leave_requests',
    'public.v_my_leave_balances',
    'public.v_my_notifications',
    'public.v_my_notification_prefs',
    'public.v_birthday_today',
    'public.v_gift_codes_stats'
  ]) loop
    if to_regclass(t) is null then
      missing := missing || t;
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception 'Missing schema objects: %', array_to_string(missing, ', ');
  end if;

  raise notice 'OK — all expected tables and views present';
end $$;

-- RPCs the frontend calls
do $$
declare
  fn text;
  missing text[] := array[]::text[];
begin
  for fn in select unnest(array[
    'public.punch(text,numeric,numeric,text,text)',
    'public.submit_regularisation(timestamptz,text,text,text,text)',
    'public.decide_regularisation(uuid,text,text)',
    'public.submit_leave_request(uuid,date,date,text,text)',
    'public.decide_leave_request(uuid,text,text)',
    'public.mark_notification_read(uuid)',
    'public.mark_all_notifications_read()',
    'public.upsert_my_notification_prefs(boolean,boolean,text[])',
    'public.run_birthdays_today()',
    'public.set_kyc_document(text,text)',
    'public.verify_kyc(uuid,text,text)',
    'public.signed_kyc_url(uuid,text,integer)'
  ]) loop
    if to_regprocedure(fn) is null then
      missing := missing || fn;
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception 'Missing RPC functions: %', array_to_string(missing, E'\n  ');
  end if;

  raise notice 'OK — all expected RPCs present';
end $$;

-- Trivial view-readability check: every public view should at least answer
-- a `select … limit 0` without error (catches drop-without-recreate).
do $$
declare
  v text;
begin
  for v in
    select schemaname || '.' || viewname
    from pg_views
    where schemaname = 'public'
      and viewname like 'v\\_%' escape '\\'
  loop
    execute format('select 1 from %s limit 0', v);
  end loop;

  raise notice 'OK — every public.v_* view responds';
end $$;
