import { useQuery } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'

// Leaving within this many minutes of the rostered end isn't flagged.
export const EARLY_TOLERANCE_MIN = 10

export type DayStatus =
  | 'on_time'
  | 'late'
  | 'early'
  | 'no_out'
  | 'no_show'
  | 'unrostered'
  | 'leave'
  | 'off'
  | 'pending'
  | 'none'

export interface ReportRow {
  work_date: string
  worked_minutes: number | null
  first_in_at: string | null
  last_out_at: string | null
  scheduled_start_at: string | null
  scheduled_end_at: string | null
  late_minutes: number | null
  early_departure_minutes: number | null
  outlet_name?: string | null
  first_in_outlet_name?: string | null
  last_out_outlet_name?: string | null
}

export interface RosterRow {
  work_date: string
  status: string
  starts_at: string | null
  ends_at: string | null
}

export interface Day {
  date: string
  status: DayStatus
  hours: number | null
  report: ReportRow | null
  roster: RosterRow | null
  // Outlets punched at that day, in order (managers move between outlets).
  outlets: string[]
}

export function grade(
  date: string,
  today: string,
  report: ReportRow | null,
  roster: RosterRow | null,
  onLeave: boolean,
): DayStatus {
  if (onLeave) return 'leave'
  const punchedIn = !!report?.first_in_at
  if (!roster || roster.status === 'planned') return punchedIn ? 'unrostered' : 'none'
  if (roster.status === 'off') return punchedIn ? 'unrostered' : 'off'
  if (!punchedIn) return date < today ? 'no_show' : 'pending'
  if ((report?.late_minutes ?? 0) > 0) return 'late'
  if (!report?.last_out_at) return date < today ? 'no_out' : 'pending'
  if ((report?.early_departure_minutes ?? 0) > EARLY_TOLERANCE_MIN) return 'early'
  return 'on_time'
}

// The report view can return several rows for one day when someone punched
// at more than one outlet. Collapse them to one: earliest in, latest out.
function mergeByDate(rows: ReportRow[]): Map<string, ReportRow> {
  const out = new Map<string, ReportRow>()
  for (const r of rows) {
    const prev = out.get(r.work_date)
    if (!prev) {
      out.set(r.work_date, { ...r })
      continue
    }
    const firstIn = minTs(prev.first_in_at, r.first_in_at)
    const lastOut = maxTs(prev.last_out_at, r.last_out_at)
    const fromFirst = firstIn === r.first_in_at ? r : prev
    const fromLast = lastOut === r.last_out_at ? r : prev
    out.set(r.work_date, {
      work_date: r.work_date,
      first_in_at: firstIn,
      last_out_at: lastOut,
      worked_minutes:
        firstIn && lastOut
          ? Math.max(0, Math.round((Date.parse(lastOut) - Date.parse(firstIn)) / 60000))
          : null,
      scheduled_start_at: prev.scheduled_start_at ?? r.scheduled_start_at,
      scheduled_end_at: prev.scheduled_end_at ?? r.scheduled_end_at,
      late_minutes: fromFirst.late_minutes,
      early_departure_minutes: fromLast.early_departure_minutes,
    })
  }
  return out
}

// Outlet names per day in punch order, without repeats.
function outletsByDate(rows: ReportRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const sorted = [...rows].sort((a, b) => (a.first_in_at ?? '').localeCompare(b.first_in_at ?? ''))
  for (const r of sorted) {
    const list = out.get(r.work_date) ?? []
    for (const n of [r.first_in_outlet_name ?? r.outlet_name, r.last_out_outlet_name]) {
      if (n && !list.includes(n)) list.push(n)
    }
    out.set(r.work_date, list)
  }
  return out
}

function minTs(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) <= Date.parse(b) ? a : b
}
function maxTs(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

// One graded entry per calendar day from `from` to `to` (inclusive).
// RLS limits non-admins to their own rows; the employee_id filter keeps
// admin views scoped to the employee being looked at.
export function useAttendanceDays(employeeId: string | undefined, from: string, to: string) {
  const today = format(new Date(), 'yyyy-MM-dd')
  return useQuery({
    queryKey: ['attendance-days', employeeId, from, to],
    enabled: !!employeeId,
    queryFn: async (): Promise<Day[]> => {
      const [rep, ros, lv] = await Promise.all([
        supabase
          .from('v_attendance_report_detailed')
          .select(
            'work_date, worked_minutes, first_in_at, last_out_at, scheduled_start_at, scheduled_end_at, late_minutes, early_departure_minutes, outlet_name, first_in_outlet_name, last_out_outlet_name',
          )
          .eq('employee_id', employeeId!)
          .gte('work_date', from)
          .lte('work_date', to),
        supabase
          .schema('core')
          .from('roster_entries')
          .select('work_date, status, starts_at, ends_at')
          .eq('employee_id', employeeId!)
          .gte('work_date', from)
          .lte('work_date', to),
        supabase
          .schema('core')
          .from('leave_requests')
          .select('start_date, end_date')
          .eq('employee_id', employeeId!)
          .eq('status', 'approved')
          .lte('start_date', to)
          .gte('end_date', from),
      ])
      if (rep.error) throw rep.error
      if (ros.error) throw ros.error
      if (lv.error) throw lv.error

      const repRows = (rep.data ?? []) as ReportRow[]
      const repBy = mergeByDate(repRows)
      const outletsBy = outletsByDate(repRows)
      const rosBy = new Map(((ros.data ?? []) as RosterRow[]).map((r) => [r.work_date, r]))
      const leaves = (lv.data ?? []) as { start_date: string; end_date: string }[]
      const last = to < today ? to : today

      const days: Day[] = []
      for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= last; d = addDays(d, 1)) {
        const date = format(d, 'yyyy-MM-dd')
        const report = repBy.get(date) ?? null
        const roster = rosBy.get(date) ?? null
        const onLeave = leaves.some((l) => l.start_date <= date && l.end_date >= date)
        const hours =
          report?.worked_minutes != null ? Math.round((report.worked_minutes / 60) * 10) / 10 : null
        days.push({
          date,
          report,
          roster,
          hours,
          outlets: outletsBy.get(date) ?? [],
          status: grade(date, today, report, roster, onLeave),
        })
      }
      return days
    },
  })
}
