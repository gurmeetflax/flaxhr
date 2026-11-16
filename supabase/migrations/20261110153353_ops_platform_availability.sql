-- Swiggy/Zomato public-page availability, checked every 15 min from the office Mac mini.
create table if not exists public.ops_platform_listing (
  outlet_id text not null,
  outlet_name text not null,
  platform text not null check (platform in ('swiggy','zomato')),
  external_id text not null,          -- Swiggy restaurant id / Zomato res_id
  lat numeric, lng numeric,           -- check as a customer standing at the outlet
  open_at time not null,              -- listed hours: alerts only inside these (+15 min grace)
  close_at time not null,             -- may be earlier than open_at = closes after midnight
  active boolean not null default true,
  primary key (outlet_id, platform)
);

create table if not exists public.ops_availability_checks (
  id bigserial primary key,
  checked_at timestamptz not null default now(),
  run_id text,
  outlet_id text not null,
  platform text not null,
  state text not null,                -- open | closed | paused | unserviceable | error
  expected_open boolean,              -- inside listed hours at check time
  detail text,                        -- page wording, e.g. 'Open now', 'Opens at 9am'
  eta_min int,
  stress numeric,                     -- Swiggy stressFactor (>1 = rider surge)
  raw jsonb
);
create index if not exists ops_availability_checks_at on public.ops_availability_checks (checked_at desc);
create index if not exists ops_availability_checks_outlet on public.ops_availability_checks (outlet_id, platform, checked_at desc);

create table if not exists public.ops_availability_state (
  outlet_id text not null,
  platform text not null,
  state text not null,
  since timestamptz not null default now(),
  alerted boolean not null default false,
  primary key (outlet_id, platform)
);

create table if not exists public.ops_availability_runs (
  run_date date not null,
  kind text not null,                 -- 'morning' (8:30) | 'noon' (12:30)
  sent_at timestamptz not null default now(),
  primary key (run_date, kind)
);

alter table public.ops_platform_listing enable row level security;
alter table public.ops_availability_checks enable row level security;
alter table public.ops_availability_state enable row level security;
alter table public.ops_availability_runs enable row level security;

insert into public.ops_platform_listing (outlet_id, outlet_name, platform, external_id, lat, lng, open_at, close_at) values
 ('andheri_west','Andheri W','swiggy','591107',19.139180,72.827874,'08:00','04:00'),
 ('andheri_west','Andheri W','zomato','20391677',19.139180,72.827874,'08:00','04:00'),
 ('bandra_khar','Bandra','swiggy','347385',19.068120,72.835078,'08:00','23:30'),
 ('bandra_khar','Bandra','zomato','19640846',19.068120,72.835078,'08:00','23:59'),
 ('breach_candy','Breach Candy','swiggy','487846',18.975299,72.806186,'09:00','23:30'),
 ('breach_candy','Breach Candy','zomato','18467849',18.975299,72.806186,'09:00','23:30'),
 ('fort','Kala Ghoda','swiggy','901883',18.933197,72.834254,'09:00','23:30'),
 ('fort','Kala Ghoda','zomato','21245245',18.933197,72.834254,'09:00','23:30'),
 ('santacruz_kalina','Kalina','swiggy','1044195',19.073158,72.869271,'08:00','04:00'),
 ('santacruz_kalina','Kalina','zomato','21777575',19.073158,72.869271,'08:00','04:00'),
 ('lower_parel','Lower Parel','swiggy','39199',19.001374,72.825111,'08:00','23:59'),
 ('lower_parel','Lower Parel','zomato','18603781',19.001374,72.825111,'08:00','23:59'),
 ('malad','Malad','swiggy','861009',19.178677,72.835926,'08:00','23:59'),
 ('malad','Malad','zomato','21134561',19.178677,72.835926,'08:00','23:59'),
 ('andheri_east','Marol','swiggy','1350873',19.110580,72.880411,'08:00','23:59'),
 ('andheri_east','Marol','zomato','22556975',19.110580,72.880411,'08:00','04:00'),
 ('powai','Powai','swiggy','76807',19.123195,72.913315,'08:00','04:00'),
 ('powai','Powai','zomato','18782415',19.123195,72.913315,'08:00','04:00'),
 ('indiranagar','Indiranagar','swiggy','1073206',12.968899,77.636052,'08:00','23:59'),
 ('indiranagar','Indiranagar','zomato','21848752',12.968899,77.636052,'08:00','23:59'),
 ('goa','Goa','swiggy','1412157',15.614747,73.778580,'08:00','23:59'),
 ('goa','Goa','zomato','22777115',15.614747,73.778580,'08:00','23:59')
on conflict (outlet_id, platform) do nothing;
