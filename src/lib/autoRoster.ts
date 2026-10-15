// Auto roster: fills an outlet's week from its staffing needs.
//
// Pure functions only (no Supabase) so the rules can be tested and the
// result previewed before anything is saved. The page loads the data,
// calls generateRoster(), shows the draft and warnings, and saves the
// entries as 'planned' for the manager to adjust and publish.
//
// Rules, in order:
//  1. Cells already filled (any status) and approved leave are kept.
//  2. Everyone gets one week off: never on the outlet's busiest days, at
//     most max_off_per_day people off on a day, on the day their role
//     needs least. The weekday rotates from the previous week.
//  3. Each day, shifts are filled to cover the busy-hour needs per role
//     group: the shift that covers the most uncovered need goes first.
//  4. Every shift gets an experienced person (a lead role, or senior_months
//     at Flax); new joiners go into shifts that already have one.
//  5. Closing shifts and busy-day shifts go to whoever has had the fewest.
//  6. Staff left after needs are met join the busiest shift for their role.

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

export type LockedCell = { kind: 'shift'; shiftId: string | null } | { kind: 'off' } | { kind: 'leave' }

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
}

export interface RosterDraft {
  entries: DraftEntry[]
  warnings: string[]
  shortfalls: ShortfallLine[]
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

  // ── 1. Week offs ──────────────────────────────────────────────────────
  const offDay = new Map<string, number>() // employee → day index
  const offsOn = days.map(() => 0)
  for (const p of staff) {
    days.forEach((d, di) => {
      const l = locked.get(key(p.id, d))
      if (l?.kind === 'off') {
        offDay.set(p.id, di)
        offsOn[di]++
      }
    })
  }
  // Fixed order so the same inputs give the same roster.
  const order = [...staff].sort((a, b) => a.name.localeCompare(b.name))
  for (const p of order) {
    if (offDay.has(p.id)) continue
    const free = days.map((d, di) => ({ d, di })).filter(({ d }) => !locked.has(key(p.id, d)))
    if (!free.length) continue
    const allowed = free.filter(({ d }) => !busiest.has(weekdayOf(d)))
    const pickFrom = (list: typeof free, capped: boolean) =>
      list
        .filter(({ di }) => !capped || offsOn[di] < rules.maxOffPerDay)
        .sort(
          (a, b) =>
            dayDemand(a.di, p.group) - dayDemand(b.di, p.group) ||
            offsOn[a.di] - offsOn[b.di] ||
            // rotate: avoid repeating last week's day
            Number(weekdayOf(a.d) === p.lastOffWeekday) - Number(weekdayOf(b.d) === p.lastOffWeekday) ||
            a.di - b.di,
        )[0]
    let pick = pickFrom(allowed, true)
    if (!pick) {
      pick = pickFrom(allowed, false) ?? pickFrom(free, false)
      if (pick)
        warnings.push(
          `${p.name}: week off on ${labelDay(pick.d)} goes over the limit of ${rules.maxOffPerDay} off per day${
            busiest.has(weekdayOf(pick.d)) ? ' and falls on a busiest day' : ''
          }.`,
        )
    }
    if (!pick) continue
    offDay.set(p.id, pick.di)
    offsOn[pick.di]++
    entries.push({ employeeId: p.id, date: pick.d, shiftId: null, off: true, reason: 'Week off' })
  }

  // ── 2–6. Shifts, day by day ───────────────────────────────────────────
  const blankDays = new Map<StaffInput, number>()
  const closingLoad = new Map(staff.map((p) => [p.id, p.closingCount]))
  const busyLoad = new Map(staff.map((p) => [p.id, p.busyDayCount]))

  days.forEach((date, di) => {
    const wd = weekdayOf(date)
    const isBusy = busiest.has(wd)
    const dayShifts = shifts.filter((s) => s.days.has(wd))
    const crew = new Map<string, StaffInput[]>() // shiftId → people
    const add = (sid: string, p: StaffInput) => crew.set(sid, [...(crew.get(sid) ?? []), p])

    // Locked cells count towards cover.
    const residual = new Map<RosterGroup, number[]>()
    for (const g of groupsNeeded)
      residual.set(g, [...(needAt.get(`${di}|${g}`) ?? Array<number>(48).fill(0))])
    const available: StaffInput[] = []
    for (const p of staff) {
      const l = locked.get(key(p.id, date))
      if (l?.kind === 'shift' && l.shiftId) {
        const s = shiftById.get(l.shiftId)
        if (s) {
          add(s.id, p)
          const r = p.group ? residual.get(p.group) : undefined
          if (r) for (const h of hoursOf(s)) r[h]--
        }
        continue
      }
      if (l || offDay.get(p.id) === di) continue
      available.push(p)
    }

    const canDo = (p: StaffInput, s: NormShift) => !p.shiftIds.length || p.shiftIds.includes(s.id)
    const gain = (s: NormShift, r: number[]) => hoursOf(s).reduce((a, h) => a + Math.max(0, r[h]), 0)
    const load = (p: StaffInput, s: NormShift) =>
      (s.closing ? (closingLoad.get(p.id) ?? 0) : 0) + (isBusy ? (busyLoad.get(p.id) ?? 0) : 0)
    const assign = (p: StaffInput, s: NormShift, reason: string) => {
      add(s.id, p)
      entries.push({ employeeId: p.id, date, shiftId: s.id, off: false, reason })
      if (s.closing) closingLoad.set(p.id, (closingLoad.get(p.id) ?? 0) + 1)
      if (isBusy) busyLoad.set(p.id, (busyLoad.get(p.id) ?? 0) + 1)
      const r = p.group ? residual.get(p.group) : undefined
      if (r) for (const h of hoursOf(s)) r[h]--
    }
    const pickPerson = (pool: StaffInput[], s: NormShift) => {
      const able = pool.filter((p) => canDo(p, s))
      if (!able.length) return undefined
      const people = crew.get(s.id) ?? []
      const hasSenior = people.some(isSenior)
      const score = (p: StaffInput) =>
        (!hasSenior ? (isSenior(p) ? 0 : 100) : isNew(p) ? 0 : isSenior(p) ? 20 : 10) + load(p, s)
      return able.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))[0]
    }

