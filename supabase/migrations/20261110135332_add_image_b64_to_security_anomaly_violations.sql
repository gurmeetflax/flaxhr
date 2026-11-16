alter table public.security_anomaly_violations
  add column if not exists image_b64 text;

comment on column public.security_anomaly_violations.image_b64 is
  'The JPEG frame Claude actually analysed, base64-encoded. ~150KB per violation.
   Served via /api/cctv/violation-img?id=X (streams decoded bytes with image/jpeg).
   Kept out of the list query to keep page loads fast.';
