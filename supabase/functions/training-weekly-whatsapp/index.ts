// training-weekly-whatsapp: posts the weekly training leaderboard summary to
// the Core Managers WhatsApp group through Whapi. A Monday pg_cron job calls it
// (public.training_send_weekly_summary).
//
// Secrets: WHAPI_TOKEN (shared with complaint-whatsapp). WHAPI_HR_GROUP
// overrides the group; the default is "Flax Core Managers Mumbai".
// Body: {} send · {"dry_run": true} return the text only ·
//       {"test_to": "<chat id>"} send to one chat instead ·
//       {"list_groups": "hr"} find group ids by name.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const WHAPI = 'https://gate.whapi.cloud'
const TOKEN = Deno.env.get('WHAPI_TOKEN') ?? ''
const GROUP = Deno.env.get('WHAPI_HR_GROUP') || '120363148288288313@g.us'
const APP = 'https://hr.flaxfoods.in/admin/training'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

type Person = { name: string; outlet: string | null; points: number; passed?: number }
type Summary = {
  from: string
  to: string
  month: string
  staff: number
  passed: number
  learners: number
  attempts: number
  active: number
  completion: number | null
  overdue_people: number
  overdue_modules: number
  not_started: number
  top_week: Person[]
  month_top: (Person & { rank: number; prize: string | null })[]
  most_overdue: { name: string; outlet: string | null; overdue: number }[]
  outlets: {
    outlet: string
    staff: number
    passed: number
    assigned: number
    completion: number | null
    overdue: number
  }[]
}

const SHORT: Record<string, string> = {
  'Santacruz / Kalina': 'Kalina',
  'Andheri East / Marol': 'Marol',
  'Fort / Kalaghoda': 'Kala Ghoda',
  'Bandra / Khar': 'Bandra',
  'Indiranagar - Flax Cafe': 'Indiranagar Café',
}
const short = (o: string | null) => (o ? (SHORT[o] ?? o) : '')
const day = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  )
const monthName = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

function render(s: Summary): string {
  const L: string[] = []
  L.push(`*Flax training · weekly summary*`)
  L.push(`${day(s.from)} – ${day(s.to)}`)
  L.push('')
  L.push(
    `${plural(s.passed, 'module')} passed by ${plural(s.learners, 'person')}`.replace('persons', 'people') +
      ` · ${plural(s.attempts, 'quiz attempt')}`,
  )
  L.push(`${s.active} of ${s.staff} staff active this week · ${s.not_started} not started yet`)
  L.push(
    `Company completion ${s.completion ?? 0}% · ${s.overdue_modules ? `${plural(s.overdue_modules, 'module')} overdue (${plural(s.overdue_people, 'person')})`.replace('persons', 'people') : 'nothing overdue'}`,
  )

  L.push('')
  L.push('*Top learners this week*')
  if (s.top_week.length) {
    s.top_week.forEach((p, i) =>
      L.push(
        `${i + 1}. ${p.name}${p.outlet ? ` (${short(p.outlet)})` : ''}: ${p.points} pts, ${plural(p.passed ?? 0, 'module')}`,
      ),
    )
  } else L.push('Nobody passed a module this week.')

  L.push('')
  L.push(`*${monthName(s.month)} prizes so far*`)
  const medal = ['🥇', '🥈', '🥉']
  if (s.month_top.length) {
    s.month_top.forEach((p) =>
      L.push(
        `${medal[p.rank - 1] ?? p.rank + '.'} ${p.name}${p.outlet ? ` (${short(p.outlet)})` : ''}: ${p.points} pts${p.prize ? ` · ${p.prize}` : ''}`,
      ),
    )
  } else L.push('No points yet this month.')

  L.push('')
  L.push('*Outlets: modules done / assigned*')
  for (const o of s.outlets) {
    L.push(
      `${short(o.outlet)}: ${o.passed}/${o.assigned} (${Math.round(o.completion ?? 0)}%)${o.overdue ? ` · ${o.overdue} overdue` : ''}`,
    )
  }

  if (s.most_overdue.length) {
    L.push('')
    L.push('*Most overdue*')
    s.most_overdue.forEach((p) =>
      L.push(`${p.name}${p.outlet ? ` (${short(p.outlet)})` : ''}: ${plural(p.overdue, 'module')}`),
    )
  }

  L.push('')
  L.push(`Full scores: ${APP}`)
  return L.join('\n')
}

async function sendText(to: string, body: string) {
  const r = await fetch(WHAPI + '/messages/text', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, body }),
  })
  if (!r.ok) throw new Error('Whapi ' + r.status + ': ' + (await r.text()).slice(0, 200))
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    /* empty body */
  }

  if (body.list_groups) {
    if (!TOKEN) return json({ ok: false, error: 'WHAPI_TOKEN secret not set' }, 500)
    const out: { id: string; name: string }[] = []
    for (let offset = 0; offset < 1000; offset += 100) {
      const r = await fetch(`${WHAPI}/groups?count=100&offset=${offset}`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
      })
      const page = ((await r.json()).groups ?? []) as { id: string; name: string }[]
      out.push(...page.map((g) => ({ id: g.id, name: g.name })))
      if (page.length < 100) break
    }
    const q = String(body.list_groups).toLowerCase()
    return json({
      ok: true,
      groups: out.filter((g) => q === 'true' || (g.name ?? '').toLowerCase().includes(q)),
    })
  }

  const { data, error } = await admin.rpc('training_weekly_summary', { p_days: 7 })
  if (error) return json({ ok: false, error: error.message }, 500)
  const text = render(data as Summary)
  if (body.dry_run) return json({ ok: true, dry_run: true, text })

  const to = body.test_to ? String(body.test_to) : GROUP
  if (!TOKEN) return json({ ok: false, error: 'WHAPI_TOKEN secret not set' }, 500)
  if (!to) return json({ ok: false, error: 'WHAPI_HR_GROUP secret not set' }, 500)
  try {
    await sendText(to, text)
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
  return json({ ok: true, sent_to: body.test_to ? 'test' : 'hr_group' })
})
