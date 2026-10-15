// Auto roster: fills an outlet's week from its staffing needs.
//
// Pure functions only (no Supabase) so the rules can be tested and the
// result previewed before anything is saved. The page loads the data,
// calls generateRoster(), shows the draft and warnings, and saves the
// entries as 'planned' for the manager to adjust and publish.
//
// It is a weekly roster: each person works one shift all week and has one
// week off. Rules, in order:
//  1. Cells already filled (any status) and approved leave are kept; a
//     person with filled shift days keeps that shift for the week.
//  2. Shifts are given out to cover the week's busy-hour needs per role
//     group: the shift that covers the most uncovered need goes first.
//  3. Every shift gets an experienced person (a lead role, or senior_months
//     at Flax); new joiners go into shifts that already have one.
//  4. Closing shifts go to whoever has had the fewest recently.
//  5. Staff left after needs are met join the busiest shift for their role.
//  6. Week offs: never on the outlet's busiest days, at most max_off_per_day
//     a day, on the day the person's absence leaves the least gap, not
//     taking a shift's only lead away, rotating from last week.

export type RosterGroup = 'kitchen' | 'service' | 'barista' | 'management' | 'support' | 'office'

export const GROUP_LABEL: Record<RosterGroup, string> = {
  kitchen: 'Kitchen',
  service: 'Service',
  barista: 'Barista',
  management: 'Management',
  support: 'Support',
  office: 'Office',
}

export interface StaffInput {
  id: string
  name: string
  group: RosterGroup | null
  isLead: boolean
  monthsAtFlax: number | null
  /** Shifts this person is assigned to; empty = any shift. */
  shiftIds: string[]
  /** Last 4 weeks: closing shifts and busy-day shifts worked. */
  closingCount: number
  busyDayCount: number
  /** Weekday (0 = Sunday) of their most recent week off, if any. */
  lastOffWeekday: number | null
}

export interface ShiftInput {
  id: string
  name: string
  start_time: string // "HH:MM:SS"
  end_time: string
  days_of_week: number[]
}

export interface NeedInput {
  weekday: number // 0 = Sunday
  block_start: string
  block_end: string
  roster_group: RosterGroup
  headcount: number
}

export interface RulesInput {
  busiestDays: number[]
  maxOffPerDay: number
  seniorMonths: number
  newJoinerMonths: number
}

export type LockedCell =
  | { kind: 'shift'; shiftId: string | null }
  | { kind: 'off' }
  | { kind: 'leave' }
  | { kind: 'past' } // day already gone: never filled

export interface DraftEntry {
  employeeId: string
  date: string
  shiftId: string | null
  off: boolean
  reason: string
}

export interface ShortfallLine {
  date: string
  group: RosterGroup
  from: number // minutes
  to: number
  short: number
  /** Nobody of this role on duty at all. */
  empty: boolean
}

export interface StaffingGap {
  group: RosterGroup
  neededHours: number // person-hours of need this week
  shortHours: number // person-hours not covered
  /** Rough extra people needed to cover it (6 days × shift length each). */
  extraPeople: number
}

export interface RosterDraft {
  entries: DraftEntry[]
  warnings: string[]
  shortfalls: ShortfallLine[]
  gaps: StaffingGap[]
  /** Shifts whose saved times looked like an AM/PM mix-up. */
  adjustedShifts: { id: string; name: string; used: string }[]
}

