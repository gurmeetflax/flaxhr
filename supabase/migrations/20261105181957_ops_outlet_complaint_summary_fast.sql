-- Applied directly to the database on 5 Nov 2026; recorded here so the repo
-- matches the migration history.
CREATE OR REPLACE FUNCTION public.ops_outlet_complaint_summary(p_from timestamp with time zone, p_to timestamp with time zone DEFAULT now())
 RETURNS TABLE(outlet_id text, outlet text, total integer, cats jsonb, staff jsonb, managers jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'core'
AS $function$
  with c as (
    select c.id, c.flax_outlet_id oid, replace(c.complaint_type, '_', ' ') cat,
      case when c.provider = 'zomato' and c.order_details ? 'createdAt' then (c.order_details->>'createdAt')::timestamptz else c.complaint_create_date end anchor
    from public.flax_complaints c
    where c.created_at >= p_from and c.created_at < p_to and c.flax_outlet_id is not null
      and c.complaint_type is not null),
  -- punches only for the window (the shared view scans every complaint ever, ~100s)
  iv as (
    select i.employee_id, e.employee_code, e.full_name nm,
      case i.outlet_id when 'indiranagar_flax_cafe' then 'indiranagar' when 'lp' then 'lower_parel' else i.outlet_id end oid,
      i.punched_at in_at,
      coalesce((select min(x.punched_at) from attendance.logs x where x.employee_id = i.employee_id and x.type = 'out'
                and x.punched_at > i.punched_at and x.punched_at <= i.punched_at + interval '16 hours'), i.punched_at + interval '16 hours') out_at
    from attendance.logs i join core.employees e on e.id = i.employee_id
    where i.type = 'in' and i.punched_at >= p_from - interval '3 days' and i.punched_at < p_to),
  duty as (select distinct c.id, c.oid, iv.employee_code, iv.nm
           from c join iv on iv.oid = c.oid and c.anchor between iv.in_at and iv.out_at),
  cat as (select oid, cat, count(*)::int n from c group by 1, 2),
  st as (select d.oid, d.nm, ve.designation_name rl, count(*)::int n
         from duty d left join public.v_employees ve on ve.employee_code = d.employee_code group by 1, 2, 3),
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
$function$;
