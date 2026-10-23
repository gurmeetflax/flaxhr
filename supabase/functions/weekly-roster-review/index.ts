// Weekly roster review → email to ops, HR and the director.
//
// Called by pg_cron (job weekly-roster-review, Mondays 09:30 UTC ==
// 15:00 IST) through public.fire_weekly_roster_review(). Reviews the
// previous Monday–Sunday: roster vs app attendance vs Petpooja orders
// and sales, using public.weekly_roster_review().
//
// Body (optional): { week_start: 'YYYY-MM-DD', preview: true }. With
// preview the HTML is returned and nothing is sent.
//
// Deployed with --no-verify-jwt so the cron job can call it; the
// x-cron-secret header is checked when CRON_SHARED_SECRET is set.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime; TS server here isn't configured for it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Flax HR <hr@flaxitup.com>'
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET') ?? ''
const TO = ['ops@flaxitup.com', 'hr@flaxitup.com', 'gurmeet@flaxitup.com']
const SKIP = new Set(['head_office', 'central_kitchen'])

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (CRON_SHARED_SECRET && (req.headers.get('x-cron-secret') ?? '') !== CRON_SHARED_SECRET) {
    return json(401, { error: 'bad_shared_secret' })
  }
  const body = await req.json().catch(() => ({}))
  const weekStart = body.week_start ?? lastMonday()

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb.rpc('weekly_roster_review', { p_week_start: weekStart })
  if (error) return json(500, { error: error.message })

  const html = render(data)
  const subject = `Weekly roster review · ${fmtDate(data.week_start)} – ${fmtDate(data.week_end)}`
  if (body.preview) return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })

  if (!RESEND_API_KEY) return json(500, { error: 'RESEND_API_KEY not set' })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: TO, subject, html }),
  })
  if (!res.ok) return json(502, { error: `resend ${res.status}: ${await res.text()}` })
  return json(200, { ok: true, sent: TO.length, week_start: weekStart })
})

