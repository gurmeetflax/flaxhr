import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, differenceInCalendarMonths, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { RosterEntry } from '@/lib/roster'
import type { Shift } from '@/lib/shifts'
import {
  normaliseShift,
  type DraftEntry,
  type LockedCell,
  type NeedInput,
  type RosterGroup,
  type RulesInput,
  type StaffInput,
} from '@/lib/autoRoster'

// Loading and saving for the auto roster: staffing needs, rules, and the
// per-person facts (role group, time at Flax, history) the generator uses.

export interface StaffingNeed extends NeedInput {
  id?: string
  outlet_id: string
  source?: 'manual' | 'petpooja'
}

export interface RosterRules {
  outlet_id: string
  busiest_days: number[]
  max_off_per_day: number
  senior_months: number
  new_joiner_months: number
  orders_per_staff_hour: number
}

export const DEFAULT_RULES = (outletId: string): RosterRules => ({
  outlet_id: outletId,
  busiest_days: [0, 6],
  max_off_per_day: 2,
  senior_months: 12,
  new_joiner_months: 3,
  orders_per_staff_hour: 4,
})

export interface HourlyOrders {
  weekday: number
  hour: number
  avg_orders: number
  avg_dine_in: number
}

// The outlet's two busiest weekdays by Petpooja orders.
export function busiestFromOrders(hourly: HourlyOrders[]): number[] {
  const perDay = [0, 1, 2, 3, 4, 5, 6].map((wd) => ({
    wd,
    n: hourly.filter((h) => h.weekday === wd).reduce((a, h) => a + Number(h.avg_orders), 0),
  }))
  return perDay
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((d) => d.wd)
}

export function useStaffingSetup(outletId: string) {
  return useQuery({
    queryKey: ['staffing-setup', outletId],
    queryFn: async () => {
      const [needsR, rulesR, ordersR] = await Promise.all([
        supabase.schema('core').from('staffing_needs').select('*').eq('outlet_id', outletId),
        supabase.schema('core').from('roster_rules').select('*').eq('outlet_id', outletId).maybeSingle(),
        supabase
          .from('v_outlet_hourly_orders')
          .select('weekday, hour, avg_orders, avg_dine_in')
          .eq('outlet_id', outletId),
      ])
      if (needsR.error) throw needsR.error
      if (rulesR.error) throw rulesR.error
      const hourlyOrders = (ordersR.data ?? []) as HourlyOrders[]
      const savedRules = rulesR.data as RosterRules | null
      // Until someone saves rules, busiest days come from the outlet's own orders.
      const rules = savedRules ?? {
        ...DEFAULT_RULES(outletId),
        ...(hourlyOrders.length ? { busiest_days: busiestFromOrders(hourlyOrders) } : {}),
      }
      const savedNeeds = (needsR.data ?? []) as StaffingNeed[]
      // No needs entered: use busy hours from Petpooja.
      const fromOrders = !savedNeeds.length && hourlyOrders.length > 0
      return {
        needs: fromOrders
          ? suggestFromOrders(outletId, hourlyOrders, rules.orders_per_staff_hour)
          : savedNeeds,
        needsFromOrders: fromOrders,
        rulesSaved: !!savedRules,
        rules,
        hourlyOrders,
      }
    },
  })
}

export function useSaveStaffingSetup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      outletId,
      needs,
      rules,
    }: {
      outletId: string
      needs: StaffingNeed[]
      rules: RosterRules
    }) => {
      const { error: rErr } = await supabase
        .schema('core')
        .from('roster_rules')
        .upsert({ ...rules, outlet_id: outletId, updated_at: new Date().toISOString() })
      if (rErr) throw rErr
      const { error: dErr } = await supabase
        .schema('core')
        .from('staffing_needs')
        .delete()
        .eq('outlet_id', outletId)
      if (dErr) throw dErr
      if (needs.length) {
        const { error } = await supabase
          .schema('core')
          .from('staffing_needs')
          .insert(
            needs.map((n) => ({
              outlet_id: outletId,
              weekday: n.weekday,
              block_start: n.block_start,
              block_end: n.block_end,
              roster_group: n.roster_group,
              headcount: n.headcount,
              source: n.source ?? 'manual',
            })),
          )
        if (error) throw error
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['staffing-setup', v.outletId] }),
  })
}

