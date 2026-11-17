-- Training: pictures and game elements.
--
--  * training-media storage bucket (public read; only admin / HR upload) for
--    slide photos, lesson images and outlet photos.
--  * Two lesson types that fill themselves in:
--      team     the leads at the employee's own outlet + company leaders
--      outlets  every active outlet with its photo, address and map link
--  * Points, levels, badges and leaderboards (all computed, nothing stored):
--      points per passed module = best score (0-100)
--                                 + 50 if passed on the first try
--                                 + 25 if passed by the due date
--      levels: Starter 0, Learner 200, Pro 500, Champion 1000
--  * Welcome to Flax gets icons on its slides plus "Our outlets" and
--    "Your leaders" lessons.
--  * Automatic assignment: the starter paths are switched on and modules
--    are put on paths from the module editor (no manual assigning).

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public)
values ('training-media', 'training-media', true)
on conflict (id) do update set public = true;

drop policy if exists "training_media_read" on storage.objects;
create policy "training_media_read" on storage.objects
  for select using (bucket_id = 'training-media');

drop policy if exists "training_media_write" on storage.objects;
create policy "training_media_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'training-media' and (core.is_admin() or core.has_role('hr')));

drop policy if exists "training_media_update" on storage.objects;
create policy "training_media_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'training-media' and (core.is_admin() or core.has_role('hr')));

drop policy if exists "training_media_delete" on storage.objects;
create policy "training_media_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'training-media' and (core.is_admin() or core.has_role('hr')));

-- ------------------------------------------------------------- lesson kinds
alter table training.lessons drop constraint if exists lessons_kind_check;
alter table training.lessons add constraint lessons_kind_check
  check (kind in ('slide', 'text', 'video', 'image', 'pdf', 'recipe', 'steps', 'team', 'outlets'));

create table if not exists training.outlet_media (
  outlet_id  text primary key references public.flax_outlets(id) on delete cascade,
  photo_url  text,
  note       text,
  updated_at timestamptz not null default now()
);
alter table training.outlet_media enable row level security;

-- Outlets as a lesson: name, city, address, map link, photo.
create or replace function public.training_outlets()
returns jsonb language sql stable security definer set search_path to 'training', 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', coalesce(o.display_name, o.name), 'city', o.city, 'address', o.address,
      'lat', o.lat, 'lng', o.lng, 'format', o.format,
      'photo_url', m.photo_url, 'note', m.note)
    order by o.city nulls last, coalesce(o.display_name, o.name)), '[]'::jsonb)
  from public.flax_outlets o
  left join training.outlet_media m on m.outlet_id = o.id
  where o.active and o.id not in ('head_office', 'central_kitchen')
$$;

create or replace function public.training_save_outlet_media(p_outlet text, p_photo_url text, p_note text default null)
returns void language plpgsql security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  insert into training.outlet_media (outlet_id, photo_url, note) values (p_outlet, nullif(p_photo_url, ''), nullif(p_note, ''))
  on conflict (outlet_id) do update set photo_url = excluded.photo_url, note = excluded.note, updated_at = now();
end $$;

-- "Your leaders": the leads at my outlet, then company leaders (ops,
-- area, HR, head chef / kitchen heads) wherever they sit. Names and roles
-- only; no phone numbers.
create or replace function public.training_team_for_me()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare v_outlet text;
begin
  select outlet_id into v_outlet from core.employees where id = training.me();
  return jsonb_build_object(
    'outlet', (select coalesce(display_name, name) from public.flax_outlets where id = v_outlet),
    'outlet_leads', (select coalesce(jsonb_agg(jsonb_build_object('name', e.full_name, 'role', d.name)
                       order by d.display_order, e.full_name), '[]'::jsonb)
                     from core.employees e join core.designations d on d.code = e.designation_code
                     where e.outlet_id = v_outlet and e.is_active and e.deleted_at is null and d.is_lead
                       and e.id is distinct from training.me()),
    'company_leads', (select coalesce(jsonb_agg(jsonb_build_object('name', e.full_name, 'role', d.name,
                        'outlet', coalesce(o.display_name, o.name)) order by d.display_order, e.full_name), '[]'::jsonb)
                      from core.employees e join core.designations d on d.code = e.designation_code
                      left join public.flax_outlets o on o.id = e.outlet_id
                      where e.is_active and e.deleted_at is null
                        and d.code in ('oh', 'opsmgr', 'am', 'hr', 'headchef', 'csc', 'km', 'bh')));
