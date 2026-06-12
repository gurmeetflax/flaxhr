-- Flax HR — Migration 044: Statutory deduction flags (PF / PT / ESIC)
--
-- Per-employee booleans + default rates in app_settings. The payroll
-- compute RPC reads them and appends statutory lines to the
-- deductions_breakdown alongside the ledger entries.

alter table core.employees
  add column if not exists pf_enabled   boolean not null default false,
  add column if not exists pt_enabled   boolean not null default false,
  add column if not exists esic_enabled boolean not null default false;

insert into core.app_settings (key, value)
  values ('pf_rate_pct',   '12'::jsonb),
         ('pt_amount',     '200'::jsonb),
         ('esic_rate_pct', '0.75'::jsonb),
         ('esic_max_gross','21000'::jsonb)
  on conflict (key) do nothing;

-- Refresh views to expose the new flags.
drop view if exists public.v_employees;
create view public.v_employees with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id,
         e.first_name, e.last_name, e.full_name,
         e.personal_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.created_at, e.updated_at,
         e.monthly_salary, e.exit_date, e.exit_reason,
         e.designation_code,
         e.date_of_birth, e.address,
         e.emergency_contact_name, e.emergency_contact_phone,
         e.home_lat, e.home_lng,
         e.aadhaar_last4, e.pan_last4,
         e.kyc_status, e.kyc_verified_at, e.kyc_verified_by, e.kyc_notes,
         e.selfie_required,
         e.pf_enabled, e.pt_enabled, e.esic_enabled,
         o.display_name as outlet_name,
         o.city as outlet_city
    from core.employees e
    left join public.flax_outlets o on o.id = e.outlet_id
   where e.deleted_at is null;
grant select on public.v_employees to authenticated;

drop view if exists public.v_my_employee;
create view public.v_my_employee with (security_invoker = true) as
  select e.id, e.employee_code, e.user_id,
         e.first_name, e.last_name, e.full_name,
         e.personal_email, e.phone, e.outlet_id, e.is_active,
         e.hired_on, e.monthly_salary,
         e.date_of_birth, e.address,
         e.emergency_contact_name, e.emergency_contact_phone,
         e.home_lat, e.home_lng,
         e.aadhaar_last4, e.pan_last4,
         e.aadhaar_doc_path, e.pan_doc_path,
         e.kyc_status, e.kyc_verified_at, e.kyc_notes,
         e.selfie_required,
         e.pf_enabled, e.pt_enabled, e.esic_enabled
    from core.employees e
   where e.user_id = auth.uid() and e.deleted_at is null;
grant select on public.v_my_employee to authenticated;

-- Extend compute_payroll_run to honour the statutory flags.
create or replace function public.compute_payroll_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = core, attendance, public as $$
declare r core.payroll_runs%rowtype; period_start date; period_end date; dim integer;
  emp record; ded record; ded_total numeric(12,2); ded_breakdown jsonb;
  days_present numeric(6,2); days_leave numeric(6,2); days_payable numeric(6,2);
  prorated numeric(12,2); net numeric(12,2);
  pf_rate numeric; pt_amt numeric; esic_rate numeric; esic_max numeric;
  pf_amt numeric; esic_amt numeric;
begin
  if not (core.is_admin() or core.has_role('hr')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into r from core.payroll_runs where id = p_run_id;
  if r.id is null then raise exception 'RUN_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.status <> 'draft' then raise exception 'RUN_LOCKED' using errcode = 'P0001'; end if;
  period_start := date_trunc('month', r.period_month)::date;
  period_end := (period_start + interval '1 month - 1 day')::date;
  dim := extract(day from period_end)::int;

  pf_rate   := coalesce((core.get_app_setting('pf_rate_pct'))::numeric, 12);
  pt_amt    := coalesce((core.get_app_setting('pt_amount'))::numeric, 200);
  esic_rate := coalesce((core.get_app_setting('esic_rate_pct'))::numeric, 0.75);
  esic_max  := coalesce((core.get_app_setting('esic_max_gross'))::numeric, 21000);

  delete from core.payroll_run_lines where run_id = r.id;
  for emp in select e.id, e.employee_code, e.full_name, e.monthly_salary,
              e.pf_enabled, e.pt_enabled, e.esic_enabled
      from core.employees e
     where e.deleted_at is null and e.outlet_id = r.outlet_id
       and (e.hired_on is null or e.hired_on <= period_end)
       and (e.exit_date is null or e.exit_date >= period_start)
       and coalesce(e.monthly_salary, 0) > 0
  loop
    select count(distinct (l.punched_at at time zone 'Asia/Kolkata')::date) into days_present
      from attendance.logs l
     where l.employee_id = emp.id and l.type = 'in'
       and (l.punched_at at time zone 'Asia/Kolkata')::date between period_start and period_end;
    select coalesce(sum(least(coalesce(lr.end_date,period_end),period_end) -
              greatest(coalesce(lr.start_date,period_start),period_start) + 1),0) into days_leave
      from core.leave_requests lr
      join core.leave_types lt on lt.id = lr.leave_type_id
     where lr.employee_id = emp.id and lr.status = 'approved' and coalesce(lt.is_paid, true)
       and lr.start_date <= period_end and lr.end_date >= period_start;
    days_leave := coalesce(days_leave, 0);
    days_payable := least(days_present + days_leave, dim);
    prorated := round(emp.monthly_salary * days_payable / dim, 2);

    ded_total := 0; ded_breakdown := '[]'::jsonb;

    -- Ledger deductions (uniform / advance / other).
    for ded in select id, kind, monthly_amount, months_remaining, total_amount, notes
        from core.deductions where employee_id = emp.id and is_active and months_remaining > 0
        order by created_at
    loop
      ded_total := ded_total + ded.monthly_amount;
      ded_breakdown := ded_breakdown || jsonb_build_object(
        'id', ded.id, 'kind', ded.kind, 'amount', ded.monthly_amount,
        'months_remaining', ded.months_remaining, 'notes', ded.notes);
    end loop;

    -- Statutory deductions.
    if emp.pf_enabled then
      pf_amt := round(prorated * pf_rate / 100.0, 2);
      ded_total := ded_total + pf_amt;
      ded_breakdown := ded_breakdown || jsonb_build_object(
        'kind', 'pf', 'amount', pf_amt, 'rate_pct', pf_rate, 'notes', 'Provident Fund');
    end if;
    if emp.esic_enabled then
      if emp.monthly_salary <= esic_max then
        esic_amt := round(prorated * esic_rate / 100.0, 2);
        ded_total := ded_total + esic_amt;
        ded_breakdown := ded_breakdown || jsonb_build_object(
          'kind', 'esic', 'amount', esic_amt, 'rate_pct', esic_rate, 'notes', 'ESIC');
      end if;
    end if;
    if emp.pt_enabled then
      ded_total := ded_total + pt_amt;
      ded_breakdown := ded_breakdown || jsonb_build_object(
        'kind', 'pt', 'amount', pt_amt, 'notes', 'Professional Tax');
    end if;

    net := greatest(prorated - ded_total, 0);
    insert into core.payroll_run_lines (run_id, employee_id, gross, days_in_month,
      days_present, days_paid_leave, days_payable, prorated_gross, deductions_total,
      deductions_breakdown, net_pay)
    values (r.id, emp.id, emp.monthly_salary, dim, days_present, days_leave, days_payable,
      prorated, ded_total, ded_breakdown, net);
  end loop;
end; $$;
grant execute on function public.compute_payroll_run(uuid) to authenticated;

notify pgrst, 'reload schema';
