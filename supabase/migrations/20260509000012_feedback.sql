-- Flax HR — Migration 039: feedback + HR WhatsApp setting
create table if not exists core.feedback (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references core.employees(id) on delete cascade,
  category text not null check (category in ('company','hr','operations')),
  message text not null check (length(trim(message)) > 0),
  status text not null default 'open' check (status in ('open','reviewed','closed')),
  response text,
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists feedback_emp_idx on core.feedback (employee_id, created_at desc);
create index if not exists feedback_open_idx on core.feedback (status, created_at desc) where status='open';
drop trigger if exists trg_feedback_audit on core.feedback;
create trigger trg_feedback_audit after insert or update or delete on core.feedback
  for each row execute function core.log_audit();
alter table core.feedback enable row level security;
drop policy if exists feedback_admin_hr_all on core.feedback;
create policy feedback_admin_hr_all on core.feedback for all
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));
drop policy if exists feedback_self_insert on core.feedback;
create policy feedback_self_insert on core.feedback for insert
  with check (employee_id in (select id from core.employees where user_id=auth.uid()));
drop policy if exists feedback_self_select on core.feedback;
create policy feedback_self_select on core.feedback for select
  using (employee_id in (select id from core.employees where user_id=auth.uid()));
drop policy if exists feedback_auditor_select on core.feedback;
create policy feedback_auditor_select on core.feedback for select using (core.has_role('auditor'));

create or replace view public.v_my_feedback with (security_invoker = true) as
  select f.id, f.category, f.message, f.status, f.response, f.responded_at, f.created_at
    from core.feedback f
   where f.employee_id in (select id from core.employees where user_id=auth.uid())
   order by f.created_at desc;
grant select on public.v_my_feedback to authenticated;

create or replace view public.v_feedback with (security_invoker = true) as
  select f.id, f.employee_id, f.category, f.message, f.status, f.response,
         f.responded_by, f.responded_at, f.created_at,
         e.employee_code, e.full_name, e.outlet_id, o.display_name as outlet_name
    from core.feedback f
    join core.employees e on e.id=f.employee_id
    left join public.flax_outlets o on o.id=e.outlet_id
   order by f.created_at desc;
grant select on public.v_feedback to authenticated;

create or replace function public.submit_feedback(p_category text, p_message text)
returns uuid language plpgsql security definer set search_path = core, public as $$
declare v_emp uuid; v_id uuid;
begin
  if p_category not in ('company','hr','operations') then raise exception 'INVALID_CATEGORY' using errcode='P0001'; end if;
  if p_message is null or length(trim(p_message))=0 then raise exception 'EMPTY_MESSAGE' using errcode='P0001'; end if;
  select id into v_emp from core.employees where user_id=auth.uid() limit 1;
  if v_emp is null then raise exception 'NO_EMPLOYEE' using errcode='P0001'; end if;
  insert into core.feedback (employee_id, category, message)
    values (v_emp, p_category, trim(p_message)) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.submit_feedback(text, text) to authenticated;

insert into core.app_settings (key, value)
  values ('hr_whatsapp_number', '""'::jsonb),
         ('hr_whatsapp_default_message', '"Hi HR, "'::jsonb)
  on conflict (key) do nothing;

notify pgrst, 'reload schema';
