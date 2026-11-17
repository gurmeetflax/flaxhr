-- Training: team viewers, a leadership hierarchy with photos.
--
--  * training.viewers: employees who may see everyone's training status
--    (read-only) without being admin / HR. Rahul Shivtare (FLAX0077,
--    Operations Manager) and Vivian Rego (FLAX0226, Operation Head) are
--    added. The read functions (overview, employee detail, outlet scores,
--    awards, leaderboard) now accept admins, HR or viewers.
--  * training.leaders: the hierarchy shown in "Your leaders":
--      level 1 = company leadership (everyone sees them)
--      level 2 = regional / functional heads, shown to people in that
--                region (city) or to everyone when region is empty
--      then the leads at the employee's own outlet (automatic)
--    Seeded from today's heads, with Sonali Sengupta as Restaurant Manager,
--    Bangalore.
--  * training.people_media: a headshot per employee (admins upload).

create table if not exists training.viewers (
  employee_id uuid primary key references core.employees(id) on delete cascade,
  added_at    timestamptz not null default now()
);
alter table training.viewers enable row level security;

create table if not exists training.leaders (
  employee_id uuid primary key references core.employees(id) on delete cascade,
  title       text not null,
  level       smallint not null default 1 check (level in (1, 2)),
  region      text,          -- city key (mumbai / bangalore / goa); null = everyone
  sort_order  integer not null default 0
);
alter table training.leaders enable row level security;

create table if not exists training.people_media (
  employee_id uuid primary key references core.employees(id) on delete cascade,
  photo_url   text,
  updated_at  timestamptz not null default now()
);
alter table training.people_media enable row level security;

create or replace function training.can_view_all()
returns boolean language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  select training.is_admin() or exists (select 1 from training.viewers v where v.employee_id = training.me())
$$;

create or replace function training.require_viewer()
returns void language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
begin
  if not training.can_view_all() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.training_can_view_all()
returns boolean language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  select training.can_view_all()
$$;

-- Read-only functions: admin / HR or a viewer.
do $$
declare f text; d text;
begin
  foreach f in array array['training_admin_overview()', 'training_employee_detail(uuid)', 'training_outlet_scores()',
                           'training_awards(date)', 'training_admin_leaderboard()']
  loop
    d := pg_get_functiondef(('public.' || f)::regprocedure);
    if position('training.require_admin();' in d) = 0 then
      raise exception 'expected require_admin in %', f;
    end if;
    execute replace(d, 'training.require_admin();', 'training.require_viewer();');
  end loop;
end $$;

-- Seed viewers.
insert into training.viewers (employee_id)
select id from core.employees where employee_code in ('FLAX0077', 'FLAX0226') and deleted_at is null
on conflict do nothing;

-- Seed the hierarchy.
insert into training.leaders (employee_id, title, level, region, sort_order)
select e.id, x.title, x.level, x.region, x.sort_order
from (values
  ('FLAX0226', 'Operation Head', 1, null::text, 1),
  ('FLAX0077', 'Operations Manager', 1, null, 2),
  ('FLAX0220', 'HR Manager', 1, null, 3),
  ('FLAX0157', 'HR Executive', 1, null, 4),
  ('FLAX0159', 'Area Manager, Mumbai', 2, 'mumbai', 1),
  ('FLAX0078', 'Kitchen Manager, Central Kitchen', 2, 'mumbai', 2),
  ('FLAX0108', 'Bakery Head', 2, 'mumbai', 3),
  ('FLAX0186', 'Restaurant Manager, Bangalore', 2, 'bangalore', 1),
  ('FLAX0188', 'Head Chef, Bangalore', 2, 'bangalore', 2)
) x(code, title, level, region, sort_order)
join core.employees e on e.employee_code = x.code and e.deleted_at is null
on conflict (employee_id) do nothing;

