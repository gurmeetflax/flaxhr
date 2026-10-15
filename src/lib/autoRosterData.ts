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
  orders_per_staff_hour: 8,
})

export function useStaffingSetup(outletId: string) {
  return useQuery({
    queryKey: ['staffing-setup', outletId],
    queryFn: async () => {
      const [needsR, rulesR, ordersR] = await Promise.all([
        supabase.schema('core').from('staffing_needs').select('*').eq('outlet_id', outletId),
        supabase.schema('core').from('roster_rules').select('*').eq('outlet_id', outletId).maybeSingle(),
        supabase.from('v_outlet_hourly_orders').select('weekday, hour, avg_orders').eq('outlet_id', outletId),
      ])
      if (needsR.error) throw needsR.error
      if (rulesR.error) throw rulesR.error
      return {
        needs: (needsR.data ?? []) as StaffingNeed[],
        rules: (rulesR.data as RosterRules | null) ?? DEFAULT_RULES(outletId),
        hourlyOrders: (ordersR.data ?? []) as { weekday: number; hour: number; avg_orders: number }[],
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

// Petpooja orders per hour → suggested kitchen and service headcount,
// merged into blocks of equal need.
export function suggestFromOrders(
  outletId: string,
  hourly: { weekday: number; hour: number; avg_orders: number }[],
  ordersPerStaffHour: number,
): StaffingNeed[] {
  const out: StaffingNeed[] = []
  for (let wd = 0; wd < 7; wd++) {
    const byHour = new Map(hourly.filter((h) => h.weekday === wd).map((h) => [h.hour, Number(h.avg_orders)]))
    for (const group of ['kitchen', 'service'] as RosterGroup[]) {
      let start = -1
      let count = 0
      const flush = (end: number) => {
        if (start >= 0 && count > 0)
          out.push({
            outlet_id: outletId,
            weekday: wd,
            block_start: `${String(start).padStart(2, '0')}:00`,
            block_end: `${String(end % 24).padStart(2, '0')}:00`,
            roster_group: group,
            headcount: count,
            source: 'petpooja',
          })
      }
      for (let h = 0; h <= 24; h++) {
        const orders = byHour.get(h) ?? 0
        const n = h < 24 && orders > 0 ? Math.max(1, Math.ceil(orders / ordersPerStaffHour)) : 0
        if (n !== count) {
          flush(h)
          start = h
          count = n
        }
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
}): Promise<{ staff: StaffInput[]; locked: Map<string, LockedCell>; skipped: string[] }> {
  const { outletId, days, shifts, roster, busiestDays } = opts
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
  return { staff, locked, skipped }
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