// Petpooja orders per hour → suggested headcount, merged into blocks of
// equal need. Kitchen follows all orders (one cook per
// orders_per_staff_hour, at least one while orders come in, plus an hour
// of prep before the first rush). Service follows dine-in orders, only at
// outlets that get dine-in guests most days.
export function suggestFromOrders(
  outletId: string,
  hourly: HourlyOrders[],
  ordersPerStaffHour: number,
): StaffingNeed[] {
  const rate = Math.max(1, ordersPerStaffHour)
  const dineInWeek = hourly.reduce((a, h) => a + Number(h.avg_dine_in ?? 0), 0)
  const out: StaffingNeed[] = []
  for (let wd = 0; wd < 7; wd++) {
    const day = hourly.filter((h) => h.weekday === wd)
    const at = (h: number) => day.find((x) => x.hour === h)
    const kitchen = Array.from({ length: 24 }, (_, h) => {
      const o = Number(at(h)?.avg_orders ?? 0)
      return o >= 0.5 ? Math.max(1, Math.ceil(o / rate)) : 0
    })
    const first = kitchen.findIndex((n) => n > 0)
    if (first > 0) kitchen[first - 1] = 1 // prep
    const service = Array.from({ length: 24 }, (_, h) => {
      if (dineInWeek < 7 || kitchen[h] === 0) return 0
      return Math.max(1, Math.ceil(Number(at(h)?.avg_dine_in ?? 0) / 2))
    })
    for (const [group, perHour] of [
      ['kitchen', kitchen],
      ['service', service],
    ] as [RosterGroup, number[]][]) {
      let start = 0
      for (let h = 1; h <= 24; h++) {
        if (h < 24 && perHour[h] === perHour[start]) continue
        if (perHour[start] > 0)
          out.push({
            outlet_id: outletId,
            weekday: wd,
            block_start: `${String(start).padStart(2, '0')}:00`,
            block_end: `${String(h % 24).padStart(2, '0')}:00`,
            roster_group: group,
            headcount: perHour[start],
            source: 'petpooja',
          })
        start = h
      }
    }
  }
  return out
}