function render(d: any): string {
  const outlets = (d.outlets ?? []).filter((o: any) => !SKIP.has(o.outlet_id))
  const t = outlets.reduce(
    (a: any, o: any) => {
      for (const k of [
        'sales',
        'sales_prev',
        'orders',
        'rostered',
        'attended',
        'no_shows',
        'uncovered_orders',
        'overtime_hours',
        'stretched_hours',
      ])
        a[k] += Number(o[k] ?? 0)
      return a
    },
    {
      sales: 0,
      sales_prev: 0,
      orders: 0,
      rostered: 0,
      attended: 0,
      no_shows: 0,
      uncovered_orders: 0,
      overtime_hours: 0,
      stretched_hours: 0,
    },
  )

  const flags: string[] = []
  for (const o of outlets) {
    if (o.uncovered_orders >= 20)
      flags.push(
        `<b>${esc(o.name)}</b>: ${o.uncovered_orders} orders came in with nobody punched in (${o.uncovered_hours} hours).`,
      )
    if (o.rostered >= 7 && o.no_shows / o.rostered > 0.15)
      flags.push(`<b>${esc(o.name)}</b>: ${o.no_shows} of ${o.rostered} rostered shifts had no punch.`)
    if (o.rostered === 0 && o.unrostered > 0)
      flags.push(`<b>${esc(o.name)}</b>: no roster in the app — ${o.unrostered} shifts worked unrostered.`)
    if (o.stretched_hours >= 15)
      flags.push(`<b>${esc(o.name)}</b>: ${o.stretched_hours} hours ran at more than 5 orders per person.`)
    if (o.sales_prev > 0 && (o.sales - o.sales_prev) / o.sales_prev <= -0.1)
      flags.push(`<b>${esc(o.name)}</b>: sales down ${pct(o.sales, o.sales_prev)} on the previous week.`)
    if (o.overtime_hours >= 20) flags.push(`<b>${esc(o.name)}</b>: ${o.overtime_hours} overtime hours.`)
  }

  const rows = outlets
    .map((o: any) => {
      const adh = o.rostered ? Math.round((100 * o.attended) / o.rostered) + '%' : '—'
      const peak = o.peak ? `${hr(o.peak.hour)} · ${o.peak.orders}/hr · ${o.peak.staff} staff` : '—'
      const mtd = o.month_target
        ? `${lakh(o.month_sales)} / ${lakh(o.month_target)}`
        : o.month_sales
          ? lakh(o.month_sales)
          : '—'
      return `<tr><td class="l"><b>${esc(o.name)}</b></td><td>${lakh(o.sales)}<br><small class="${o.sales >= o.sales_prev ? 'up' : 'dn'}">${pct(o.sales, o.sales_prev)}</small></td><td>${o.orders}</td><td>${o.attended}/${o.rostered}<br><small>${adh}</small></td><td class="${o.no_shows ? 'bad' : ''}">${o.no_shows}</td><td>${o.unrostered}</td><td>${o.overtime_hours ?? 0}</td><td>${peak}</td><td class="${o.stretched_hours >= 15 ? 'warn' : ''}">${o.stretched_hours}</td><td class="${o.uncovered_orders >= 20 ? 'bad' : ''}">${o.uncovered_orders} <small>(${o.uncovered_hours}h)</small></td><td>${mtd}</td></tr>`
    })
    .join('')

  const people = (d.people ?? [])
    .filter((p: any) => p.no_shows >= 2 || p.late >= 2)
    .slice(0, 15)
    .map(
      (p: any) =>
        `<tr><td class="l">${esc(p.name)}</td><td class="l">${esc(p.outlet)}</td><td>${p.no_shows}</td><td>${p.late}</td></tr>`,
    )
    .join('')

  return `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#1a1a1d">
<div style="max-width:980px;margin:0 auto;background:#fff;padding:24px 28px">
<style>table{border-collapse:collapse;width:100%}th{background:#252D63;color:#fff;font-size:12px;padding:7px 6px;text-align:center}td{border-bottom:1px solid #e3e3e0;font-size:13px;padding:7px 6px;text-align:center;vertical-align:top}.l{text-align:left}small{color:#666}.up{color:#1e7d4f}.dn{color:#b3261e}.bad{background:#fde3e1;font-weight:bold}.warn{background:#fff1cb}.k{display:inline-block;width:23%;margin:0 1% 10px 0;background:#f6f5ef;padding:10px 12px;vertical-align:top}.k b{display:block;font-size:22px;color:#252D63}.k span{font-size:12px;color:#555}</style>
<div style="font-size:11px;letter-spacing:.2em;color:#666">FLAX HEALTHY LIVING · WEEKLY ROSTER REVIEW</div>
<h1 style="margin:4px 0 2px;color:#252D63;font-size:26px">${fmtDate(d.week_start)} – ${fmtDate(d.week_end)}</h1>
<div style="color:#555;font-size:13px;margin-bottom:16px">Roster vs app attendance vs Petpooja orders, all outlets.</div>
<div>
<div class="k"><b>${lakh(t.sales)}</b><span>Sales · ${pct(t.sales, t.sales_prev)} vs last week</span></div>
<div class="k"><b>${t.orders}</b><span>Orders</span></div>
<div class="k"><b>${t.rostered ? Math.round((100 * t.attended) / t.rostered) : 0}%</b><span>Rostered shifts attended (${t.attended}/${t.rostered})</span></div>
<div class="k"><b>${t.uncovered_orders}</b><span>Orders with nobody punched in</span></div>
</div>
${flags.length ? `<h2 style="font-size:16px;color:#b3261e;margin:14px 0 6px">Needs attention</h2><ul style="margin:0 0 10px 18px;padding:0;font-size:13px;line-height:1.6">${flags.map((f) => `<li>${f}</li>`).join('')}</ul>` : ''}
<h2 style="font-size:16px;color:#252D63;margin:16px 0 6px">By outlet</h2>
<table><tr><th class="l">Outlet</th><th>Sales<br>vs last wk</th><th>Orders</th><th>Shifts<br>attended</th><th>No-shows</th><th>Worked<br>unrostered</th><th>OT hrs</th><th>Peak hour</th><th>Stretched<br>hours</th><th>Orders, nobody<br>punched in</th><th>Month to date<br>/ target</th></tr>${rows}</table>
${people ? `<h2 style="font-size:16px;color:#252D63;margin:18px 0 6px">People to follow up</h2><table><tr><th class="l">Name</th><th class="l">Outlet</th><th>No-shows</th><th>Late &gt;15 min</th></tr>${people}</table>` : ''}
<p style="font-size:11px;color:#777;margin-top:18px;line-height:1.5">No-show = rostered shift with no punch and no approved leave. Worked unrostered = punched in on a day with no roster shift. Stretched = more than 5 orders an hour per person punched in. Orders with nobody punched in = orders in hours when no one at that outlet was punched in — usually staff not using the app. Business day runs 4am–4am. Sales are Petpooja gross.</p>
</div></body></html>`
}

function lastMonday(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  const dow = (ist.getUTCDay() + 6) % 7 // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - dow - 7)
  return ist.toISOString().slice(0, 10)
}
function fmtDate(s: string): string {
  return new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
function lakh(n: number): string {
  return '₹' + (Number(n ?? 0) / 100000).toFixed(1) + 'L'
}
function pct(a: number, b: number): string {
  if (!b) return '—'
  const p = Math.round((100 * (a - b)) / b)
  return (p > 0 ? '+' : '') + p + '%'
}
function hr(h: number): string {
  const x = h % 12 || 12
  return `${x}${h < 12 ? 'am' : 'pm'}`
}
function esc(s: string): string {
  return String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
}
function json(status: number, b: unknown): Response {
  return new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
}
