// Image cards for the training WhatsApp messages (rendered with satori).
// Pure layout: no I/O. Picture-first, little text: medals, ticks, bars.

const C = {
  ink: '#14201b',
  sub: '#6b7a73',
  line: '#e1e7e3',
  bg: '#eef2ef',
  card: '#ffffff',
  green: '#16a34a',
  greenSoft: '#dcfce7',
  red: '#b42318',
  head: '#14201b',
  headSub: '#b9c9c1',
}
const MEDAL = [
  { ring: '#d4a017', face: '#fde68a', text: '#7c5800' },
  { ring: '#9ca3af', face: '#f3f4f6', text: '#4b5563' },
  { ring: '#b45309', face: '#fed7aa', text: '#7c2d12' },
]
// Same colours and shapes as the badge medals in the app.
const BADGE = {
  first_pass: {
    name: 'First step',
    ring: '#16a34a',
    face: '#dcfce7',
    ribbon: ['#22c55e', '#15803d'],
    shape: 'circle',
    icon: 'check',
  },
  first_try: {
    name: 'Sharp',
    ring: '#2563eb',
    face: '#dbeafe',
    ribbon: ['#3b82f6', '#1d4ed8'],
    shape: 'hexagon',
    icon: 'bolt',
  },
  perfect: {
    name: 'Perfect score',
    ring: '#d97706',
    face: '#fef3c7',
    ribbon: ['#f59e0b', '#b45309'],
    shape: 'star',
    icon: 'star',
  },
  on_time: {
    name: 'On time',
    ring: '#7c3aed',
    face: '#ede9fe',
    ribbon: ['#8b5cf6', '#6d28d9'],
    shape: 'circle',
    icon: 'clock',
  },
  safety: {
    name: 'Safety star',
    ring: '#0d9488',
    face: '#ccfbf1',
    ribbon: ['#14b8a6', '#0f766e'],
    shape: 'shield',
    icon: 'check',
  },
  all_done: {
    name: 'All done',
    ring: '#b45309',
    face: '#fde68a',
    ribbon: ['#e11d48', '#9f1239'],
    shape: 'crown',
    icon: 'star',
  },
}

// ---------------------------------------------------------------- helpers
const h = (type, style, children) => ({ type, props: { style: { display: 'flex', ...style }, children } })
const el = (type, props, children) => ({ type, props: { ...props, children } })
const text = (s, style) => h('div', style, s)
const short = (o) =>
  ({
    'Santacruz / Kalina': 'Kalina',
    'Andheri East / Marol': 'Marol',
    'Fort / Kalaghoda': 'Kala Ghoda',
    'Bandra / Khar': 'Bandra',
    'Indiranagar - Flax Cafe': 'Indiranagar Café',
    'Head Office': 'Head Office',
  })[o] ??
  o ??
  ''
const rupee = (s) => (s ?? '').replace(/₹\s?/g, 'Rs ')
const first = (n) => (n ?? '').split(' ')[0]
const nameShort = (n) => {
  const p = (n ?? '').split(' ').filter(Boolean)
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : (p[0] ?? '')
}

function starPoints(cx, cy, r1, r2, n) {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1
    const a = (Math.PI * i) / n - Math.PI / 2
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}

