// Flax HR — Edge function: notify-email
//
// Drains the email queue in core.notifications. Pulls rows where
// email_sent_at IS NULL, sends each via Resend, then stamps
// email_sent_at (or email_error on failure).
//
// Schedule via pg_cron / Supabase scheduled functions every 1 minute.
// If RESEND_API_KEY is unset, the function exits silently — in-app
// notifications still work; email just stays queued.

/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno edge function; types resolved at deploy time.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'noreply@flaxhr.app'
const BATCH_SIZE = Number(Deno.env.get('NOTIFY_BATCH_SIZE') ?? '50')

interface PendingNotification {
  id: string
  recipient_id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  recipient_email: string | null
  recipient_name: string | null
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ ok: false, error: 'missing supabase env' }, 500)
  }
  if (!RESEND_API_KEY) {
    return json({ ok: true, skipped: 'RESEND_API_KEY not set' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  const { data: rows, error } = await supabase
    .schema('core')
    .from('notifications')
    .select(`
      id, recipient_id, type, title, body, data,
      recipient:employees!inner(work_email, full_name)
    `)
    .is('email_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    return json({ ok: false, error: error.message }, 500)
  }
  if (!rows || rows.length === 0) {
    return json({ ok: true, sent: 0 })
  }

  const pending: PendingNotification[] = rows.map((r: any) => ({
    id: r.id,
    recipient_id: r.recipient_id,
    type: r.type,
    title: r.title,
    body: r.body,
    data: r.data ?? {},
    recipient_email: r.recipient?.work_email ?? null,
    recipient_name: r.recipient?.full_name ?? null,
  }))

  let sent = 0
  let failed = 0

  for (const n of pending) {
    if (!n.recipient_email) {
      // No email on file → mark as sent (don't block the queue).
      await supabase
        .schema('core')
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString(), email_error: 'no_recipient_email' })
        .eq('id', n.id)
      continue
    }
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [n.recipient_email],
          subject: n.title,
          text: n.body ?? n.title,
          html: renderHtml(n),
        }),
      })
      if (!resp.ok) {
        const errText = await resp.text()
        await supabase
          .schema('core')
          .from('notifications')
          .update({ email_error: `resend_${resp.status}: ${errText.slice(0, 200)}` })
          .eq('id', n.id)
        failed++
        continue
      }
      await supabase
        .schema('core')
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString(), email_error: null })
        .eq('id', n.id)
      sent++
    } catch (e: any) {
      await supabase
        .schema('core')
        .from('notifications')
        .update({ email_error: String(e?.message ?? e).slice(0, 200) })
        .eq('id', n.id)
      failed++
    }
  }

  return json({ ok: true, sent, failed, scanned: pending.length })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function renderHtml(n: PendingNotification): string {
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
    )
  const greeting = n.recipient_name ? `Hi ${esc(n.recipient_name)},` : 'Hi,'
  const body = (n.body ?? '').split('\n').map(esc).join('<br/>')
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:24px auto;color:#111">
  <p>${greeting}</p>
  <h2 style="margin:8px 0 16px">${esc(n.title)}</h2>
  <div style="line-height:1.55">${body}</div>
  <p style="margin-top:32px;color:#888;font-size:12px">Flax HR · automated notification</p>
</body></html>`
}
