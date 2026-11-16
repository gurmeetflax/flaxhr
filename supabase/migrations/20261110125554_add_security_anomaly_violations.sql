create table if not exists public.security_anomaly_violations (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid references public.security_outlets(id) on delete set null,
  outlet_name text,
  camera_name text,
  serial text,
  channel int,
  scanned_at timestamptz not null default now(),
  model text,
  scan jsonb,
  violated_fields text[],
  caption text,
  alert_status text,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at timestamptz not null default now()
);

create index if not exists security_anomaly_violations_scanned_at_idx
  on public.security_anomaly_violations (scanned_at desc);
create index if not exists security_anomaly_violations_outlet_idx
  on public.security_anomaly_violations (outlet_id, scanned_at desc);

alter table public.security_anomaly_violations enable row level security;

create policy "anon insert on security_anomaly_violations"
  on public.security_anomaly_violations for insert to anon with check (true);
create policy "anon select on security_anomaly_violations"
  on public.security_anomaly_violations for select to anon using (true);
create policy "anon update on security_anomaly_violations"
  on public.security_anomaly_violations for update to anon using (true) with check (true);
