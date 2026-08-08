// Weekly card digest — posts a Slack summary of the last 7 days of
// discipline card activity. Triggered by pg_cron every Monday 09:00 IST.
// Deployed with --no-verify-jwt so pg_net can call it without a token.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? ''

Deno.serve(async (_req: Request) => {
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: rows, error } = await sb
    .from('v_cards_weekly_digest')
    .select('employee_code, employee_name, outlet_name, yellow_week, red_week, green_week')
    .order('red_week', { ascending: false })
    .order('yellow_week', { ascending: false })

  if (error) return json(500, { error: error.message })

  const list = rows ?? []
  const totals = list.reduce(
    (a, r: any) => {
      a.y += r.yellow_week ?? 0
      a.r += r.red_week ?? 0
      a.g += r.green_week ?? 0
      return a
    },
    { y: 0, r: 0, g: 0 },
  )

  const header = `📇 *Weekly card digest* — last 7 days\n` +
    `🟡 ${totals.y} yellow  ·  🔴 ${totals.r} red  ·  🟢 ${totals.g} green` +
    (list.length ? `\n_${list.length} employee${list.length === 1 ? '' : 's'} affected_` : '')

  const lines = list.slice(0, 20).map((r: any) => {
    const parts: string[] = []
    if (r.red_week)    parts.push(`🔴 ${r.red_week}`)
    if (r.yellow_week) parts.push(`🟡 ${r.yellow_week}`)
    if (r.green_week)  parts.push(`🟢 ${r.green_week}`)
    return `• *${r.employee_name}* (${r.employee_code})` +
           (r.outlet_name ? ` · ${r.outlet_name}` : '') +
           `  —  ${parts.join('  ')}`
  })

  const text = list.length === 0
    ? `${header}\n_No card activity this week._`
    : [header, '', ...lines].join('\n')

  if (SLACK_WEBHOOK_URL) {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  }

  return json(200, { ok: true, employees: list.length, ...totals })
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
