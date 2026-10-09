// Daily "not punching" digest → Slack #hr.
//
// Called by pg_cron (job attendance-daily-slack, 16:00 UTC == 21:30 IST)
// through public.fire_attendance_daily_slack(). Lists active employees
// who haven't used the app to punch, in three groups that don't overlap:
//   🔴 no punch in the last 7 days (or never)
//   🟠 no punch in the last 3 days
//   🟡 no punch today
// People on approved leave today are left out. Regularised punches don't
// count as using the app.
//
// Posts only to SLACK_HR_WEBHOOK_URL (the #hr channel) — never to the
// shared complaints webhook.
//
// Deployed with --no-verify-jwt so the pg_cron job can hit it without
// carrying a service-role token. Shared-secret is checked via the
// x-cron-secret header when CRON_SHARED_SECRET is set.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  — Deno runtime; TS server here isn't configured for it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SLACK_HR_WEBHOOK_URL = Deno.env.get('SLACK_HR_WEBHOOK_URL') ?? ''
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET') ?? ''
const IST = 'Asia/Kolkata'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (CRON_SHARED_SECRET) {
    const provided = req.headers.get('x-cron-secret') ?? ''
    if (provided !== CRON_SHARED_SECRET) return json(401, { error: 'bad_shared_secret' })
  }

  if (!SLACK_HR_WEBHOOK_URL) {
    return json(500, { error: 'SLACK_HR_WEBHOOK_URL not set' })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const today = istDate(0)
  const since3 = istDate(2)
  const since7 = istDate(6)

  const [t, d3, d7] = await Promise.all(
    [today, since3, since7].map((d) => sb.rpc('attendance_app_usage', { p_since: d })),
  )
  for (const r of [t, d3, d7]) if (r.error) return json(500, { error: r.error.message })

  const punched = (rows: any[]) => new Set(rows.filter((r) => r.punches_since > 0).map((r) => r.employee_id))
  const today_ = punched(t.data)
  const in3 = punched(d3.data)
  const in7 = punched(d7.data)

  const people = (t.data as any[]).filter((r) => !r.on_leave_today)
  const week = people.filter((r) => !in7.has(r.employee_id))
  const three = people.filter((r) => in7.has(r.employee_id) && !in3.has(r.employee_id))
  const day = people.filter((r) => in3.has(r.employee_id) && !today_.has(r.employee_id))
  const onLeave = (t.data as any[]).filter((r) => r.on_leave_today && !today_.has(r.employee_id)).length

  const dateHuman = new Date(today + 'T00:00:00+05:30').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: IST,
  })

  const lines: string[] = [
    `⚠️ *Not punching on the app — ${dateHuman}*`,
    `${people.length - week.length - three.length - day.length} of ${people.length} punched today` +
      (onLeave ? ` · ${onLeave} on leave` : ''),
  ]
  section(lines, '🔴', 'No punch in 7+ days', week, true)
  section(lines, '🟠', 'No punch in the last 3 days', three, true)
  section(lines, '🟡', 'Not punched today', day, false)
  lines.push('')
  lines.push('_Full list with call / WhatsApp buttons: hr.flaxfoods.in → Attendance → Who\'s punching_')

  const text = lines.join('\n').slice(0, 39000)

  const resp = await fetch(SLACK_HR_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    return json(502, { error: `slack_${resp.status}: ${body.slice(0, 200)}` })
  }
  return json(200, {
    ok: true,
    date: today,
    counts: { seven_days: week.length, three_days: three.length, today: day.length, on_leave: onLeave },
  })
})

// Adds one group, broken down by outlet.
function section(lines: string[], emoji: string, title: string, rows: any[], showLast: boolean) {
  lines.push('')
  lines.push(`${emoji} *${title} (${rows.length})*`)
  if (rows.length === 0) {
    lines.push('  None 🎉')
    return
  }
  const byOutlet = new Map<string, any[]>()
  for (const r of rows) {
    const k = r.outlet_name ?? 'Unassigned'
    if (!byOutlet.has(k)) byOutlet.set(k, [])
    byOutlet.get(k)!.push(r)
  }
  for (const outlet of [...byOutlet.keys()].sort()) {
    const names = byOutlet
      .get(outlet)!
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map((r) => (showLast ? `${r.full_name} (${lastSeen(r.last_punch_at)})` : r.full_name))
    lines.push(`  • *${outlet}:* ${names.join(', ')}`)
  }
}

function lastSeen(at: string | null): string {
  if (!at) return 'never'
  return new Date(at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: IST })
}

// Date `daysAgo` days before today in IST, as YYYY-MM-DD.
function istDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: IST })
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
