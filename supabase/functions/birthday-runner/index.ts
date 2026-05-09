/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno edge function; types resolved at deploy time.
//
// Daily birthday runner. Schedule via Supabase scheduled functions
// (or pg_cron) at 09:00 IST. Idempotent — calling multiple times in
// the same IST day is a no-op for already-wished employees.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ ok: false, error: 'missing supabase env' }, 500)
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.rpc('run_birthdays_today')
  if (error) {
    return json({ ok: false, error: error.message }, 500)
  }
  return json({ ok: true, count: (data ?? []).length, results: data ?? [] })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
