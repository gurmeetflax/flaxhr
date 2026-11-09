-- Applied directly to the database on 5 Nov 2026; recorded here so the repo
-- matches the migration history. Superseded by 20261105181957.
create or replace function public.ops_outlet_complaint_summary(p_from timestamptz, p_to timestamptz default now())
returns table (outlet_id text, outlet text, total int, cats jsonb, staff jsonb, managers jsonb)
language sql stable security definer set search_path = public, core as $$
  with c as (
    select c.id, c.flax_outlet_id oid, replace(c.complaint_type, '_', ' ') cat
    from public.flax_complaints c
    where c.created_at >= p_from and c.created_at < p_to and c.flax_outlet_id is not null),
  cat as (select oid, cat, count(*)::int n from c group by 1, 2),
  st as (select c.oid, d.employee_name nm, d.designation_name rl, count(*)::int n
         from c join public.v_complaint_on_duty d on d.complaint_id = c.id group by 1, 2, 3),
  mg as (select e.outlet_id oid, e.full_name nm, e.phone
         from core.employees e join core.designations d on d.code = e.designation_code
         where e.deleted_at is null and e.is_active and e.exit_date is null
           and d.name in ('Manager', 'Restaurant Manager') and e.phone is not null)
  select o.oid, coalesce(fo.display_name, o.oid), (select count(*)::int from c where c.oid = o.oid),
    coalesce((select jsonb_agg(jsonb_build_object('cat', cat, 'n', n) order by n desc, cat) from cat where cat.oid = o.oid), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object('name', nm, 'role', rl, 'n', n) order by n desc, nm) from st where st.oid = o.oid), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object('name', nm, 'phone', phone)) from mg where mg.oid = o.oid), '[]')
  from (select distinct oid from c) o left join public.flax_outlets fo on fo.id = o.oid
  order by 3 desc;
$$;
revoke all on function public.ops_outlet_complaint_summary(timestamptz, timestamptz) from public, anon, authenticated;