    // Busiest group first.
    const groups = [...groupsNeeded].sort((a, b) => dayDemand(di, b) - dayDemand(di, a))
    for (const g of groups) {
      const r = residual.get(g)!
      const pool = available.filter((p) => p.group === g)
      for (;;) {
        const options = dayShifts
          .map((s) => ({ s, gain: gain(s, r) }))
          .filter((o) => o.gain > 0 && pool.some((p) => canDo(p, o.s)))
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
        const { s } = options[0]
        const p = pickPerson(pool, s)
        if (!p) break
        pool.splice(pool.indexOf(p), 1)
        available.splice(available.indexOf(p), 1)
        assign(p, s, `Covers ${GROUP_LABEL[g].toLowerCase()} need`)
      }
    }

    // Everyone still free works the busiest shift they can do.
    for (const p of [...available]) {
      const r = p.group ? residual.get(p.group) : undefined
      const opts = dayShifts
        .filter((s) => canDo(p, s))
        .map((s) => ({
          s,
          need: r ? hoursOf(s).reduce((a, h) => a + (needAt.get(`${di}|${p.group}`)?.[h] ?? 0), 0) : 0,
        }))
        .sort((a, b) => b.need - a.need || (crew.get(a.s.id)?.length ?? 0) - (crew.get(b.s.id)?.length ?? 0))
      const s = p.shiftIds.length ? (opts[0]?.s ?? null) : r ? (opts[0]?.s ?? null) : null
      if (!s) {
        blankDays.set(p, (blankDays.get(p) ?? 0) + 1)
        continue
      }
      available.splice(available.indexOf(p), 1)
      assign(p, s, 'Extra hands on the busiest shift')
    }

    // Senior on every shift: swap one in from a shift that has two.
    for (const [sid, people] of crew) {
      if (people.some(isSenior)) continue
      const s = shiftById.get(sid)!
      let fixed = false
      for (const [oid, others] of crew) {
        if (oid === sid || others.filter(isSenior).length < 2) continue
        const senior = others.find((o) => isSenior(o) && canDo(o, s))
        const swapBack =
          senior && people.find((x) => x.group === senior.group && canDo(x, shiftById.get(oid)!))
        if (!senior || !swapBack) continue
        const eS = entries.find((e) => e.employeeId === senior.id && e.date === date && !e.off)
        const eB = entries.find((e) => e.employeeId === swapBack.id && e.date === date && !e.off)
        if (!eS || !eB) continue // locked cells aren't moved
        eS.shiftId = sid
        eS.reason = 'Experienced lead for this shift'
        eB.shiftId = oid
        crew.set(sid, [...people.filter((x) => x !== swapBack), senior])
        crew.set(oid, [...others.filter((x) => x !== senior), swapBack])
        fixed = true
        break
      }
      if (!fixed)
        warnings.push(
          `${labelDay(date)} ${s.name}: no experienced person (lead role or ${rules.seniorMonths}+ months at Flax).`,
        )
    }

    for (const [sid, people] of crew) {
      if (people.some(isSenior)) continue
      const fresh = people.filter(isNew)
      if (fresh.length)
        warnings.push(
          `${labelDay(date)} ${shiftById.get(sid)!.name}: new joiner${fresh.length > 1 ? 's' : ''} ${fresh
            .map((f) => f.name)
            .join(', ')} without an experienced colleague.`,
        )
    }

    // Shortfalls, merged into continuous blocks.
    for (const g of groupsNeeded) {
      const r = residual.get(g)!
      let h = 0
      while (h < 48) {
        if (r[h] > 0) {
          const short = r[h]
          let e = h
          while (e + 1 < 48 && r[e + 1] === short) e++
          shortfalls.push({ date, group: g, from: h * 60, to: (e + 1) * 60, short })
          h = e + 1
        } else h++
      }
    }
  })

  for (const [p, n] of blankDays)
    warnings.push(
      `${p.name}: no staffing need set for ${p.group ? GROUP_LABEL[p.group] : 'their role'} — ${n} day${
        n === 1 ? '' : 's'
      } left blank to fill by hand.`,
    )

  return { entries, warnings, shortfalls, adjustedShifts }

  function labelDay(d: string) {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }
}