end $$;

-- ------------------------------------------------------------------ points
create or replace function training.assignment_points(a training.assignments, p_pass_mark int)
returns int language sql immutable as $$
  select case when a.status = 'passed' then
           round(coalesce(a.best_score, 0))::int
           + case when a.first_score >= p_pass_mark then 50 else 0 end
           + case when a.due_on is null or a.passed_at::date <= a.due_on then 25 else 0 end
         else 0 end
$$;

create or replace function training.points_table()
returns table (employee_id uuid, points int, passed int, assigned int, perfect int, first_try int,
               on_time int, safety_total int, safety_passed int)
language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  select a.employee_id,
         sum(training.assignment_points(a, m.pass_mark))::int,
         count(*) filter (where a.status = 'passed')::int,
         count(*)::int,
         count(*) filter (where a.best_score >= 100)::int,
         count(*) filter (where a.first_score >= m.pass_mark)::int,
         count(*) filter (where a.status = 'passed' and (a.due_on is null or a.passed_at::date <= a.due_on))::int,
         count(*) filter (where m.kind in ('hygiene', 'sop'))::int,
         count(*) filter (where m.kind in ('hygiene', 'sop') and a.status = 'passed')::int
  from training.assignments a
  join training.modules m on m.id = a.module_id and m.is_active
  join core.employees e on e.id = a.employee_id and e.is_active and e.deleted_at is null
  group by a.employee_id
$$;

-- My points, level, badges, ranks and the leaderboards (first name and
-- surname initial only).
create or replace function public.training_my_progress()
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare
  v_me uuid := training.me();
  v_outlet text;
  p record;
  v_points int := 0;
begin
  select outlet_id into v_outlet from core.employees where id = v_me;
  select * into p from training.points_table() t where t.employee_id = v_me;
  v_points := coalesce(p.points, 0);
  return jsonb_build_object(
    'points', v_points,
    'level', case when v_points >= 1000 then 'Champion' when v_points >= 500 then 'Pro'
                  when v_points >= 200 then 'Learner' else 'Starter' end,
    'level_floor', case when v_points >= 1000 then 1000 when v_points >= 500 then 500 when v_points >= 200 then 200 else 0 end,
    'next_level', case when v_points >= 1000 then null when v_points >= 500 then 1000 when v_points >= 200 then 500 else 200 end,
    'next_level_name', case when v_points >= 1000 then null when v_points >= 500 then 'Champion'
                            when v_points >= 200 then 'Pro' else 'Learner' end,
    'passed', coalesce(p.passed, 0), 'assigned', coalesce(p.assigned, 0),
    'badges', jsonb_build_array(
      jsonb_build_object('key', 'first_pass', 'name', 'First step', 'hint', 'Pass your first module', 'earned', coalesce(p.passed, 0) >= 1),
      jsonb_build_object('key', 'first_try', 'name', 'Sharp', 'hint', 'Pass a quiz on the first try', 'earned', coalesce(p.first_try, 0) >= 1),
      jsonb_build_object('key', 'perfect', 'name', 'Perfect score', 'hint', 'Score 100% on a quiz', 'earned', coalesce(p.perfect, 0) >= 1),
      jsonb_build_object('key', 'on_time', 'name', 'On time', 'hint', 'Finish 3 modules before they are due', 'earned', coalesce(p.on_time, 0) >= 3),
      jsonb_build_object('key', 'safety', 'name', 'Safety star', 'hint', 'Pass every food safety and SOP module', 'earned', coalesce(p.safety_total, 0) > 0 and p.safety_passed = p.safety_total),
      jsonb_build_object('key', 'all_done', 'name', 'All done', 'hint', 'Finish all your training', 'earned', coalesce(p.assigned, 0) > 0 and p.passed = p.assigned)),
    'rank_outlet', (select r from (select t.employee_id, rank() over (order by t.points desc) r
                      from training.points_table() t join core.employees e on e.id = t.employee_id
                      where e.outlet_id = v_outlet) x where x.employee_id = v_me),
    'rank_company', (select r from (select t.employee_id, rank() over (order by t.points desc) r
                       from training.points_table() t) x where x.employee_id = v_me),
    'outlet_board', (select coalesce(jsonb_agg(jsonb_build_object('name', x.nm, 'points', x.points, 'me', x.me) order by x.points desc, x.nm), '[]'::jsonb)
                     from (select split_part(e.full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(e.full_name, ' ', 2), ''), 1) || '.', '') nm,
                                  t.points, t.employee_id = v_me me
                           from training.points_table() t join core.employees e on e.id = t.employee_id
                           where e.outlet_id = v_outlet and t.points > 0
                           order by t.points desc limit 5) x),
    'company_board', (select coalesce(jsonb_agg(jsonb_build_object('name', x.nm, 'outlet', x.outlet, 'points', x.points, 'me', x.me) order by x.points desc, x.nm), '[]'::jsonb)
                      from (select split_part(e.full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(e.full_name, ' ', 2), ''), 1) || '.', '') nm,
                                   coalesce(o.display_name, o.name) outlet, t.points, t.employee_id = v_me me
                            from training.points_table() t join core.employees e on e.id = t.employee_id
                            left join public.flax_outlets o on o.id = e.outlet_id
                            where t.points > 0
                            order by t.points desc limit 10) x));
