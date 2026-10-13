import { addDays, format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'

// In and out closer than this is treated as a double tap, not a worked day.
export const SHORT_DAY_MIN = 30

// One graded day per employee per date across a period. Shared by the
// monthly Excel sheet, the employee PDF report and the attendance scores.

export type PeriodStatus =
  | 'present'
  | 'late'
  | 'no_out'
  | 'short'
  | 'absent'
  | 'week_off'
  | 'leave'
  | 'future'
  | 'not_employed'

export const STATUS_TEXT: Record<PeriodStatus, string> = {
  present: 'Present',
  late: 'Present (late)',
  no_out: 'No punch-out',
  short: 'In/out under 30 min',
  absent: 'Absent',
  week_off: 'Week Off',
  leave: 'Leave',
  future: '',
  not_employed: '',
}

export interface PeriodEmployee {
  id: string
  employee_code: string
  full_name: string
  outlet_id: string | null
  outlet_name: string | null
  designation_name: string | null
  phone: string | null
  hired_on: string | null
  exit_date: string | null
}

export interface PeriodDay {
  date: string
  status: PeriodStatus
  firstIn: string | null
  lastOut: string | null
  workedMin: number | null
  lateMin: number | null
  earlyMin: number | null
  overtimeMin: number | null
  schedStart: string | null
  schedEnd: string | null
  inOutlet: string | null
  outOutlet: string | null
  leaveName: string | null
  paid: boolean | null
  notes: string[]
}

export interface PeriodTotals {
  workingDays: number
  present: number
  late: number
  noOut: number
  // In and out minutes apart (usually a double tap) — not a real day.
  short: number
  absent: number
  weekOff: number
  leave: number
  // Days that count for pay: attended days plus approved paid leave / week offs.
  paidDays: number
  workedMin: number
  lateMin: number
  overtimeMin: number
  // % of working days the person punched in (0–100), null with no working days.
  score: number | null
  // % of punched-in days that started on time.
  punctuality: number | null
}

export interface PeriodRow {
  employee: PeriodEmployee
  days: PeriodDay[]
  totals: PeriodTotals
}

interface ReportRow {
  employee_id: string
  work_date: string
  first_in_at: string | null
  last_out_at: string | null
  worked_minutes: number | null
  late_minutes: number | null
  early_departure_minutes: number | null
  overtime_minutes: number | null
  scheduled_start_at: string | null
  scheduled_end_at: string | null
  first_in_outlet_name: string | null
  last_out_outlet_name: string | null
}

// PostgREST caps responses at 1000 rows, so page through.
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < 50; page++) {
    const { data, error } = await build(page * 1000, page * 1000 + 999)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

export async function loadPeriod(opts: {
  from: string
  to: string
  employeeId?: string | null
  outletId?: string | null
}): Promise<PeriodRow[]> {
  const { from, to } = opts

  let empQ = supabase
    .from('v_employees')
    .select('id, employee_code, full_name, outlet_id, outlet_name, designation_name, phone, hired_on, exit_date, is_active')
    .order('employee_code')
  if (opts.employeeId) empQ = empQ.eq('id', opts.employeeId)
  else {
    if (opts.outletId) empQ = empQ.eq('outlet_id', opts.outletId)
    empQ = empQ.or(`is_active.eq.true,exit_date.gte.${from}`)
  }
  const { data: empData, error: empErr } = await empQ
  if (empErr) throw new Error(empErr.message)
  const employees = ((empData ?? []) as (PeriodEmployee & { is_active: boolean })[]).filter(
    (e) => !e.hired_on || e.hired_on <= to,
  )
  if (!employees.length) return []
  const ids = employees.map((e) => e.id)
  const one = ids.length === 1 ? ids[0] : null

  const [report, roster, leaves, regs] = await Promise.all([
    fetchAll<ReportRow>((a, b) => {
      let q = supabase
        .from('v_attendance_report_detailed')
        .select(
          'employee_id, work_date, first_in_at, last_out_at, worked_minutes, late_minutes, early_departure_minutes, overtime_minutes, scheduled_start_at, scheduled_end_at, first_in_outlet_name, last_out_outlet_name',
        )
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date')
        .order('employee_id')
        .range(a, b)
      if (one) q = q.eq('employee_id', one)
      return q
    }),
    fetchAll<{ employee_id: string; work_date: string; status: string }>((a, b) => {
      let q = supabase
        .schema('core')
        .from('roster_entries')
        .select('employee_id, work_date, status')
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date')
        .order('employee_id')
        .range(a, b)
      if (one) q = q.eq('employee_id', one)
      return q
    }),
    fetchAll<{
      employee_id: string
      start_date: string
      end_date: string
      reason: string | null
      leave_types: { code: string; name: string; is_paid: boolean } | null
    }>((a, b) => {
      let q = supabase
        .schema('core')
        .from('leave_requests')
        .select('employee_id, start_date, end_date, reason, leave_types(code, name, is_paid)')
        .eq('status', 'approved')
        .lte('start_date', to)
        .gte('end_date', from)
        .order('start_date')
        .range(a, b)
      if (one) q = q.eq('employee_id', one)
      return q
    }),
    fetchAll<{ employee_id: string; requested_for: string; type: string; reason: string | null; status: string }>(
      (a, b) => {
        let q = supabase
          .from('v_regularisations')
          .select('employee_id, requested_for, type, reason, status')
          .gte('requested_for', `${from}T00:00:00+05:30`)
          .lte('requested_for', `${to}T23:59:59+05:30`)
          .order('requested_for')
          .range(a, b)
        if (one) q = q.eq('employee_id', one)
        return q
      },
    ),
  ])

  const key = (e: string, d: string) => `${e}|${d}`
  const repBy = new Map(report.map((r) => [key(r.employee_id, r.work_date), r]))
  const offBy = new Set(roster.filter((r) => r.status === 'off').map((r) => key(r.employee_id, r.work_date)))
  const regBy = new Map<string, string[]>()
  for (const r of regs) {
    const d = istDate(r.requested_for)
    const k = key(r.employee_id, d)
    const note = `Regularised ${r.type} (${r.status})${r.reason ? `: ${r.reason}` : ''}`
    regBy.set(k, [...(regBy.get(k) ?? []), note])
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const dates: string[] = []
  for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= to; d = addDays(d, 1)) dates.push(format(d, 'yyyy-MM-dd'))

  return employees.map((emp) => {
    const myLeaves = leaves.filter((l) => l.employee_id === emp.id)
    const days: PeriodDay[] = dates.map((date) => {
      const r = repBy.get(key(emp.id, date)) ?? null
      const leave = myLeaves.find((l) => l.start_date <= date && l.end_date >= date) ?? null
      const notes = [...(regBy.get(key(emp.id, date)) ?? [])]
      if (leave?.reason) notes.unshift(leave.reason)
      if (r?.first_in_at && r.last_out_at && (r.worked_minutes ?? 0) < SHORT_DAY_MIN)
        notes.unshift(`Punched in and out ${r.worked_minutes ?? 0} min apart — likely a double tap; no real punch-out`)
      let status: PeriodStatus
      if ((emp.hired_on && date < emp.hired_on) || (emp.exit_date && date > emp.exit_date)) status = 'not_employed'
      else if (r?.first_in_at)
        status = !r.last_out_at
          ? date < today
            ? 'no_out'
            : 'present'
          : (r.worked_minutes ?? 0) < SHORT_DAY_MIN
            ? 'short'
            : (r.late_minutes ?? 0) > 0
              ? 'late'
              : 'present'
      else if (leave) status = leave.leave_types?.code === 'week_off' ? 'week_off' : 'leave'
      else if (offBy.has(key(emp.id, date))) status = 'week_off'
      else if (date > today || date === today) status = 'future'
      else status = 'absent'
      // Week offs are paid only when applied for as leave and approved;
      // a roster "off" day on its own is unpaid.
      const paid =
        status === 'leave' || status === 'week_off'
          ? (leave?.leave_types?.is_paid ?? false)
          : status === 'absent'
            ? false
            : status === 'future' || status === 'not_employed' || status === 'short'
              ? null
              : true
      return {
        date,
        status,
        firstIn: r?.first_in_at ?? null,
        lastOut: r?.last_out_at ?? null,
        workedMin: r?.worked_minutes ?? null,
        lateMin: r?.late_minutes ?? null,
        earlyMin: r?.last_out_at ? (r?.early_departure_minutes ?? null) : null,
        overtimeMin: r?.overtime_minutes ?? null,
        schedStart: r?.scheduled_start_at ?? null,
        schedEnd: r?.scheduled_end_at ?? null,
        inOutlet: r?.first_in_outlet_name ?? null,
        outOutlet: r?.last_out_outlet_name ?? null,
        leaveName: leave?.leave_types?.name ?? null,
        paid,
        notes,
      }
    })
    return { employee: emp, days, totals: totalsOf(days) }
  })
}

export function totalsOf(days: PeriodDay[]): PeriodTotals {
  const n = (s: PeriodStatus) => days.filter((d) => d.status === s).length
  const present = n('present')
  const late = n('late')
  const noOut = n('no_out')
  const short = n('short')
  const absent = n('absent')
  // Short days count as working days but not as attended.
  const punched = present + late + noOut
  const workingDays = punched + short + absent
  return {
    workingDays,
    present,
    late,
    noOut,
    short,
    absent,
    weekOff: n('week_off'),
    leave: n('leave'),
    paidDays: days.filter((d) => d.paid === true).length,
    workedMin: days.reduce((a, d) => a + (d.workedMin ?? 0), 0),
    lateMin: days.reduce((a, d) => a + (d.status === 'late' ? (d.lateMin ?? 0) : 0), 0),
    overtimeMin: days.reduce((a, d) => a + (d.overtimeMin ?? 0), 0),
    score: workingDays ? Math.round((punched / workingDays) * 100) : null,
    punctuality: punched ? Math.round(((present + noOut) / punched) * 100) : null,
  }
}

function istDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// 125 → "02:05:00"
export function hms(min: number | null | undefined): string {
  if (min == null) return '00:00:00'
  const m = Math.max(0, Math.round(min))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
}

// 125 → "2h 05m"
export function hm(min: number | null | undefined): string {
  if (!min) return '0h'
  const m = Math.round(min)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
