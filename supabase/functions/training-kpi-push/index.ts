/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno edge function; types resolved at deploy time.
//
// Nightly: push each outlet's training numbers into command's outlet
// scoring (Inventory project, table cmd_metric_daily, domain 'people').
//
//   training_score       average training score of the outlet's staff (0-100)
//   training_completion  % of due modules passed
//   training_overdue     modules past their due date and not passed
//
// Needs the edge function secret COMMAND_SERVICE_ROLE_KEY (the Inventory
// project's service role key), set in Supabase > Edge Functions > Secrets.
// Until it is set the function does nothing and says so.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const COMMAND_URL = Deno.env.get('COMMAND_SUPABASE_URL') ?? 'https://iyoosjvqmtqtclswxgpd.supabase.co'
const COMMAND_KEY = Deno.env.get('COMMAND_SERVICE_ROLE_KEY') ?? ''

const DEFINITIONS = [
  {
    kpi_key: 'training_score',
    domain: 'people',
    label: 'Training score',
    unit: 'pct',
    format: 'percent',
    target: 85,
    good_direction: 'up',
    sort_weight: 110,
  },
  {
    kpi_key: 'training_completion',
    domain: 'people',
    label: 'Training completion',
    unit: 'pct',
    format: 'percent',
    target: 90,
    good_direction: 'up',
    sort_weight: 120,
  },
  {
    kpi_key: 'training_overdue',
    domain: 'people',
    label: 'Overdue training modules',
    unit: 'count',
    format: 'integer',
    target: 0,
    good_direction: 'down',
    sort_weight: 130,
  },
]

Deno.serve(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, error: 'missing supabase env' }, 500)
  // Deployed with JWT verification on; the push is idempotent (same rows
  // for the same day), so a repeat call only rewrites today's numbers.
  if (!COMMAND_KEY) return json({ ok: false, error: 'COMMAND_SERVICE_ROLE_KEY is not set' }, 200)

  const hr = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const cmd = createClient(COMMAND_URL, COMMAND_KEY, { auth: { persistSession: false } })

  const { data, error } = await hr.rpc('training_outlet_kpis')
  if (error) return json({ ok: false, error: error.message }, 500)

  // Business date in IST.
  const date = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  const rows = (data ?? []).map((r: any) => ({
    domain: 'people',
    outlet_id: r.outlet_id,
    date,
    kpi_key: r.kpi_key,
    value: r.value,
    unit: r.unit,
    updated_at: new Date().toISOString(),
  }))

  const defs = await cmd.from('cmd_metric_definition').upsert(DEFINITIONS, { onConflict: 'kpi_key' })
  if (defs.error) return json({ ok: false, step: 'definitions', error: defs.error.message }, 500)

  let written = 0
  if (rows.length) {
    const up = await cmd
      .from('cmd_metric_daily')
      .upsert(rows, { onConflict: 'domain,outlet_id,date,kpi_key' })
    if (up.error) {
      await cmd
        .from('cmd_domain_push_log')
        .insert({
          domain: 'people',
          status: 'error',
          rows_written: 0,
          business_date: date,
          message: up.error.message,
        })
      return json({ ok: false, step: 'metrics', error: up.error.message }, 500)
    }
    written = rows.length
  }
  await cmd.from('cmd_domain_push_log').insert({
    domain: 'people',
    status: 'ok',
    rows_written: written,
    business_date: date,
    message: 'Nightly training push from Flax HR (training_score, training_completion, training_overdue)',
  })
  return json({ ok: true, date, rows: written })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
