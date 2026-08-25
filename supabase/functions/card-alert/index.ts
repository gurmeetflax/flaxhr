// Card alert — invoked from a Postgres trigger via pg_net whenever a new
// row lands in core.cards. Sends a Slack message to SLACK_WEBHOOK_URL
// and (if the employee has a personal email) an email via Resend.
//
// Toggle each channel via core.app_settings.card_settings:
//   { "alert_slack": true, "alert_email": true }
//
// Deployed with --no-verify-jwt so the DB trigger can call it without a
// service-role token. Function itself uses service_role to read.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Flax HR <hr@flaxfoods.in>'
const RESEND_CC = [
  'hr@flaxitup.com',
  'gurmeet@flaxitup.com',
  'operations@flaxitup.com',
  'am@flaxitup.com',
]

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const body = await req.json().catch(() => ({} as any))
  const cardId: string | undefined = body?.card_id
  if (!cardId) return json(400, { error: 'card_id_required' })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: card, error: cardErr } = await sb
    .from('v_cards')
    .select(
      'id, colour, reason_code, reason_title, reason_category, incident_date, source, notes, evidence_path, expires_at, employee_id, employee_code, employee_name, outlet_name',
    )
    .eq('id', cardId)
    .maybeSingle()
  if (cardErr || !card) {
    return json(404, { error: cardErr?.message ?? 'card_not_found' })
  }

  const { data: settings } = await sb.rpc('get_app_setting', { p_key: 'card_settings' })
  const cfg = (settings as any) ?? {}
  const alertSlack = cfg?.alert_slack !== false
  const alertEmail = cfg?.alert_email !== false

  const { data: emp } = await sb
    .from('v_employees')
    .select('personal_email, phone')
    .eq('id', card.employee_id)
    .maybeSingle()

  const emoji = card.colour === 'red' ? '🔴' : card.colour === 'green' ? '🟢' : '🟡'
  const colourLabel = card.colour[0].toUpperCase() + card.colour.slice(1)
  const dateStr = new Date(card.incident_date + 'T00:00:00+05:30').toLocaleDateString(
    'en-GB',
    { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' },
  )

  const slackText = [
    `${emoji} *${colourLabel} card issued* — ${card.reason_title}`,
    `*Employee:* ${card.employee_name} (${card.employee_code})`,
    card.outlet_name ? `*Outlet:* ${card.outlet_name}` : null,
    `*Date:* ${dateStr}${card.source === 'auto' ? '  ·  (auto)' : ''}`,
    card.notes ? `*Notes:* ${card.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const results: Record<string, unknown> = {}

  if (alertSlack && SLACK_WEBHOOK_URL) {
    const r = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: slackText }),
    })
    results.slack = { ok: r.ok, status: r.status }
  } else {
    results.slack = { skipped: true }
  }

  if (alertEmail && RESEND_API_KEY && emp?.personal_email) {
    const subject = `${colourLabel} card — ${card.reason_title}`
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 12px">${emoji} ${colourLabel} card issued</h2>
        <p><strong>Reason:</strong> ${escapeHtml(card.reason_title)}</p>
        ${card.outlet_name ? `<p><strong>Outlet:</strong> ${escapeHtml(card.outlet_name)}</p>` : ''}
        <p><strong>Incident date:</strong> ${dateStr}</p>
        ${card.notes ? `<p><strong>Notes:</strong> ${escapeHtml(card.notes)}</p>` : ''}
        <p style="color:#475569;margin-top:24px">
          If you believe this card was issued in error, reply to this email or raise a grievance in the app.
        </p>
      </div>
    `
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [emp.personal_email],
        cc: RESEND_CC,
        subject,
        html,
      }),
    })
    const respBody = await r.text().catch(() => '')
    results.email = { ok: r.ok, status: r.status, to: emp.personal_email, body: respBody.slice(0, 200) }
  } else {
    results.email = { skipped: true, reason: emp?.personal_email ? 'disabled_or_no_key' : 'no_email' }
  }

  return json(200, { ok: true, card_id: cardId, ...results })
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
