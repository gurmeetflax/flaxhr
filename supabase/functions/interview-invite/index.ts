// Interview invite — emails a calendar invite (.ics) with the Meet link.
//
// Called from the Hiring page with the signed-in admin/HR user's JWT:
//   supabase.functions.invoke('interview-invite', { body: { candidate_id } })
// Sends one email to the candidate and the director (Gurmeet) with an
// .ics attachment that adds the interview to their calendars, then
// stamps candidates.invite_sent_at. Needs RESEND_API_KEY.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime; TS server here isn't configured for it.
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Flax HR <hr@flaxfoods.in>'
const DIRECTOR = { name: 'Gurmeet', email: 'gurmeet@flaxitup.com' }
const CC = ['hr@flaxitup.com']
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  if (!RESEND_API_KEY) return json(500, { error: 'Email isn\'t set up yet (RESEND_API_KEY missing). Download the .ics instead.' })

  const body = await req.json().catch(() => ({}))
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: c, error } = await userClient
    .from('v_candidates')
    .select('id, full_name, email, interview_at, interview_minutes, meet_link, role_title')
    .eq('id', body.candidate_id ?? '')
    .maybeSingle()
  if (error) return json(403, { error: error.message })
  if (!c) return json(404, { error: 'candidate not found or not allowed' })
  if (!c.interview_at) return json(400, { error: 'Set the interview date and time first.' })
  if (!c.email) return json(400, { error: 'Add the candidate\'s email first.' })

  const start = new Date(c.interview_at)
  const end = new Date(start.getTime() + (c.interview_minutes ?? 30) * 60_000)
  const title = `Flax interview: ${c.full_name ?? 'Candidate'} — ${c.role_title}`
  const ics = buildIcs({
    uid: `interview-${c.id}@hr.flaxfoods.in`,
    start,
    end,
    title,
    description: `Interview for ${c.role_title} at Flax Healthy Living.${c.meet_link ? `\nJoin: ${c.meet_link}` : ''}`,
    location: c.meet_link ?? 'Flax Head Office',
    organizer: DIRECTOR,
    attendees: [
      { name: c.full_name ?? 'Candidate', email: c.email },
      DIRECTOR,
    ],
  })

  const when = start.toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;max-width:560px">
    <img src="https://hr.flaxfoods.in/flax-logo.png" alt="Flax" height="40" style="margin-bottom:12px" />
    <p>Hi ${esc(c.full_name ?? 'there')},</p>
    <p>Thank you for applying for <b>${esc(c.role_title)}</b> at Flax Healthy Living. We'd like to invite you to an interview with ${DIRECTOR.name}, our director.</p>
    <p><b>When:</b> ${esc(when)} (IST), ${c.interview_minutes ?? 30} minutes<br>
       ${c.meet_link ? `<b>Where:</b> Google Meet — <a href="${esc(c.meet_link)}">${esc(c.meet_link)}</a>` : '<b>Where:</b> Flax Head Office'}</p>
    <p>The attached invite adds this to your calendar. Please reply to this email if you need to change the time.</p>
    <p>Best regards,<br>Flax HR</p>
  </div>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [c.email, DIRECTOR.email],
      cc: CC,
      reply_to: DIRECTOR.email,
      subject: title,
      html,
      attachments: [{ filename: 'interview.ics', content: btoa(unescape(encodeURIComponent(ics))), content_type: 'text/calendar; method=REQUEST' }],
    }),
  })
  const text = await r.text().catch(() => '')
  if (!r.ok) return json(502, { error: `Email failed (${r.status}): ${text.slice(0, 200)}` })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  await sb.schema('core').from('candidates').update({ invite_sent_at: new Date().toISOString() }).eq('id', c.id)
  return json(200, { ok: true })
})

// Minimal RFC 5545 invite.
function buildIcs(e: {
  uid: string
  start: Date
  end: Date
  title: string
  description: string
  location: string
  organizer: { name: string; email: string }
  attendees: { name: string; email: string }[]
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const txt = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flax HR//Hiring//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(e.start)}`,
    `DTEND:${fmt(e.end)}`,
    `SUMMARY:${txt(e.title)}`,
    `DESCRIPTION:${txt(e.description)}`,
    `LOCATION:${txt(e.location)}`,
    `ORGANIZER;CN=${txt(e.organizer.name)}:mailto:${e.organizer.email}`,
    ...e.attendees.map((a) => `ATTENDEE;CN=${txt(a.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a.email}`),
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } })
}
