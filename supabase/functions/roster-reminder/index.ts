// Roster reminder → email to managers.
//
// Called by pg_cron (job roster-reminder, daily 04:15 UTC == 09:45 IST)
// through public.fire_roster_reminder(). Checks the next 7 days for every
// active outlet with staff and, when any outlet's roster is empty or
// incomplete, emails every user with the manager role (CC HR). Sends
// nothing when every outlet is fully rostered.
//
// Deployed with --no-verify-jwt so the cron job can call it; the
// x-cron-secret header is checked when CRON_SHARED_SECRET is set.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime; TS server here isn't configured for it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Flax HR <hr@flaxfoods.in>'
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET') ?? ''
const CC = ['hr@flaxitup.com', 'gurmeet@flaxitup.com']
const IST = 'Asia/Kolkata'
const DAYS = 7

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (CRON_SHARED_SECRET && (req.headers.get('x-cron-secret') ?? '') !== CRON_SHARED_SECRET) {
    return json(401, { error: 'bad_shared_secret' })
  }
  if (!RESEND_API_KEY) return json(500, { error: 'RESEND_API_KEY not set' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const from = istDate(1)
  const to = istDate(DAYS)

  const [outletsR, staffR, rosterR, managersR] = await Promise.all([
    sb.from('flax_outlets').select('id, display_name').eq('active', true),
    sb.schema('core').from('employees').select('outlet_id').eq('is_active', true).is('deleted_at', null),
    sb.schema('core').from('roster_entries').select('outlet_id, employee_id, work_date, status').gte('work_date', from).lte('work_date', to),
    sb.schema('core').from('user_roles').select('user_id').eq('role', 'manager').is('deleted_at', null),
  ])
  for (const r of [outletsR, staffR, rosterR, managersR]) if (r.error) return json(500, { error: r.error.message })

  const staff = new Map<string, number>()
  for (const e of staffR.data ?? []) if (e.outlet_id) staff.set(e.outlet_id, (staff.get(e.outlet_id) ?? 0) + 1)

  const rows = (outletsR.data ?? [])
    .filter((o: any) => (staff.get(o.id) ?? 0) > 0)
    .map((o: any) => {
      const entries = (rosterR.data ?? []).filter((r: any) => r.outlet_id === o.id)
      const filled = new Set(entries.map((r: any) => `${r.employee_id}|${r.work_date}`)).size
      const needed = (staff.get(o.id) ?? 0) * DAYS
      const published = entries.filter((r: any) => r.status === 'published' || r.status === 'off').length
      return { name: o.display_name ?? o.id, staff: staff.get(o.id) ?? 0, filled, needed, published }
    })
    .sort((a, b) => a.filled / a.needed - b.filled / b.needed || b.staff - a.staff)

  const gaps = rows.filter((r) => r.filled < r.needed || r.published < r.filled)
  if (!gaps.length) return json(200, { ok: true, sent: 0, reason: 'all rostered' })

  const userIds = [...new Set((managersR.data ?? []).map((m: any) => m.user_id))]
  const { data: mgrs, error: mErr } = userIds.length
    ? await sb.schema('core').from('employees').select('full_name, personal_email').in('user_id', userIds).is('deleted_at', null)
    : { data: [], error: null }
  if (mErr) return json(500, { error: mErr.message })
  const to_ = (mgrs ?? []).filter((m: any) => m.personal_email).map((m: any) => m.personal_email)
  if (!to_.length) return json(200, { ok: true, sent: 0, reason: 'no manager emails' })

  const empty = gaps.filter((g) => g.filled === 0)
  const range = `${fmt(from)} – ${fmt(to)}`
  const subject = empty.length
    ? `⚠️ No roster for ${empty.length} outlet${empty.length === 1 ? '' : 's'} next week (${range})`
    : `⚠️ Rosters incomplete for next week (${range})`

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;max-width:640px">
    <img src="https://hr.flaxfoods.in/flax-logo.png" alt="Flax" height="40" style="margin-bottom:12px" />
    <h2 style="margin:0 0 8px">Rosters need your attention</h2>
    <p style="margin:0 0 12px">
      ${empty.length ? `<b>${empty.length} outlet${empty.length === 1 ? ' has' : 's have'} no roster at all</b>` : 'Some outlets have gaps in the roster'}
      for <b>${range}</b>.
    </p>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;margin:0 0 16px;color:#78350f">
      Without a roster, staff don't know their shifts, absences and late arrivals can't be tracked,
      and outlets end up over- or under-staffed. Empty rosters are a leading cause of
      <b>staff attrition and mismanagement</b>. Please fill and publish the week today.
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead>
        <tr style="text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0">
          <th style="padding:6px 8px">Outlet</th>
          <th style="padding:6px 8px;text-align:right">Staff</th>
          <th style="padding:6px 8px;text-align:right">Shifts rostered</th>
          <th style="padding:6px 8px;text-align:right">Published</th>
        </tr>
      </thead>
      <tbody>
        ${gaps
          .map(
            (g) => `
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:6px 8px;font-weight:600">${esc(g.name)}</td>
          <td style="padding:6px 8px;text-align:right">${g.staff}</td>
          <td style="padding:6px 8px;text-align:right;color:${g.filled === 0 ? '#b91c1c' : '#b45309'};font-weight:600">
            ${g.filled} / ${g.needed}${g.filled === 0 ? ' — empty' : ''}
          </td>
          <td style="padding:6px 8px;text-align:right">${g.published}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <p style="margin:20px 0">
      <a href="https://hr.flaxfoods.in/me/team-roster"
         style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">
        Open Team roster →
      </a>
    </p>
    <p style="color:#64748b;font-size:12px;margin:0">
      Also in the Flax HR app: menu → Team roster. You'll get this reminder each morning until every
      outlet's week is rostered and published.
    </p>
  </div>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: to_, cc: CC, subject, html }),
  })
  const body = await r.text().catch(() => '')
  if (!r.ok) return json(502, { error: `resend_${r.status}: ${body.slice(0, 200)}` })
  return json(200, { ok: true, sent: to_.length, outlets_with_gaps: gaps.length, empty: empty.length })
})

// Date `daysAhead` days from today in IST, as YYYY-MM-DD.
function istDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toLocaleDateString('en-CA', { timeZone: IST })
}

function fmt(d: string): string {
  return new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: IST })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
