-- Payroll: no finalising an empty run, and a way back out of one.
--
-- Andheri West's October run was finalised four seconds after it was
-- created, before Recompute ever filled it, which locked the outlet's
-- only run for the month. Finalise now refuses a run with no lines, and
-- public.reopen_payroll_run() sets a finalised run back to draft as long
-- as it has no lines (so no deductions were taken and no payslips went
-- out). The October run is reopened here.

create or replace function public.finalise_payroll_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path to 'core', 'public'
as $function$
declare r core.payroll_runs%rowtype; ln record; d record;
begin
  if not (core.is_admin() or core.has_role('hr')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into r from core.payroll_runs where id = p_run_id for update;
  if r.id is null then raise exception 'RUN_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.status = 'finalised' then return; end if;
  if not exists (select 1 from core.payroll_run_lines where run_id = r.id) then
    raise exception 'RUN_EMPTY: Recompute first — this run has no lines.' using errcode = 'P0001';
  end if;
  for ln in select employee_id, deductions_breakdown from core.payroll_run_lines where run_id = r.id loop
    for d in select (elem->>'id')::uuid as id from jsonb_array_elements(ln.deductions_breakdown) elem loop
      update core.deductions
         set months_remaining = greatest(months_remaining - 1, 0),
             is_active = case when months_remaining - 1 <= 0 then false else is_active end
       where id = d.id and months_remaining > 0;
    end loop;
    perform core.notify(ln.employee_id, 'payroll_finalised', 'Payslip available',
      'Your payslip for ' || to_char(r.period_month, 'Mon YYYY') || ' is ready in /me/payslips.',
      jsonb_build_object('run_id', r.id, 'period_month', r.period_month));
  end loop;
  update core.payroll_runs set status = 'finalised', finalised_by = auth.uid(),
    finalised_at = now() where id = r.id;
end; $function$;

create or replace function public.reopen_payroll_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path to 'core', 'public'
as $function$
declare r core.payroll_runs%rowtype;
begin
  if not core.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into r from core.payroll_runs where id = p_run_id for update;
  if r.id is null then raise exception 'RUN_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.status <> 'finalised' then return; end if;
  if exists (select 1 from core.payroll_run_lines where run_id = r.id) then
    raise exception 'PAYSLIPS_SENT: this run has payslips; it cannot be reopened.' using errcode = 'P0001';
  end if;
  update core.payroll_runs set status = 'draft', finalised_by = null, finalised_at = null,
    notes = trim(coalesce(notes, '') || ' Reopened ' || to_char(now() at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'))
   where id = r.id;
end; $function$;

revoke all on function public.reopen_payroll_run(uuid) from public, anon;
grant execute on function public.reopen_payroll_run(uuid) to authenticated;

-- Andheri West, October 2026: finalised empty on 13 Oct.
update core.payroll_runs set status = 'draft', finalised_by = null, finalised_at = null,
       notes = 'Reopened: finalised empty on 13 Oct'
 where id = '7a111934-1690-445b-8ef2-7f9b7c85aa95' and status = 'finalised'
   and not exists (select 1 from core.payroll_run_lines where run_id = '7a111934-1690-445b-8ef2-7f9b7c85aa95');

notify pgrst, 'reload schema';
