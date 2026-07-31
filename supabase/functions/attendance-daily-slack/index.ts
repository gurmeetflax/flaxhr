// Daily attendance digest → Slack.
//
// Called by pg_cron on a schedule (default 16:00 UTC == 21:30 IST). For
// the target work_date (defaults to today in Asia/Kolkata) it groups
// every active employee under their outlet with a status of Present,
// Late (Nm), Absent or On leave, and posts a formatted digest to the
// SLACK_WEBHOOK_URL secret.
//
// Deployed with --no-verify-jwt so the pg_cron job can hit it without
// carrying a service-role token. Shared-secret is checked via the
// x-cron-secret header when CRON_SHARED_SECRET is set.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  — Deno runtime; TS server here isn't configured for it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? ''
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET') ?? ''

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  if (CRON_SHARED_SECRET) {
    const provided = req.headers.get('x-cron-secret') ?? ''
    if (provided !== CRON_SHARED_SECRET) {
      return json(401, { error: 'bad_shared_secret' })
    }
  }
  if (!SLACK_WEBHOOK_URL) {
    return json(500, { error: 'SLACK_WEBHOOK_URL not set' })
  }

  const body = await req.json().catch(() => ({} as any))
  const workDate: string =
    body?.date ??
    new Date(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }))
      .toISOString()
      .slice(0, 10)

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // 1) Active employees (source of truth for who's expected)
  const { data: emps, error: empErr } = await sb
    .from('v_employees')
    .select('id, employee_code, full_name, outlet_id, outlet_name')
    .eq('is_active', true)
  if (empErr) return json(500, { error: empErr.message })

  // 2) Today's derived status
  const { data: report, error: repErr } = await sb
    .from('v_attendance_report')
    .select('employee_id, status, late_minutes')
    .eq('work_date', workDate)
  if (repErr) return json(500, { error: repErr.message })

  const byEmp = new Map<
    string,
    { status: string; late_minutes: number | null }
  >()
  for (const r of report ?? []) {
    byEmp.set(r.employee_id, { status: r.status, late_minutes: r.late_minutes })
  }

  // 3) Group by outlet
  interface Row {
    employee_code: string
    full_name: string
    status: 'present' | 'late' | 'absent' | 'on_leave'
    late_minutes: number | null
  }
  const byOutlet = new Map<string, Row[]>()
  for (const e of emps ?? []) {
    const key = e.outlet_name ?? 'Unassigned'
    const t = byEmp.get(e.id)
    const status = (t?.status ?? 'absent') as Row['status']
    if (!byOutlet.has(key)) byOutlet.set(key, [])
    byOutlet.get(key)!.push({
      employee_code: e.employee_code,
      full_name: e.full_name,
      status,
      late_minutes: t?.late_minutes ?? null,
    })
  }

  // 4) Build message
  const outlets = Array.from(byOutlet.keys()).sort()
  const label: Record<Row['status'], string> = {
    present: 'Present',
    late: 'Late',
    absent: 'Absent',
    on_leave: 'On leave',
  }
  const emoji: Record<Row['status'], string> = {
    present: '✅',
    late: '⏰',
    absent: '❌',
    on_leave: '🌴',
  }

  const dateHuman = new Date(workDate + 'T00:00:00+05:30').toLocaleDateString(
    'en-GB',
    { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' },
  )

  const lines: string[] = [`📋 *Attendance summary — ${dateHuman}*`]
  let totalPresent = 0
  let totalLate = 0
  let totalAbsent = 0
  let totalLeave = 0
  for (const outlet of outlets) {
    const rows = byOutlet.get(outlet)!.slice().sort((a, b) => {
      const order = { late: 0, absent: 1, present: 2, on_leave: 3 } as Record<
        Row['status'],
        number
      >
      return order[a.status] - order[b.status] || a.full_name.localeCompare(b.full_name)
    })
    const grouped: Record<Row['status'], string[]> = {
      present: [],
      late: [],
      absent: [],
      on_leave: [],
    }
    for (const r of rows) {
      const decorated =
        r.status === 'late' && r.late_minutes
          ? `${r.full_name} (${r.late_minutes}m late)`
          : r.full_name
      grouped[r.status].push(decorated)
    }
    totalPresent += grouped.present.length
    totalLate += grouped.late.length
    totalAbsent += grouped.absent.length
    totalLeave += grouped.on_leave.length

    lines.push('')
    lines.push(`*🏪 ${outlet}* — ${rows.length} employee${rows.length === 1 ? '' : 's'}`)
    ;(['late', 'absent', 'present', 'on_leave'] as Row['status'][]).forEach((s) => {
      const names = grouped[s]
      if (names.length === 0) return
      lines.push(`  ${emoji[s]} ${label[s]} (${names.length}): ${names.join(', ')}`)
    })
  }

  lines.push('')
  lines.push(
    `*Total:* ✅ ${totalPresent} present · ⏰ ${totalLate} late · ❌ ${totalAbsent} absent · 🌴 ${totalLeave} on leave`,
  )

  const text = lines.join('\n').slice(0, 39000) // Slack cap ~40k

  const resp = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    return json(502, { error: `slack_${resp.status}: ${t.slice(0, 200)}` })
  }

  return json(200, {
    ok: true,
    work_date: workDate,
    outlets: outlets.length,
    counts: { present: totalPresent, late: totalLate, absent: totalAbsent, on_leave: totalLeave },
  })
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
