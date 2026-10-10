import { useMemo, useState } from 'react'
import { endOfMonth, format, getDay, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { Card, CardContent } from '@/components/ui/Card'
import { useAttendanceDays, type Day } from '@/lib/attendanceDays'

const IST = 'Asia/Kolkata'

type Kind = 'present' | 'late' | 'early' | 'no_out' | 'short' | 'absent' | 'leave' | 'off' | 'today' | 'none'

const KIND: Record<Kind, { label: string; bg: string; fg: string; dot: string }> = {
  present: { label: 'Present', bg: '#dcfce7', fg: '#14532d', dot: '#16a34a' },
  late: { label: 'Late', bg: '#fef3c7', fg: '#78350f', dot: '#f59e0b' },
  early: { label: 'Left early', bg: '#fef3c7', fg: '#78350f', dot: '#f59e0b' },
  no_out: { label: 'No punch-out', bg: '#fef3c7', fg: '#78350f', dot: '#f59e0b' },
  short: { label: 'Under 30 min', bg: '#fef3c7', fg: '#78350f', dot: '#f59e0b' },
  absent: { label: 'Absent', bg: '#fee2e2', fg: '#7f1d1d', dot: '#ef4444' },
  leave: { label: 'Leave / week off', bg: '#dbeafe', fg: '#1e3a8a', dot: '#3b82f6' },
  off: { label: 'Off', bg: '#f4f4f5', fg: '#52525b', dot: '#a1a1aa' },
  today: { label: 'Today', bg: '#ffffff', fg: '#0a0a0a', dot: '#0a0a0a' },
  none: { label: '', bg: 'transparent', fg: '#a1a1aa', dot: 'transparent' },
}

// In and out minutes apart (often a double tap) isn't a worked day.
const SHORT_DAY_MIN = 30

function kindOf(d: Day): Kind {
  const k = baseKind(d)
  if (
    (k === 'present' || k === 'late' || k === 'early') &&
    d.report?.worked_minutes != null &&
    d.report.worked_minutes < SHORT_DAY_MIN
  ) {
    return 'short'
  }
  return k
}

function baseKind(d: Day): Kind {
  switch (d.status) {
    case 'on_time':
      return 'present'
    case 'late':
      return 'late'
    case 'early':
      return 'early'
    case 'no_out':
      return 'no_out'
    case 'no_show':
      return 'absent'
    case 'leave':
      return 'leave'
    case 'off':
      return 'off'
    case 'pending':
      return 'today'
    case 'unrostered':
      // Worked a day that wasn't on the roster: judge it on the punches alone.
      if (d.report?.last_out_at) return 'present'
      return d.date < format(new Date(), 'yyyy-MM-dd') ? 'no_out' : 'today'
    default:
      return 'none'
  }
}

// Short text in each cell so the day doesn't rely on colour alone.
function cellNote(d: Day, k: Kind): string {
  if (k === 'absent') return 'Absent'
  if (k === 'leave') return 'Leave'
  if (k === 'off') return 'Off'
  if (k === 'no_out') return 'No out'
  if (k === 'short') return `${Math.round(d.report?.worked_minutes ?? 0)}m`
  if (d.hours != null && d.hours > 0) return `${d.hours}h`
  if (k === 'today' && d.report?.first_in_at) return 'In'
  return ''
}

function t(ts: string | null | undefined): string {
  return ts ? formatInTimeZone(ts, IST, 'h:mm a') : '—'
}

export default function AttendanceCalendar({
  employeeId,
  monthStart,
}: {
  employeeId: string | undefined
  monthStart: Date
}) {
  const from = format(monthStart, 'yyyy-MM-dd')
  const to = format(endOfMonth(monthStart), 'yyyy-MM-dd')
  const q = useAttendanceDays(employeeId, from, to)
  const [picked, setPicked] = useState<string | null>(null)

  const days = useMemo(() => q.data ?? [], [q.data])
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])

  const totals = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, leave: 0, hours: 0 }
    for (const d of days) {
      const k = kindOf(d)
      if (k === 'present' || k === 'early') c.present++
      if (k === 'late') c.late++
      if (k === 'absent') c.absent++
      if (k === 'leave') c.leave++
      c.hours += d.hours ?? 0
    }
    c.hours = Math.round(c.hours * 10) / 10
    return c
  }, [days])

  // Monday-first grid.
  const lead = (getDay(monthStart) + 6) % 7
  const dim = endOfMonth(monthStart).getDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: dim }, (_, i) => format(new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1), 'yyyy-MM-dd')),
  ]
  const today = format(new Date(), 'yyyy-MM-dd')
  const sel = picked ? byDate.get(picked) ?? null : null

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="grid grid-cols-5 gap-2 text-center">
          <Stat label="Present" value={totals.present} />
          <Stat label="Late" value={totals.late} tone={totals.late ? 'warn' : undefined} />
          <Stat label="Absent" value={totals.absent} tone={totals.absent ? 'bad' : undefined} />
          <Stat label="Leave" value={totals.leave} />
          <Stat label="Hours" value={totals.hours} />
        </div>

        {q.isLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : q.error ? (
          <p className="text-sm text-destructive">Couldn't load your calendar. Pull down to refresh.</p>
        ) : (
          <div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <div key={`b${i}`} />
                const d = byDate.get(date)
                const future = date > today
                const k: Kind = d ? kindOf(d) : 'none'
                const style = KIND[k]
                const isPicked = picked === date
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={future || !d}
                    onClick={() => setPicked(isPicked ? null : date)}
                    aria-label={`${format(parseISO(date), 'd MMMM')}${style.label ? `: ${style.label}` : ''}`}
                    className={`flex aspect-square min-h-10 flex-col items-center justify-center rounded-md text-xs transition ${
                      isPicked ? 'ring-2 ring-foreground' : ''
                    } ${date === today ? 'border border-foreground' : ''} ${future ? 'text-muted-foreground/50' : ''}`}
                    style={{ background: future ? 'transparent' : style.bg, color: future ? undefined : style.fg }}
                  >
                    <span className="font-semibold tabular-nums">{parseISO(date).getDate()}</span>
                    {d && !future ? (
                      <span className="mt-0.5 text-[10px] leading-none tabular-nums">{cellNote(d, k)}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {sel ? (
          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{format(parseISO(sel.date), 'EEEE, d MMM')}</span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ background: KIND[kindOf(sel)].bg, color: KIND[kindOf(sel)].fg }}
              >
                {detailLabel(sel)}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {sel.outlets.length ? (
                <>
                  <dt className="text-muted-foreground">Outlet</dt>
                  <dd>{sel.outlets.join(' → ')}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Shift</dt>
              <dd>{shiftLabel(sel)}</dd>
              <dt className="text-muted-foreground">In – Out</dt>
              <dd>
                {t(sel.report?.first_in_at)} – {t(sel.report?.last_out_at)}
              </dd>
              <dt className="text-muted-foreground">Worked</dt>
              <dd className="tabular-nums">{sel.hours != null ? `${sel.hours} h` : '—'}</dd>
            </dl>
            {kindOf(sel) === 'no_out' || kindOf(sel) === 'absent' || kindOf(sel) === 'short' ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Missing or wrong punch? Send a request from <b>Regularise</b>.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Tap a day to see your punches.</p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {(['present', 'late', 'absent', 'leave', 'off'] as Kind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND[k].dot }} />
              {k === 'late' ? 'Late / left early / no punch-out / under 30 min' : KIND[k].label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function detailLabel(d: Day): string {
  const k = kindOf(d)
  if (k === 'late') return `Late by ${d.report?.late_minutes ?? 0} min`
  if (k === 'early') return `Left ${d.report?.early_departure_minutes ?? 0} min early`
  return KIND[k].label || 'No shift'
}

function shiftLabel(d: Day): string {
  if (d.roster?.status === 'off') return 'Off'
  const start = d.roster?.starts_at ?? d.report?.scheduled_start_at
  const end = d.roster?.ends_at ?? d.report?.scheduled_end_at
  if (start && end) return `${t(start)} – ${t(end)}`
  return d.roster?.status === 'published' ? 'Rostered' : 'Not rostered'
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <div className="rounded-lg bg-muted/60 px-1 py-2">
      <div
        className={`text-base font-semibold tabular-nums ${
          tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-foreground'
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}