// Blue "verified" tick: scalloped badge with a white check.
const BLUE = '#1d74f5'
function rosette(cx, cy, r1, r2, n) {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1
    const a = (Math.PI * i) / n - Math.PI / 2
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

/** Blue verified tick (finished all their training). */
export function tick(size = 34) {
  return el('svg', { width: size, height: size, viewBox: '0 0 24 24' }, [
    el('polygon', {
      points: rosette(12, 12, 12, 10.2, 12),
      fill: BLUE,
      stroke: BLUE,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: 'M7.2 12.4l3.1 3.1 6.5-6.9',
      fill: 'none',
      stroke: '#fff',
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  ])
}

/** Gold / silver / bronze rank disc. */
function rankDisc(rank, size = 56) {
  const m = MEDAL[rank - 1]
  if (!m) {
    return h(
      'div',
      {
        width: size,
        height: size,
        borderRadius: size,
        background: '#f1f5f2',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Barlow Condensed',
        fontSize: size * 0.5,
        color: C.sub,
      },
      String(rank),
    )
  }
  return h(
    'div',
    {
      width: size,
      height: size,
      borderRadius: size,
      background: m.face,
      border: `${Math.round(size / 9)}px solid ${m.ring}`,
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Barlow Condensed',
      fontSize: size * 0.5,
      fontWeight: 700,
      color: m.text,
    },
    String(rank),
  )
}

function iconPath(icon, color) {
  switch (icon) {
    case 'bolt':
      return [el('path', { d: 'M54 28 L38 54 H50 L46 72 L62 44 H50 Z', fill: color })]
    case 'star':
      return [el('polygon', { points: starPoints(50, 49, 17, 7.5, 5), fill: color })]
    case 'clock':
      return [
        el('circle', { cx: 50, cy: 48, r: 16, fill: 'none', stroke: color, 'stroke-width': 5 }),
        el('path', {
          d: 'M50 39 V49 L57 53',
          fill: 'none',
          stroke: color,
          'stroke-width': 5,
          'stroke-linecap': 'round',
        }),
      ]
    default:
      return [
        el('path', {
          d: 'M38 49 L47 58 L63 40',
          fill: 'none',
          stroke: color,
          'stroke-width': 7,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      ]
  }
}

/** Badge medal (same look as the app's BadgeArt). */
export function medal(key, size = 120) {
  const s = BADGE[key] ?? BADGE.first_pass
  let shape
  switch (s.shape) {
    case 'hexagon':
      shape = [
        el('polygon', { points: '50,6 86,27 86,69 50,90 14,69 14,27', fill: s.ring }),
        el('polygon', { points: '50,15 78,31.5 78,64.5 50,81 22,64.5 22,31.5', fill: s.face }),
      ]
      break
    case 'star':
      shape = [
        el('polygon', { points: starPoints(50, 48, 44, 36, 12), fill: s.ring }),
        el('circle', { cx: 50, cy: 48, r: 30, fill: s.face }),
      ]
      break
    case 'shield':
      shape = [
        el('path', { d: 'M50 4 L86 16 V46 C86 68 70 82 50 92 C30 82 14 68 14 46 V16 Z', fill: s.ring }),
        el('path', {
          d: 'M50 13 L78 22.5 V46 C78 63 66 74 50 82.5 C34 74 22 63 22 46 V22.5 Z',
          fill: s.face,
        }),
      ]
      break
    case 'crown':
      shape = [
        el('circle', { cx: 50, cy: 50, r: 40, fill: s.ring }),
        el('circle', { cx: 50, cy: 50, r: 32, fill: s.face }),
        el('polygon', { points: '30,14 38,4 44,12 50,1 56,12 62,4 70,14', fill: s.ring }),
      ]
      break
    default:
      shape = [
        el('circle', { cx: 50, cy: 48, r: 42, fill: s.ring }),
        el('circle', { cx: 50, cy: 48, r: 34, fill: s.face }),
      ]
  }
  return el('svg', { width: size, height: size * 1.2, viewBox: '0 0 100 120' }, [
    el('path', { d: 'M30 74 L22 116 L36 108 L44 118 L50 80 Z', fill: s.ribbon[0] }),
    el('path', { d: 'M70 74 L78 116 L64 108 L56 118 L50 80 Z', fill: s.ribbon[1] }),
    ...shape,
    ...iconPath(s.icon, s.ring),
  ])
}

function frame(head, body, foot) {
  return h(
    'div',
    { width: 1080, flexDirection: 'column', background: C.bg, padding: 32, fontFamily: 'Barlow' },
    [
      h(
        'div',
        {
          flexDirection: 'column',
          background: C.card,
          borderRadius: 28,
          overflow: 'hidden',
          border: `2px solid ${C.line}`,
        },
        [head, h('div', { flexDirection: 'column', padding: '34px 40px 36px', gap: 30 }, body), foot],
      ),
    ],
  )
}

function header(kicker, title, right) {
  return h(
    'div',
    {
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      background: C.head,
      padding: '30px 40px 28px',
    },
    [
      h('div', { flexDirection: 'column', gap: 4 }, [
        text(kicker, { fontSize: 22, fontWeight: 600, letterSpacing: 3, color: '#86efac' }),
        text(title, {
          fontFamily: 'Barlow Condensed',
          fontSize: 60,
          fontWeight: 700,
          color: '#fff',
          lineHeight: 1,
        }),
      ]),
      right ? text(right, { fontSize: 26, color: C.headSub, paddingBottom: 6 }) : null,
    ].filter(Boolean),
  )
}

function footer(left, right) {
  return h(
    'div',
    {
      justifyContent: 'space-between',
      alignItems: 'center',
      background: '#f7faf8',
      borderTop: `2px solid ${C.line}`,
      padding: '20px 40px',
      fontSize: 24,
      color: C.sub,
    },
    [h('div', { alignItems: 'center', gap: 10 }, left), text(right, { color: C.sub })],
  )
}

const sectionTitle = (s) => text(s, { fontSize: 22, fontWeight: 700, letterSpacing: 2.5, color: C.sub })

function stat(value, label, opts = {}) {
  return h(
    'div',
    {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      background: opts.bg ?? '#f6f8f7',
      borderRadius: 20,
      padding: '20px 10px',
    },
    [
      h(
        'div',
        { alignItems: 'center', gap: 10 },
        [
          opts.icon ?? null,
          text(String(value), {
            fontFamily: 'Barlow Condensed',
            fontSize: 68,
            fontWeight: 700,
            color: opts.color ?? C.ink,
            lineHeight: 1,
          }),
        ].filter(Boolean),
      ),
      text(label, { fontSize: 22, fontWeight: 600, color: C.sub }),
    ],
  )
}

// ---------------------------------------------------------------- weekly
export function weeklyCard(s, range) {
  const top = (s.top_week ?? []).slice(0, 5)
  const podium = (s.month_top ?? []).slice(0, 3)
  const all = (s.outlets ?? []).filter((o) => o.assigned > 0)
  const outlets = all.filter((o) => Math.round(o.completion ?? 0) > 0)
  const zero = all.filter((o) => Math.round(o.completion ?? 0) === 0)
  const body = [
    h('div', { gap: 16 }, [
      stat(s.passed, 'modules passed'),
      stat(s.learners, s.learners === 1 ? 'learner' : 'learners'),
      stat(s.all_done ?? 0, 'finished all', { icon: tick(44), color: BLUE, bg: '#eef5ff' }),
      stat(s.not_started, 'not started', { color: C.red, bg: '#fff4f2' }),
    ]),
  ]
  if (top.length) {
    body.push(
      h('div', { flexDirection: 'column', gap: 14 }, [
        sectionTitle('TOP LEARNERS THIS WEEK'),
        ...top.map((p, i) =>
          h(
            'div',
            {
              alignItems: 'center',
              gap: 20,
              padding: '10px 18px',
              borderRadius: 18,
              background: i === 0 ? '#fffbeb' : '#f8faf9',
            },
            [
              rankDisc(i + 1, 58),
              h('div', { flex: 1, flexDirection: 'column' }, [
                h(
                  'div',
                  { alignItems: 'center', gap: 12 },
                  [
                    text(p.name, { fontSize: 34, fontWeight: 700, color: C.ink }),
                    p.done ? tick(32) : null,
                  ].filter(Boolean),
                ),
                text(short(p.outlet), { fontSize: 22, color: C.sub }),
              ]),
              h('div', { alignItems: 'baseline', gap: 6 }, [
                text(String(p.points), {
                  fontFamily: 'Barlow Condensed',
                  fontSize: 50,
                  fontWeight: 700,
                  color: C.ink,
                }),
                text('pts', { fontSize: 22, color: C.sub }),
              ]),
            ],
          ),
        ),
      ]),
    )
  }
  if (podium.length) {
    body.push(
      h('div', { flexDirection: 'column', gap: 14 }, [
        sectionTitle(`${(s.monthName ?? '').toUpperCase()} PRIZE RACE`),
        h(
          'div',
          { gap: 16 },
          podium.map((p) =>
            h(
              'div',
              {
                flex: 1,
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '18px 12px',
                borderRadius: 20,
                border: `3px solid ${MEDAL[p.rank - 1].ring}`,
                background: MEDAL[p.rank - 1].face + '55',
              },
              [
                rankDisc(p.rank, 64),
                h(
                  'div',
                  { alignItems: 'center', gap: 8 },
                  [
                    text(nameShort(p.name), { fontSize: 30, fontWeight: 700, color: C.ink }),
                    p.done ? tick(28) : null,
                  ].filter(Boolean),
                ),
                text(`${p.points} pts`, { fontSize: 24, color: C.sub }),
                p.prize
                  ? text(rupee(p.prize), {
                      fontSize: 22,
                      fontWeight: 700,
                      color: MEDAL[p.rank - 1].text,
                      background: '#fff',
                      borderRadius: 999,
                      padding: '4px 14px',
                    })
                  : null,
              ].filter(Boolean),
            ),
          ),
        ),
      ]),
    )
  }
  if (all.length) {
    body.push(
      h(
        'div',
        { flexDirection: 'column', gap: 12 },
        [
          sectionTitle('OUTLETS · MODULES DONE'),
          ...outlets.map((o) => {
            const pct = Math.round(o.completion ?? 0)
            return h('div', { alignItems: 'center', gap: 16 }, [
              text(short(o.outlet), { width: 230, fontSize: 26, fontWeight: 600, color: C.ink }),
              h('div', { flex: 1, height: 26, background: '#eef2ef', borderRadius: 13 }, [
                h('div', {
                  width: `${Math.max(pct, 2)}%`,
                  height: 26,
                  borderRadius: 13,
                  background: pct >= 80 ? C.green : pct >= 30 ? '#f59e0b' : '#ef4444',
                }),
              ]),
              text(`${pct}%`, {
                width: 80,
                justifyContent: 'flex-end',
                fontFamily: 'Barlow Condensed',
                fontSize: 32,
                fontWeight: 700,
                color: C.ink,
              }),
            ])
          }),
          zero.length
            ? h(
                'div',
                {
                  alignItems: 'center',
                  gap: 14,
                  marginTop: 4,
                  padding: '14px 18px',
                  borderRadius: 16,
                  background: '#fff4f2',
                },
                [
                  text(String(zero.length), {
                    fontFamily: 'Barlow Condensed',
                    fontSize: 40,
                    fontWeight: 700,
                    color: C.red,
                  }),
                  h('div', { flexDirection: 'column' }, [
                    text(`${zero.length === 1 ? 'outlet' : 'outlets'} not started`, {
                      fontSize: 24,
                      fontWeight: 700,
                      color: C.red,
                    }),
                    text(zero.map((o) => short(o.outlet)).join(' · '), { fontSize: 22, color: C.sub }),
                  ]),
                ],
              )
            : null,
        ].filter(Boolean),
      ),
    )
  }
  return frame(
    header('FLAX TRAINING', 'Weekly summary', range),
    body,
    footer([tick(26), text('= finished all their training', {})], 'hr.flaxfoods.in'),
  )
}

// ---------------------------------------------------------------- winners
export function winnersCard(w, monthName) {
  const ws = w.winners ?? []
  const byRank = (r) => ws.find((x) => x.rank === r)
  const col = (p, height) =>
    p
      ? h('div', { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 10 }, [
          rankDisc(p.rank, p.rank === 1 ? 110 : 88),
          text(first(p.name), {
            fontFamily: 'Barlow Condensed',
            fontSize: p.rank === 1 ? 56 : 46,
            fontWeight: 700,
            color: C.ink,
          }),
          text(short(p.outlet), { fontSize: 24, color: C.sub }),
          h(
            'div',
            {
              width: '100%',
              height,
              marginTop: 6,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 8,
              paddingTop: 22,
              borderRadius: '20px 20px 0 0',
              background: MEDAL[p.rank - 1].face,
              borderTop: `8px solid ${MEDAL[p.rank - 1].ring}`,
            },
            [
              text(`${p.points} pts`, {
                fontFamily: 'Barlow Condensed',
                fontSize: 44,
                fontWeight: 700,
                color: MEDAL[p.rank - 1].text,
              }),
              p.prize
                ? text(rupee(p.prize), {
                    fontSize: 24,
                    fontWeight: 700,
                    color: C.ink,
                    background: '#fff',
                    borderRadius: 999,
                    padding: '6px 18px',
                  })
                : null,
            ].filter(Boolean),
          ),
        ])
      : h('div', { flex: 1 }, [])
  const body = ws.length
    ? [
        h('div', { alignItems: 'flex-end', gap: 18, paddingTop: 10 }, [
          col(byRank(2), 220),
          col(byRank(1), 300),
          col(byRank(3), 170),
        ]),
        text(`Well done! ${w.learners} people scored points and ${w.passed} modules were passed.`, {
          justifyContent: 'center',
          fontSize: 28,
          color: C.sub,
        }),
      ]
    : [
        text('No winners this month: nobody passed a module.', {
          justifyContent: 'center',
          fontSize: 30,
          color: C.sub,
          padding: 40,
        }),
      ]
  return frame(
    header('FLAX TRAINING', `${monthName} winners`, null),
    body,
    footer(
      [text('Congratulations to our top learners!', { fontWeight: 600, color: C.ink })],
      'hr.flaxfoods.in',
    ),
  )
}

// ---------------------------------------------------------------- badge
export function badgeCard(p, level) {
  const keys = (p.keys ?? []).filter((k) => BADGE[k])
  const main = keys[keys.length - 1]
  const extra = keys.slice(0, -1)
  const chips = [
    { t: `${(p.points ?? 0).toLocaleString('en-IN')} pts`, bg: '#f1f5f2', c: C.ink },
    p.month_rank
      ? {
          t: `#${p.month_rank} this month`,
          bg: p.month_rank <= 3 ? '#fef3c7' : '#f1f5f2',
          c: p.month_rank <= 3 ? '#92400e' : C.ink,
        }
      : null,
    level ? { t: `${level} level`, bg: '#ede9fe', c: '#5b21b6' } : null,
  ].filter(Boolean)
  const body = [
    h('div', { flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 6 }, [
      main ? medal(main, 230) : rankDisc(1, 200),
      text(`Well done, ${p.first_name}!`, {
        fontFamily: 'Barlow Condensed',
        fontSize: 64,
        fontWeight: 700,
        color: C.ink,
        marginTop: 6,
      }),
      main
        ? h(
            'div',
            { alignItems: 'center', gap: 12 },
            [
              text('You earned', { fontSize: 34, color: C.sub }),
              text(BADGE[main].name, { fontSize: 38, fontWeight: 700, color: BADGE[main].ring }),
              main === 'all_done' ? tick(40) : null,
            ].filter(Boolean),
          )
        : text(`You reached ${level} level`, { fontSize: 36, fontWeight: 700, color: '#5b21b6' }),
    ]),
  ]
  if (extra.length) {
    body.push(
      h(
        'div',
        { justifyContent: 'center', gap: 28 },
        extra.map((k) =>
          h('div', { flexDirection: 'column', alignItems: 'center', gap: 4 }, [
            medal(k, 90),
            text(BADGE[k].name, { fontSize: 22, fontWeight: 600, color: C.sub }),
          ]),
        ),
      ),
    )
  }
  body.push(
    h(
      'div',
      { justifyContent: 'center', gap: 14 },
      chips.map((c) =>
        text(c.t, {
          fontSize: 28,
          fontWeight: 700,
          color: c.c,
          background: c.bg,
          borderRadius: 999,
          padding: '10px 24px',
        }),
      ),
    ),
  )
  const left =
    p.assigned > p.passed
      ? `${p.assigned - p.passed} more ${p.assigned - p.passed === 1 ? 'module' : 'modules'} to go`
      : 'All your training done'
  return frame(
    header('FLAX TRAINING', 'New badge', null),
    body,
    footer([text(left, { fontWeight: 600, color: C.ink })], 'Training in the Flax HR app'),
  )
}

export const BADGE_NAMES = Object.fromEntries(Object.entries(BADGE).map(([k, v]) => [k, v.name]))