// Everything the generator needs for one outlet and week.
export async function loadAutoRosterInputs(opts: {
  outletId: string
  days: string[]
  shifts: Shift[]
  roster: RosterEntry[]
  busiestDays: number[]
  /** Roaming staff to use as cover (employee ids). */
  coverIds?: string[]
}): Promise<{
  staff: StaffInput[]
  floaters: StaffInput[]
  locked: Map<string, LockedCell>
  skipped: string[]
}> {
  const { outletId, days, shifts, roster, busiestDays, coverIds = [] } = opts
  const from = days[0]
  const to = days[6]
  const histFrom = format(addDays(new Date(`${from}T00:00:00`), -28), 'yyyy-MM-dd')
  const histTo = format(addDays(new Date(`${from}T00:00:00`), -1), 'yyyy-MM-dd')

  const { data: emps, error: eErr } = await supabase
    .from('v_employees')
    .select('id, full_name, designation_code, hired_on')
    .eq('outlet_id', outletId)
    .eq('is_active', true)
  if (eErr) throw eErr
  const ids = (emps ?? []).map((e) => e.id as string)

  const [desR, esR, histR, leaveR] = await Promise.all([
    supabase.from('v_designations').select('code, roster_group, is_lead'),
    ids.length
      ? supabase
          .schema('core')
          .from('employee_shifts')
          .select('employee_id, shift_id, effective_from, effective_to')
          .in('employee_id', ids)
          .lte('effective_from', to)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('v_roster')
      .select('employee_id, work_date, status, shift_id')
      .eq('outlet_id', outletId)
      .gte('work_date', histFrom)
      .lte('work_date', histTo),
    ids.length
      ? supabase
          .schema('core')
          .from('leave_requests')
          .select('employee_id, start_date, end_date')
          .in('employee_id', ids)
          .eq('status', 'approved')
          .lte('start_date', to)
          .gte('end_date', from)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [desR, esR, histR, leaveR]) if (r.error) throw r.error

  const des = new Map(
    (desR.data ?? []).map((d) => [
      d.code as string,
      { group: d.roster_group as RosterGroup | null, lead: !!d.is_lead },
    ]),
  )
  const shiftNorm = new Map(shifts.map((s) => [s.id, normaliseShift(s)]))
  const busiest = new Set(busiestDays)

  const staff: StaffInput[] = []
  const skipped: string[] = []
  for (const e of emps ?? []) {
    const d = e.designation_code ? des.get(e.designation_code as string) : undefined
    if (!d?.group) {
      skipped.push(e.full_name as string)
      continue
    }
    const hist = (histR.data ?? []).filter((h) => h.employee_id === e.id)
    const offs = hist.filter((h) => h.status === 'off').sort((a, b) => (a.work_date < b.work_date ? 1 : -1))
    staff.push({
      id: e.id as string,
      name: e.full_name as string,
      group: d.group,
      isLead: d.lead,
      monthsAtFlax: e.hired_on
        ? differenceInCalendarMonths(new Date(`${from}T00:00:00`), new Date(e.hired_on as string))
        : null,
      shiftIds: [
        ...new Set(
          (esR.data ?? [])
            .filter((s) => s.employee_id === e.id && (!s.effective_to || s.effective_to >= from))
            .map((s) => s.shift_id as string),
        ),
      ].filter((sid) => shiftNorm.has(sid)),
      closingCount: hist.filter((h) => h.shift_id && shiftNorm.get(h.shift_id as string)?.closing).length,
      busyDayCount: hist.filter(
        (h) => h.shift_id && busiest.has(new Date(`${h.work_date}T00:00:00`).getDay()),
      ).length,
      lastOffWeekday: offs[0] ? new Date(`${offs[0].work_date}T00:00:00`).getDay() : null,
    })
  }

  const locked = new Map<string, LockedCell>()
  for (const r of roster) {
    locked.set(
      `${r.employee_id}|${r.work_date}`,
      r.status === 'off' ? { kind: 'off' } : { kind: 'shift', shiftId: r.shift_id },
    )
  }
  // Days already gone this week are left as they are.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  for (const p of staff)
    for (const d of days)
      if (d < today && !locked.has(`${p.id}|${d}`)) locked.set(`${p.id}|${d}`, { kind: 'past' })
  for (const l of leaveR.data ?? []) {
    for (const d of days) {
      if (
        d >= (l.start_date as string) &&
        d <= (l.end_date as string) &&
        !locked.has(`${l.employee_id}|${d}`)
      )
        locked.set(`${l.employee_id}|${d}`, { kind: 'leave' })
    }
  }
  // Roaming cover: unavailable wherever they're already rostered this week.
  const floaters: StaffInput[] = []
  if (coverIds.length) {
    const [cE, cR] = await Promise.all([
      supabase.from('v_employees').select('id, full_name, hired_on').in('id', coverIds),
      supabase
        .from('v_roster')
        .select('employee_id, work_date')
        .in('employee_id', coverIds)
        .gte('work_date', from)
        .lte('work_date', to),
    ])
    if (cE.error) throw cE.error
    if (cR.error) throw cR.error
    for (const r of cR.data ?? []) locked.set(`${r.employee_id}|${r.work_date}`, { kind: 'leave' })
    for (const e of cE.data ?? []) {
      for (const d of days)
        if (d < today && !locked.has(`${e.id}|${d}`)) locked.set(`${e.id}|${d}`, { kind: 'past' })
      floaters.push({
        id: e.id as string,
        name: e.full_name as string,
        group: null,
        isLead: true,
        monthsAtFlax: e.hired_on
          ? differenceInCalendarMonths(new Date(`${from}T00:00:00`), new Date(e.hired_on as string))
          : null,
        shiftIds: [],
        closingCount: 0,
        busyDayCount: 0,
        lastOffWeekday: null,
      })
    }
  }

  return { staff, floaters, locked, skipped }
}

export function rulesInput(r: RosterRules): RulesInput {
  return {
    busiestDays: r.busiest_days,
    maxOffPerDay: r.max_off_per_day,
    seniorMonths: r.senior_months,
    newJoinerMonths: r.new_joiner_months,
  }
}

export function useSaveDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ outletId, entries }: { outletId: string; entries: DraftEntry[] }) => {
      if (!entries.length) return 0
      const { error } = await supabase
        .schema('core')
        .from('roster_entries')
        .upsert(
          entries.map((e) => ({
            outlet_id: outletId,
            employee_id: e.employeeId,
            work_date: e.date,
            shift_id: e.off ? null : e.shiftId,
            status: e.off ? 'off' : 'planned',
            notes: 'Auto roster',
          })),
          { onConflict: 'employee_id,work_date', ignoreDuplicates: true },
        )
      if (error) throw error
      return entries.length
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roster'] }),
  })
}

// Staff in roaming roles (no roster group, e.g. area / operations managers)
// who can be used as cover at any outlet.
export function useRoamingStaff() {
  return useQuery({
    queryKey: ['roaming-staff'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: des, error: dErr } = await supabase
        .from('v_designations')
        .select('code')
        .is('roster_group', null)
      if (dErr) throw dErr
      const codes = (des ?? []).map((d) => d.code as string)
      if (!codes.length) return []
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, full_name, designation_name')
        .in('designation_code', codes)
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string; designation_name: string | null }[]
    },
  })
}