end $$;

do $$
declare f text;
begin
  foreach f in array array['training_outlets()', 'training_save_outlet_media(text, text, text)',
                           'training_team_for_me()', 'training_my_progress()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- --------------------------------------------- Welcome to Flax: icons + pictures
do $$
declare v_mod uuid;
begin
  select id into v_mod from training.modules where code = 'welcome-to-flax';
  if v_mod is null then return; end if;

  update training.lessons l set data = l.data || jsonb_build_object('icon', x.icon)
  from (values ('WELCOME', 'sparkles'), ('ESTD 2016', 'flag'), ('THE FOOD', 'salad'),
               ('FRESH, ALWAYS', 'thermometer'), ('THE GUEST', 'smile'), ('HOW WE SOUND', 'message'),
               ('HOW WE LOOK', 'palette'), ('YOUR TOOLS', 'smartphone'), ('THAT''S IT', 'trophy')) x(eyebrow, icon)
  where l.module_id = v_mod and l.data ->> 'eyebrow' = x.eyebrow;

  if not exists (select 1 from training.lessons where module_id = v_mod and kind = 'outlets') then
    update training.lessons set position = position + 2 where module_id = v_mod and position > 2;
    insert into training.lessons (module_id, position, kind, title, body)
    values (v_mod, 3, 'outlets', 'Our outlets', 'These are the Flax outlets. Find yours, and say hello when you visit another one.'),
           (v_mod, 4, 'team', 'Your leaders', 'These are the people to go to with questions, ideas or problems.');
  end if;
end $$;


-- ------------------------------------------------- automatic assignment
-- Modules reach people through paths, never by hand: saving a module with
-- "path_ids" puts it on those paths (and assigns it to everyone who
-- matches). The starter paths are switched on here, so every active
-- employee gets their training now and new joiners on the day they join.

create or replace function public.training_save_module(p jsonb)
returns uuid language plpgsql security definer set search_path to 'training', 'public' as $$
declare v uuid; pid text;
begin
  perform training.require_admin();
  v := training.save_module_doc(p, auth.uid());
  if jsonb_typeof(p -> 'path_ids') = 'array' then
    delete from training.path_modules where module_id = v
      and not (path_id::text in (select jsonb_array_elements_text(p -> 'path_ids')));
    for pid in select jsonb_array_elements_text(p -> 'path_ids') loop
      insert into training.path_modules (path_id, module_id, position)
      values (pid::uuid, v, coalesce((select max(position) + 1 from training.path_modules where path_id = pid::uuid), 1))
      on conflict do nothing;
    end loop;
  end if;
  perform training.sync_paths();
  return v;
end $$;

create or replace function public.training_admin_module(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'public' as $$
declare r jsonb;
begin
  perform training.require_admin();
  select to_jsonb(m) || jsonb_build_object(
    'lessons', coalesce((select jsonb_agg(to_jsonb(l) - 'module_id' order by l.position) from training.lessons l where l.module_id = m.id), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(to_jsonb(q) - 'module_id' order by q.position) from training.questions q where q.module_id = m.id), '[]'::jsonb),
    'path_ids', coalesce((select jsonb_agg(pm.path_id) from training.path_modules pm where pm.module_id = m.id), '[]'::jsonb))
  into r from training.modules m where m.id = p_id;
  if r is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return r;
end $$;

update training.paths set is_active = true, updated_at = now()
where name in ('All staff: welcome', 'Kitchen: food safety and base prep', 'Outlet teams: hygiene');

select training.sync_paths();

notify pgrst, 'reload schema';