interface NormShift {
  id: string
  name: string
  start: number // minutes from midnight
  end: number // > start, may pass 1440
  days: Set<number>
  closing: boolean
}

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export const hhmm = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Shift templates were sometimes saved with 12-hour times ("08:30–05:30"
// meaning 8:30am–5:30pm). Read them the way they were meant.
export function normaliseShift(s: ShiftInput): NormShift & { adjusted: boolean } {
  let start = minutes(s.start_time)
  let end = minutes(s.end_time)
  let adjusted = false
  if (start < 6 * 60 && !/night/i.test(s.name)) {
    start += 720
    end += 720
    adjusted = true
  }
  if (end <= start) end += 1440
  if (end - start > 14 * 60 && end - 720 > start) {
    end -= 720
    adjusted = true
  }
  return {
    id: s.id,
    name: s.name.trim(),
    start,
    end,
    days: new Set(s.days_of_week?.length ? s.days_of_week : [0, 1, 2, 3, 4, 5, 6]),
    closing: end >= 22 * 60,
    adjusted,
  }
}

const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay()

export function generateRoster(input: {
  days: string[] // 7 ISO dates
  staff: StaffInput[]
  shifts: ShiftInput[]
  needs: NeedInput[]
  rules: RulesInput
  locked: Map<string, LockedCell> // `${employeeId}|${date}`
}): RosterDraft {
  const { days, staff, needs, rules, locked } = input
  const warnings: string[] = []
  const entries: DraftEntry[] = []
  const shortfalls: ShortfallLine[] = []
  const shifts = input.shifts.map(normaliseShift)
  const adjustedShifts = shifts
    .filter((s) => s.adjusted)
    .map((s) => ({ id: s.id, name: s.name, used: `${hhmm(s.start)}–${hhmm(s.end)}` }))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const busiest = new Set(rules.busiestDays)
  const key = (e: string, d: string) => `${e}|${d}`

  const isSenior = (p: StaffInput) => p.isLead || (p.monthsAtFlax ?? 0) >= rules.seniorMonths
  const isNew = (p: StaffInput) => p.monthsAtFlax != null && p.monthsAtFlax < rules.newJoinerMonths

  // Hourly need per day and group: hour index 0..47 (overnight blocks run past 24).
  const needAt = new Map<string, number[]>() // `${dayIdx}|${group}` → per hour
  const groupsNeeded = new Set<RosterGroup>()
  days.forEach((date, di) => {
    const wd = weekdayOf(date)
    for (const n of needs.filter((x) => x.weekday === wd && x.headcount > 0)) {
      const from = minutes(n.block_start)
      let to = minutes(n.block_end)
      if (to <= from) to += 1440
      const k = `${di}|${n.roster_group}`
      const arr = needAt.get(k) ?? Array<number>(48).fill(0)
      for (let h = Math.floor(from / 60); h < Math.ceil(to / 60) && h < 48; h++)
        arr[h] = Math.max(arr[h], n.headcount)
      needAt.set(k, arr)
      groupsNeeded.add(n.roster_group)
    }
  })
  const dayDemand = (di: number, g: RosterGroup | null) =>
    g ? (needAt.get(`${di}|${g}`) ?? []).reduce((a, b) => a + b, 0) : 0
  const hoursOf = (s: NormShift) => {
    const out: number[] = []
    for (let h = Math.floor(s.start / 60); h < Math.ceil(s.end / 60) && h < 48; h++) out.push(h)
    return out
  }

  const canDo = (p: StaffInput, s: NormShift) => !p.shiftIds.length || p.shiftIds.includes(s.id)
  const runsOn = (s: NormShift, di: number) => s.days.has(weekdayOf(days[di]))

  // Days each person can work this week (not on leave, not already filled).
  const freeDays = new Map<string, number[]>()
  for (const p of staff)
    freeDays.set(
      p.id,
      days.flatMap((d, di) => (locked.has(key(p.id, d)) ? [] : [di])),
    )

  // Cover per day × group × hour, from people on duty.
  const cover = new Map<string, number[]>()
  const coverOf = (di: number, g: RosterGroup) => {
    const k = `${di}|${g}`
    let a = cover.get(k)
    if (!a) cover.set(k, (a = Array<number>(48).fill(0)))
    return a
  }
  const needOf = (di: number, g: RosterGroup) => needAt.get(`${di}|${g}`) ?? Array<number>(48).fill(0)
  const addCover = (p: StaffInput, s: NormShift, di: number, by: number) => {
    if (!p.group || !runsOn(s, di)) return
    const c = coverOf(di, p.group)
    for (const h of hoursOf(s)) c[h] += by
  }

  // ── 1. One shift per person for the whole week ────────────────────────
  const weekly = new Map<string, NormShift>() // employee → shift
  const crew = new Map<string, StaffInput[]>() // shift → people on it this week
  const join = (p: StaffInput, s: NormShift) => {
    weekly.set(p.id, s)
    crew.set(s.id, [...(crew.get(s.id) ?? []), p])
  }

  // Cells already filled count as cover; someone with filled shift days keeps that shift.
  for (const p of staff) {
    const counts = new Map<string, number>()
    days.forEach((d, di) => {
      const l = locked.get(key(p.id, d))
      if (l?.kind === 'shift' && l.shiftId && shiftById.has(l.shiftId)) {
        addCover(p, shiftById.get(l.shiftId)!, di, 1)
        counts.set(l.shiftId, (counts.get(l.shiftId) ?? 0) + 1)
      }
    })
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) join(p, shiftById.get(top[0])!)
  }

  const weekGain = (p: StaffInput, s: NormShift) => {
    if (!p.group) return 0
    let g = 0
    for (const di of freeDays.get(p.id)!) {
      if (!runsOn(s, di)) continue
      const need = needOf(di, p.group)
      const c = coverOf(di, p.group)
      // An hour nobody covers counts three times an extra pair of hands,
      // so small teams cover opening to closing before doubling the rush.
      for (const h of hoursOf(s)) if (need[h] > c[h]) g += c[h] === 0 ? 3 : 1
    }
    return g
  }
  const busyShare = (s: NormShift) => (busiest.size ? s.days.size : 0)
  const load = (p: StaffInput, s: NormShift) =>
    (s.closing ? p.closingCount : 0) + (busyShare(s) ? p.busyDayCount / 4 : 0)
  const pickPerson = (pool: StaffInput[], s: NormShift) => {
    const able = pool.filter((p) => canDo(p, s))
    if (!able.length) return undefined
    const hasSenior = (crew.get(s.id) ?? []).some(isSenior)
    const score = (p: StaffInput) =>
      (!hasSenior ? (isSenior(p) ? 0 : 100) : isNew(p) ? 0 : isSenior(p) ? 20 : 10) + load(p, s)
    return able.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))[0]
  }
  const assignWeek = (p: StaffInput, s: NormShift) => {
    join(p, s)
    for (const di of freeDays.get(p.id)!) addCover(p, s, di, 1)
  }

  const weekDemand = (g: RosterGroup) => days.reduce((a, _d, di) => a + dayDemand(di, g), 0)
  const unassigned = staff.filter((p) => !weekly.has(p.id) && freeDays.get(p.id)!.length)
  for (const g of [...groupsNeeded].sort((a, b) => weekDemand(b) - weekDemand(a))) {
    const pool = unassigned.filter((p) => p.group === g)
    for (;;) {
      const options = shifts
        .map((s) => ({ s, gain: Math.max(0, ...pool.filter((p) => canDo(p, s)).map((p) => weekGain(p, s))) }))
        .filter((o) => o.gain > 0)
        // Equal cover: prefer a shift that already has people (and a lead).
        .sort(
          (a, b) =>
            b.gain - a.gain ||
            Number((crew.get(b.s.id) ?? []).some(isSenior)) -
              Number((crew.get(a.s.id) ?? []).some(isSenior)) ||
            (crew.get(b.s.id)?.length ?? 0) - (crew.get(a.s.id)?.length ?? 0) ||
            a.s.start - b.s.start,
        )
      if (!options.length) break
      const s = options[0].s
      const p = pickPerson(pool, s)
      if (!p) break
      pool.splice(pool.indexOf(p), 1)
      unassigned.splice(unassigned.indexOf(p), 1)
      assignWeek(p, s)
    }
  }

  // Everyone left joins the shift with the most need for their role. A
  // role with no needs set (e.g. service at a delivery outlet) follows the
  // outlet's overall busy hours instead of being left blank.
  const blank: StaffInput[] = []
  const allNeed = (di: number, h: number) => [...groupsNeeded].reduce((a, g) => a + needOf(di, g)[h], 0)
  for (const p of [...unassigned]) {
    const ownNeeds = !!p.group && groupsNeeded.has(p.group)
    if (!ownNeeds && p.group === 'office' && !p.shiftIds.length) {
      blank.push(p) // office roles keep office hours, set by hand
      continue
    }
    const opts = shifts
      .filter((s) => canDo(p, s))
      .map((s) => ({
        s,
        need: days.reduce(
          (a, _d, di) =>
            a +
            (runsOn(s, di)
              ? hoursOf(s).reduce((x, h) => x + (ownNeeds ? needOf(di, p.group!)[h] : allNeed(di, h)), 0)
              : 0),
          0,
        ),
      }))
      .sort((a, b) => b.need - a.need || (crew.get(a.s.id)?.length ?? 0) - (crew.get(b.s.id)?.length ?? 0))
    const best = opts[0]
    if (!best || (!best.need && !p.shiftIds.length)) {
      blank.push(p)
      continue
    }
    assignWeek(p, best.s)
  }

  // An experienced person on every shift: swap one in from a shift with two.
  for (const [sid, people] of crew) {
    if (people.some(isSenior)) continue
    const s = shiftById.get(sid)!
    for (const [oid, others] of crew) {
      if (oid === sid || others.filter(isSenior).length < 2) continue
      const o = shiftById.get(oid)!
      const senior = others.find((x) => isSenior(x) && canDo(x, s) && !hasLockedShift(x))
      const back = senior && people.find((x) => x.group === senior.group && canDo(x, o) && !hasLockedShift(x))
      if (!senior || !back) continue
      for (const di of freeDays.get(senior.id)!) {
        addCover(senior, o, di, -1)
        addCover(senior, s, di, 1)
      }
      for (const di of freeDays.get(back.id)!) {
        addCover(back, s, di, -1)
        addCover(back, o, di, 1)
      }
      weekly.set(senior.id, s)
      weekly.set(back.id, o)
      crew.set(sid, [...people.filter((x) => x !== back), senior])
      crew.set(oid, [...others.filter((x) => x !== senior), back])
      break
    }
  }
  function hasLockedShift(p: StaffInput) {
    return days.some((d) => locked.get(key(p.id, d))?.kind === 'shift')
  }

  // ── 2. Week offs, where they hurt least ───────────────────────────────
  const offDay = new Map<string, number>()
  const offsOn = days.map(() => 0)
  for (const p of staff)
    days.forEach((d, di) => {
      if (locked.get(key(p.id, d))?.kind === 'off') {
        offDay.set(p.id, di)
        offsOn[di]++
      }
    })
  const seniorsOnDuty = (sid: string, di: number, except: StaffInput) =>
    (crew.get(sid) ?? []).filter(
      (x) => x !== except && isSenior(x) && offDay.get(x.id) !== di && freeDaysOrLocked(x, di),
    ).length
  function freeDaysOrLocked(x: StaffInput, di: number) {
    const l = locked.get(key(x.id, days[di]))
    return !l || l.kind === 'shift'
  }
  // Seniors first, so leads' days off are spread before others choose.
  const order = [...staff].sort(
    (a, b) => Number(isSenior(b)) - Number(isSenior(a)) || a.name.localeCompare(b.name),
  )
  for (const p of order) {
    if (offDay.has(p.id)) continue
    const free = freeDays.get(p.id)!
    if (!free.length) continue
    const s = weekly.get(p.id)
    // Cost of this person being off that day: hours their role goes short.
    const harm = (di: number) => {
      if (!s || !p.group || !runsOn(s, di)) return -1 // their shift doesn't run: ideal day off
      const need = needOf(di, p.group)
      const c = coverOf(di, p.group)
      let h = 0
      for (const x of hoursOf(s)) if (c[x] - 1 < need[x]) h += c[x] - 1 <= 0 ? 3 : 1
      const leadGap =
        isSenior(p) && seniorsOnDuty(s.id, di, p) === 0 && (crew.get(s.id)?.length ?? 0) > 1 ? 50 : 0
      return h + leadGap
    }
    const pickFrom = (list: number[], capped: boolean) =>
      list
        .filter((di) => !capped || offsOn[di] < rules.maxOffPerDay)
        .sort(
          (a, b) =>
            harm(a) - harm(b) ||
            offsOn[a] - offsOn[b] ||
            Number(weekdayOf(days[a]) === p.lastOffWeekday) -
              Number(weekdayOf(days[b]) === p.lastOffWeekday) ||
            a - b,
        )[0]
    const allowed = free.filter((di) => !busiest.has(weekdayOf(days[di])))
    let pick = pickFrom(allowed, true)
    if (pick === undefined) {
      pick = pickFrom(allowed, false) ?? pickFrom(free, false)
      if (pick !== undefined)
        warnings.push(
          `${p.name}: week off on ${labelDay(days[pick])} goes over the limit of ${rules.maxOffPerDay} off per day${
            busiest.has(weekdayOf(days[pick])) ? ' and falls on a busiest day' : ''
          }.`,
        )
    }
    if (pick === undefined) continue
    offDay.set(p.id, pick)
    offsOn[pick]++
    if (s) addCover(p, s, pick, -1)
  }

  // ── 3. Write the week ─────────────────────────────────────────────────
  for (const p of staff) {
    const s = weekly.get(p.id)
    for (const di of freeDays.get(p.id)!) {
      const date = days[di]
      if (offDay.get(p.id) === di) {
        entries.push({ employeeId: p.id, date, shiftId: null, off: true, reason: 'Week off' })
      } else if (s && runsOn(s, di)) {
        entries.push({
          employeeId: p.id,
          date,
          shiftId: s.id,
          off: false,
          reason: `${s.name} all week`,
        })
      }
    }
  }
  for (const p of blank)
    warnings.push(
      `${p.name}: no shift to give (no staffing needs at this outlet yet) — left blank to fill by hand.`,
    )

  // ── 4. Checks ─────────────────────────────────────────────────────────
  // Shifts that run without an experienced person: one line per shift.
  for (const [sid, people] of crew) {
    const s = shiftById.get(sid)!
    const bare = days.filter((_d, di) => {
      if (!runsOn(s, di)) return false
      const onDuty = people.filter((x) => offDay.get(x.id) !== di && freeDaysOrLocked(x, di))
      return onDuty.length > 0 && !onDuty.some(isSenior)
    })
    if (!bare.length) continue
    const fresh = people.filter(isNew)
    warnings.push(
      `${s.name}: no experienced person on duty ${
        bare.length === days.length
          ? 'all week'
          : `on ${bare.map((d) => labelDay(d).split(',')[0]).join(', ')}`
      }${fresh.length ? ` — new joiner${fresh.length > 1 ? 's' : ''} ${fresh.map((f) => f.name).join(', ')} without a senior` : ''}.`,
    )
  }

  const gaps: StaffingGap[] = []
  for (const g of groupsNeeded) {
    let neededHours = 0
    let shortHours = 0
    days.forEach((date, di) => {
      const need = needOf(di, g)
      const c = coverOf(di, g)
      let h = 0
      while (h < 48) {
        neededHours += need[h]
        const short = Math.max(0, need[h] - c[h])
        shortHours += short
        if (short > 0) {
          const empty = c[h] <= 0
          let e = h
          while (e + 1 < 48 && need[e + 1] - c[e + 1] === short && c[e + 1] <= 0 === empty) {
            e++
            neededHours += need[e]
            shortHours += short
          }
          shortfalls.push({ date, group: g, from: h * 60, to: (e + 1) * 60, short, empty })
          h = e + 1
        } else h++
      }
    })
    if (shortHours > 0) {
      const avgShift =
        shifts.reduce((a, x) => a + (x.end - x.start) / 60, 0) / Math.max(1, shifts.length) || 9
      gaps.push({ group: g, neededHours, shortHours, extraPeople: Math.ceil(shortHours / (avgShift * 6)) })
    }
  }

  return { entries, warnings, shortfalls, gaps, adjustedShifts }

  function labelDay(d: string) {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }
}
