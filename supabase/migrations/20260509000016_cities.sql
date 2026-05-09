-- Flax HR — Migration 043: cities master + outlet city normalisation
create table if not exists core.cities (
  id text primary key,
  display_name text not null,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_cities_updated_at on core.cities;
create trigger trg_cities_updated_at before update on core.cities
  for each row execute function core.set_updated_at();
drop trigger if exists trg_cities_audit on core.cities;
create trigger trg_cities_audit after insert or update or delete on core.cities
  for each row execute function core.log_audit();

alter table core.cities enable row level security;
drop policy if exists cities_read_all on core.cities;
create policy cities_read_all on core.cities for select using (auth.uid() is not null);
drop policy if exists cities_admin_hr_write on core.cities;
create policy cities_admin_hr_write on core.cities for all
  using (core.is_admin() or core.has_role('hr')) with check (core.is_admin() or core.has_role('hr'));

insert into core.cities (id, display_name)
  select lower(trim(city)) as id, initcap(trim(city)) as display_name
    from public.flax_outlets where city is not null and length(trim(city)) > 0
   group by lower(trim(city)), initcap(trim(city))
  on conflict (id) do nothing;

create or replace function core.normalise_outlet_city() returns trigger
language plpgsql security definer set search_path = core, public as $$
declare slug text;
begin
  if new.city is null or length(trim(new.city))=0 then return new; end if;
  slug := lower(trim(new.city));
  insert into core.cities (id, display_name)
  values (slug, initcap(trim(new.city)))
  on conflict (id) do nothing;
  new.city := slug;
  return new;
end; $$;

drop trigger if exists trg_outlets_normalise_city on public.flax_outlets;
create trigger trg_outlets_normalise_city
  before insert or update of city on public.flax_outlets
  for each row execute function core.normalise_outlet_city();

update public.flax_outlets set city = lower(trim(city)) where city is not null;

create or replace view public.v_cities with (security_invoker = true) as
  select id, display_name, is_active, display_order, created_at, updated_at
    from core.cities
   order by display_order, display_name;
grant select on public.v_cities to authenticated;

create or replace function public.upsert_city(
  p_id text, p_display_name text, p_is_active boolean default true, p_display_order int default 0
) returns void language plpgsql security definer set search_path = core, public as $$
declare slug text := lower(trim(p_id));
begin
  if not (core.is_admin() or core.has_role('hr')) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  if length(slug)=0 then raise exception 'EMPTY_ID' using errcode='P0001'; end if;
  insert into core.cities (id, display_name, is_active, display_order)
  values (slug, trim(p_display_name), coalesce(p_is_active,true), coalesce(p_display_order,0))
  on conflict (id) do update
    set display_name = excluded.display_name,
        is_active = excluded.is_active,
        display_order = excluded.display_order;
end; $$;
grant execute on function public.upsert_city(text, text, boolean, int) to authenticated;

notify pgrst, 'reload schema';