-- "Your leaders" for the signed-in employee: leadership, their region,
-- their outlet's leads. Names, titles and photos only.
create or replace function public.training_team_for_me()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare v_outlet text; v_city text; v_me uuid := training.me();
begin
  select e.outlet_id, lower(o.city) into v_outlet, v_city
  from core.employees e left join public.flax_outlets o on o.id = e.outlet_id where e.id = v_me;
  return jsonb_build_object(
    'outlet', (select coalesce(display_name, name) from public.flax_outlets where id = v_outlet),
    'region', v_city,
    'leadership', (select coalesce(jsonb_agg(jsonb_build_object('name', e.full_name, 'role', l.title, 'photo_url', pm.photo_url)
                     order by l.sort_order, e.full_name), '[]'::jsonb)
                   from training.leaders l join core.employees e on e.id = l.employee_id and e.is_active and e.deleted_at is null
                   left join training.people_media pm on pm.employee_id = e.id
                   where l.level = 1),
    'regional', (select coalesce(jsonb_agg(jsonb_build_object('name', e.full_name, 'role', l.title, 'photo_url', pm.photo_url)
                   order by l.sort_order, e.full_name), '[]'::jsonb)
                 from training.leaders l join core.employees e on e.id = l.employee_id and e.is_active and e.deleted_at is null
                 left join training.people_media pm on pm.employee_id = e.id
                 where l.level = 2 and (l.region is null or l.region = v_city)),
    'outlet_leads', (select coalesce(jsonb_agg(jsonb_build_object('name', e.full_name, 'role', d.name, 'photo_url', pm.photo_url)
                       order by d.display_order, e.full_name), '[]'::jsonb)
                     from core.employees e join core.designations d on d.code = e.designation_code
                     left join training.people_media pm on pm.employee_id = e.id
                     where e.outlet_id = v_outlet and e.is_active and e.deleted_at is null and d.is_lead
                       and e.id is distinct from v_me
                       and not exists (select 1 from training.leaders l where l.employee_id = e.id)));
end $$;

-- Admin: the hierarchy and everyone's photos.
create or replace function public.training_admin_people()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
begin
  perform training.require_admin();
  return jsonb_build_object(
    'leaders', (select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id, 'name', e.full_name, 'employee_code', e.employee_code,
                  'title', l.title, 'level', l.level, 'region', l.region, 'sort_order', l.sort_order, 'photo_url', pm.photo_url)
                  order by l.level, l.region nulls first, l.sort_order, e.full_name), '[]'::jsonb)
                from training.leaders l join core.employees e on e.id = l.employee_id
                left join training.people_media pm on pm.employee_id = e.id),
    'outlet_leads', (select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id, 'name', e.full_name, 'employee_code', e.employee_code,
                       'role', d.name, 'outlet', coalesce(o.display_name, o.name), 'photo_url', pm.photo_url)
                       order by coalesce(o.display_name, o.name), d.display_order, e.full_name), '[]'::jsonb)
                     from core.employees e join core.designations d on d.code = e.designation_code and d.is_lead
                     left join public.flax_outlets o on o.id = e.outlet_id
                     left join training.people_media pm on pm.employee_id = e.id
                     where e.is_active and e.deleted_at is null
                       and not exists (select 1 from training.leaders l where l.employee_id = e.id)),
    'viewers', (select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id, 'name', e.full_name, 'employee_code', e.employee_code)
                  order by e.full_name), '[]'::jsonb)
                from training.viewers v join core.employees e on e.id = v.employee_id));
end $$;

create or replace function public.training_save_leader(p_employee uuid, p_title text, p_level int, p_region text, p_sort int default 0)
returns void language plpgsql security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  insert into training.leaders (employee_id, title, level, region, sort_order)
  values (p_employee, p_title, p_level, nullif(lower(p_region), ''), coalesce(p_sort, 0))
  on conflict (employee_id) do update set title = excluded.title, level = excluded.level,
    region = excluded.region, sort_order = excluded.sort_order;
end $$;

create or replace function public.training_remove_leader(p_employee uuid)
returns void language plpgsql security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  delete from training.leaders where employee_id = p_employee;
end $$;

create or replace function public.training_save_person_photo(p_employee uuid, p_photo_url text)
returns void language plpgsql security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  insert into training.people_media (employee_id, photo_url) values (p_employee, nullif(p_photo_url, ''))
  on conflict (employee_id) do update set photo_url = excluded.photo_url, updated_at = now();
end $$;

create or replace function public.training_set_viewer(p_employee uuid, p_on boolean)
returns void language plpgsql security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  if p_on then
    insert into training.viewers (employee_id) values (p_employee) on conflict do nothing;
  else
    delete from training.viewers where employee_id = p_employee;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['training_can_view_all()', 'training_team_for_me()', 'training_admin_people()',
                           'training_save_leader(uuid, text, int, text, int)', 'training_remove_leader(uuid)',
                           'training_save_person_photo(uuid, text)', 'training_set_viewer(uuid, boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
