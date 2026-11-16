-- Item-level availability from the store checker (Swiggy flags switched-off items; Zomato hides them, so we compare with items seen recently).
create table if not exists public.ops_menu_seen (
  outlet_id text not null, platform text not null, item_key text not null,
  item_name text not null, category text, bestseller boolean default false,
  last_seen timestamptz not null default now(),
  primary key (outlet_id, platform, item_key));
create table if not exists public.ops_item_off (
  outlet_id text not null, item_key text not null, item_name text not null,
  platforms text[] not null default '{}', since timestamptz not null default now(),
  alerted boolean not null default false, bestseller boolean default false, next_msg text,
  primary key (outlet_id, item_key));
create table if not exists public.ops_item_off_log (
  id bigint generated always as identity primary key, outlet_id text not null, item_key text not null, item_name text not null,
  platforms text[], since timestamptz not null, until timestamptz not null default now(), bestseller boolean default false);
create index if not exists ops_item_off_log_until on public.ops_item_off_log (until);
create table if not exists public.ops_item_skip (pattern text primary key, note text);   -- case-insensitive regex on item name, or 'outlet:<id>'
insert into public.ops_item_skip (pattern, note) values
  ('chef signature', 'made to order'), ('soulbar|soulcore', 'retail bars'), ('nimbu paani|nariyal pani|lychee', 'drinks often off'),
  ('latte|cold brew|^1/2 |falafel pcs', 'Goa café menu')
on conflict do nothing;
alter table public.ops_menu_seen enable row level security;
alter table public.ops_item_off enable row level security;
alter table public.ops_item_off_log enable row level security;
alter table public.ops_item_skip enable row level security;
