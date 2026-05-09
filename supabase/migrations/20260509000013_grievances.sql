-- Flax HR — Migration 040: Grievances (sensitive, HR-only)
create table if not exists core.grievances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references core.employees(id) on delete set null,
  is_anonymous boolean not null default false,
  category text not null check (category in (
    'harassment','abuse','discrimination','bullying','retaliation',
    'wage_dispute','safety','workload','manager_misconduct',
    'whistleblower','favouritism','other'
  )),
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  subject text not null check (length(trim(subject)) > 0),
  description text not null check (length(trim(description)) > 0),
  status text not null default 'open' check (status in ('open','under_review','resolved','dismissed')),
  hr_notes text,
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grievances_emp_idx on core.grievances (employee_id, created_at desc);
create index if not exists grievances_open_idx on core.grievances (status, severity, created_at desc) where status in ('open','under_review');

drop trigger if exists trg_grievances_updated_at on core.grievances;
create trigger trg_grievances_updated_at before update on core.grievances
  for each row execute function core.set_updated_at();
drop trigger if exists trg_grievances_audit on core.grievances;
create trigger trg_grievances_audit after insert or update or delete on core.grievances
  for each row execute function core.log_audit();

alter table core.grievances enable row level security;

-- Sensitive: managers do NOT get access. Only admin/HR + the submitter
-- (when not anonymous). Auditors can read for compliance.
drop policy if exists grievances_admin_hr_all on core.grievances;
create policy grievances_admin_hr_all on core.grievances for all
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));

drop policy if exists grievances_self_select on core.grievances;
create policy grievances_self_select on core.grievances for select
  using (
    employee_id is not null
    and employee_id in (select id from core.employees where user_id = auth.uid())
  );

drop policy if exists grievances_auditor_select on core.grievances;
create policy grievances_auditor_select on core.grievances for select using (core.has_role('auditor'));

-- (Body of submit_grievance / update_grievance_status / views identical
--  to the applied migration — see source-of-truth in repo.)
create or replace function public.submit_grievance(
  p_category text, p_subject text, p_description text,
  p_severity text default 'medium', p_anonymous boolean default false
) returns uuid language plpgsql security definer set search_path = core, public as $$
declare v_emp uuid; v_id uuid;
begin
  if p_category not in ('harassment','abuse','discrimination','bullying','retaliation',
       'wage_dispute','safety','workload','manager_misconduct','whistleblower','favouritism','other') then
    raise exception 'INVALID_CATEGORY' using errcode='P0001';
  end if;
  if p_severity not in ('low','medium','high') then raise exception 'INVALID_SEVERITY' using errcode='P0001'; end if;
  if p_subject is null or length(trim(p_subject))=0 then raise exception 'EMPTY_SUBJECT' using errcode='P0001'; end if;
  if p_description is null or length(trim(p_description))=0 then raise exception 'EMPTY_DESCRIPTION' using errcode='P0001'; end if;
  select id into v_emp from core.employees where user_id=auth.uid() limit 1;
  if v_emp is null then raise exception 'NO_EMPLOYEE' using errcode='P0001'; end if;
  insert into core.grievances (employee_id, is_anonymous, category, severity, subject, description)
  values (case when p_anonymous then null else v_emp end,
          coalesce(p_anonymous, false), p_category, p_severity,
          trim(p_subject), trim(p_description))
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.submit_grievance(text, text, text, text, boolean) to authenticated;

create or replace function public.update_grievance_status(
  p_id uuid, p_status text, p_hr_notes text default null, p_resolution text default null
) returns void language plpgsql security definer set search_path = core, public as $$
begin
  if not (core.is_admin() or core.has_role('hr')) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  if p_status not in ('open','under_review','resolved','dismissed') then raise exception 'INVALID_STATUS' using errcode='P0001'; end if;
  update core.grievances
     set status=p_status, hr_notes=coalesce(p_hr_notes, hr_notes),
         resolution=coalesce(p_resolution, resolution),
         resolved_by=case when p_status in ('resolved','dismissed') then auth.uid() else resolved_by end,
         resolved_at=case when p_status in ('resolved','dismissed') then now() else resolved_at end
   where id=p_id;
end; $$;
grant execute on function public.update_grievance_status(uuid, text, text, text) to authenticated;

create or replace view public.v_my_grievances with (security_invoker = true) as
  select g.id, g.category, g.severity, g.subject, g.description, g.status,
         g.resolution, g.created_at, g.resolved_at
    from core.grievances g
   where g.employee_id is not null
     and g.employee_id in (select id from core.employees where user_id=auth.uid())
   order by g.created_at desc;
grant select on public.v_my_grievances to authenticated;

create or replace view public.v_grievances with (security_invoker = true) as
  select g.id, g.employee_id, g.is_anonymous, g.category, g.severity, g.subject,
         g.description, g.status, g.hr_notes, g.resolution,
         g.resolved_by, g.resolved_at, g.created_at, g.updated_at,
         case when g.is_anonymous then null else e.employee_code end as employee_code,
         case when g.is_anonymous then 'Anonymous' else e.full_name end as full_name,
         e.outlet_id, o.display_name as outlet_name
    from core.grievances g
    left join core.employees e on e.id = g.employee_id
    left join public.flax_outlets o on o.id = e.outlet_id
   order by g.created_at desc;
grant select on public.v_grievances to authenticated;

notify pgrst, 'reload schema';
