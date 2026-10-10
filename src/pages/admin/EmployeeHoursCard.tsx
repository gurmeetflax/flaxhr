import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { useAttendanceDays, type Day, type DayStatus } from '@/lib/attendanceDays'

const IST = 'Asia/Kolkata'
const SHIFT_HOURS = 9

const COLOR = {
  good: '#16a34a',
  warn: '#f59e0b',
  bad: '#ef4444',
  neutral: '#a1a1aa',
}

const STATUS_LABEL: Record<DayStatus, string> = {
  on_time: 'On time',
  late: 'Late',
  early: 'Left early',
  no_out: 'No punch-out',
  no_show: 'No-show',
  unrostered: 'Worked, not rostered',
  leave: 'On leave',
  off: 'Rostered off',
  pending: 'Today — in progress',
  none: 'No shift',
}

const RANGES = [14, 30, 60] as const

export default function EmployeeHoursCard({ employeeId }: { employeeId: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30)
  const today = format(new Date(), 'yyyy-MM-dd')
  const from = format(subDays(new Date(), range - 1), 'yyyy-MM-dd')

  const q = useAttendanceDays(employeeId, from, today)
  const days = useMemo<Day[]>(() => q.data ?? [], [q.data])

  const summary = useMemo(() => {
    const count = (s: DayStatus) => days.filter((d) => d.status === s).length
    const graded = ['on_time', 'late', 'early', 'no_out', 'no_show'] as DayStatus[]
    const rostered = days.filter((d) => graded.includes(d.status)).length
    const onTime = count('on_time')
    const lateDays = days.filter((d) => d.status === 'late')
    const avgLate = lateDays.length
      ? Math.round(lateDays.reduce((a, d) => a + (d.report?.late_minutes ?? 0), 0) / lateDays.length)
      : 0
    const worked = days.filter((d) => d.hours != null)
    const totalHours = worked.reduce((a, d) => a + (d.hours ?? 0), 0)
    return {
      rostered,
      onTime,
      late: lateDays.length,
      early: count('early'),
      noOut: count('no_out'),
      noShow: count('no_show'),
      adherence: rostered ? Math.round((onTime / rostered) * 100) : null,
      avgLate,
      avgHours: worked.length ? Math.round((totalHours / worked.length) * 10) / 10 : null,
      daysWorked: worked.length,
    }
  }, [days])

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Hours worked &amp; roster discipline</CardTitle>
            <CardDescription className="mt-1">
              Each bar is one day. Rostered days are graded against that day's roster.
            </CardDescription>
          </div>
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted p-1" role="tablist">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  range === r ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r} days
              </button>
            ))}
          </div>
        </div>

        {q.isLoading ? (
          <div className="h-56 animate-pulse rounded-lg bg-muted" />
        ) : q.error ? (
          <p className="text-sm text-destructive">Couldn't load attendance for this employee.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Tile label="Adherence" value={summary.adherence == null ? '—' : `${summary.adherence}%`} hint={`${summary.onTime} of ${summary.rostered} rostered days on time`} />
              <Tile label="Late" value={summary.late} hint={summary.late ? `avg ${summary.avgLate} min` : undefined} tone={summary.late ? 'warn' : undefined} />
              <Tile label="Left early" value={summary.early} tone={summary.early ? 'warn' : undefined} />
              <Tile label="No punch-out" value={summary.noOut} tone={summary.noOut ? 'warn' : undefined} />
              <Tile label="No-show" value={summary.noShow} tone={summary.noShow ? 'bad' : undefined} />
              <Tile label="Days worked" value={summary.daysWorked} />
              <Tile label="Avg hours / day" value={summary.avgHours == null ? '—' : summary.avgHours} />
            </div>

            {summary.rostered === 0 ? (
              <p className="text-xs text-muted-foreground">
                No published roster for this employee in this period — discipline needs a roster to grade against.
              </p>
            ) : null}

            <HoursChart days={days} />

            <Legend />

            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Day-by-day list
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Date</th>
                      <th className="py-1 pr-3 font-medium">Status</th>
                      <th className="py-1 pr-3 font-medium">Outlet</th>
                      <th className="py-1 pr-3 font-medium">Rostered</th>
                      <th className="py-1 pr-3 font-medium">In – Out</th>
                      <th className="py-1 pr-3 text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...days].reverse().filter((d) => d.status !== 'none').map((d) => (
                      <tr key={d.date}>
                        <td className="py-1 pr-3 whitespace-nowrap">{format(parseISO(d.date), 'EEE dd MMM')}</td>
                        <td className="py-1 pr-3">{detailLabel(d)}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{outletLabel(d)}</td>
                        <td className="py-1 pr-3 whitespace-nowrap text-muted-foreground">{rosterLabel(d)}</td>
                        <td className="py-1 pr-3 whitespace-nowrap text-muted-foreground">
                          {t(d.report?.first_in_at)} – {t(d.report?.last_out_at)}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">{d.hours ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function t(ts: string | null | undefined): string {
  return ts ? formatInTimeZone(ts, IST, 'h:mm a') : '—'
}

function outletLabel(d: Day): string {
  return d.outlets.length ? d.outlets.join(' → ') : '—'
}

function rosterLabel(d: Day): string {
  const start = d.roster?.starts_at ?? d.report?.scheduled_start_at
  const end = d.roster?.ends_at ?? d.report?.scheduled_end_at
  if (d.roster?.status === 'off') return 'Off'
  if (!d.roster || d.roster.status !== 'published') return '—'
  return start && end ? `${t(start)} – ${t(end)}` : 'Rostered'
}

function detailLabel(d: Day): string {
  if (d.status === 'late') return `Late by ${d.report?.late_minutes ?? 0} min`
  if (d.status === 'early') return `Left ${d.report?.early_departure_minutes ?? 0} min early`
  return STATUS_LABEL[d.status]
}

function toneOf(s: DayStatus): keyof typeof COLOR | null {
  if (s === 'on_time') return 'good'
  if (s === 'late' || s === 'early' || s === 'no_out') return 'warn'
  if (s === 'no_show') return 'bad'
  if (s === 'unrostered' || s === 'pending') return 'neutral'
  return null
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function HoursChart({ days }: { days: Day[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 220
  const pad = { top: 12, right: 8, bottom: 24, left: 30 }
  const maxH = Math.max(12, Math.ceil(Math.max(0, ...days.map((d) => d.hours ?? 0)) / 3) * 3)
  const innerW = Math.max(0, width - pad.left - pad.right)
  const innerH = H - pad.top - pad.bottom
  const band = days.length ? innerW / days.length : 0
  const barW = Math.max(2, Math.min(28, band - 2))
  const y = (h: number) => pad.top + innerH - (h / maxH) * innerH
  const ticks = Array.from({ length: maxH / 3 + 1 }, (_, i) => i * 3)
  const labelEvery = days.length <= 14 ? 2 : days.length <= 30 ? 5 : 10
  const hovered = hover != null ? days[hover] : null

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={H} role="img" aria-label="Hours worked per day">
          <defs>
            <pattern id="warn-stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={COLOR.warn} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.55" />
            </pattern>
          </defs>
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tk)} y2={y(tk)} stroke="#e4e4e7" strokeWidth={1} />
              <text x={pad.left - 6} y={y(tk) + 3} textAnchor="end" fontSize="10" fill="#71717a">
                {tk}h
              </text>
            </g>
          ))}
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(SHIFT_HOURS)}
            y2={y(SHIFT_HOURS)}
            stroke="#52525b"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text x={width - pad.right} y={y(SHIFT_HOURS) - 4} textAnchor="end" fontSize="10" fill="#52525b">
            {SHIFT_HOURS}h shift
          </text>

          {days.map((d, i) => {
            const cx = pad.left + band * i + band / 2
            const tone = toneOf(d.status)
            const active = hover === i
            const base = y(0)
            let mark = null
            if (d.status === 'no_show') {
              const s = Math.min(5, barW / 2 + 1)
              mark = (
                <g stroke={COLOR.bad} strokeWidth={2} strokeLinecap="round">
                  <line x1={cx - s} y1={base - 8 - s} x2={cx + s} y2={base - 8 + s} />
                  <line x1={cx - s} y1={base - 8 + s} x2={cx + s} y2={base - 8 - s} />
                </g>
              )
            } else if (tone && d.hours != null && d.hours > 0) {
              const top = y(d.hours)
              const h = base - top
              const r = Math.min(4, barW / 2, h)
              const x = cx - barW / 2
              const path = `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`
              mark = (
                <path
                  d={path}
                  fill={tone === 'warn' ? 'url(#warn-stripes)' : COLOR[tone]}
                  opacity={hover == null || active ? 1 : 0.55}
                />
              )
            } else if (tone && tone !== 'neutral') {
              // Graded day with no completed hours (e.g. late, never punched out).
              mark = <rect x={cx - barW / 2} y={base - 3} width={barW} height={3} rx={1} fill={COLOR[tone]} />
            } else if (d.status === 'leave' || d.status === 'off') {
              mark = <circle cx={cx} cy={base - 4} r={2} fill="#a1a1aa" />
            }
            return (
              <g key={d.date}>
                {mark}
                {i % labelEvery === 0 ? (
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#71717a">
                    {format(parseISO(d.date), 'dd MMM')}
                  </text>
                ) : null}
                <rect
                  x={pad.left + band * i}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                />
              </g>
            )
          })}
          <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="#a1a1aa" strokeWidth={1} />
        </svg>
      ) : (
        <div style={{ height: H }} />
      )}

      {hovered ? (
        <div
          className="pointer-events-none absolute top-0 z-10 w-60 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg"
          style={{
            left: Math.min(
              Math.max(0, pad.left + band * (hover ?? 0) + band / 2 - 120),
              Math.max(0, width - 240),
            ),
          }}
        >
          <div className="font-semibold text-foreground">{format(parseISO(hovered.date), 'EEE, dd MMM yyyy')}</div>
          <div className="mt-1 text-foreground">{detailLabel(hovered)}</div>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>Outlet</span>
            <span className="text-foreground">{outletLabel(hovered)}</span>
            <span>Rostered</span>
            <span className="text-foreground">{rosterLabel(hovered)}</span>
            <span>In – Out</span>
            <span className="text-foreground">
              {t(hovered.report?.first_in_at)} – {t(hovered.report?.last_out_at)}
            </span>
            <span>Worked</span>
            <span className="text-foreground tabular-nums">{hovered.hours != null ? `${hovered.hours} h` : '—'}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Legend() {
  const items: { label: string; swatch: React.ReactNode }[] = [
    { label: 'On time', swatch: <span className="h-3 w-3 rounded-sm" style={{ background: COLOR.good }} /> },
    {
      label: 'Late / left early / no punch-out',
      swatch: (
        <span
          className="h-3 w-3 rounded-sm"
          style={{
            background: `repeating-linear-gradient(45deg, ${COLOR.warn} 0 3px, #fcd9a0 3px 5px)`,
          }}
        />
      ),
    },
    {
      label: 'No-show',
      swatch: (
        <span className="text-sm leading-none font-bold" style={{ color: COLOR.bad }}>
          ×
        </span>
      ),
    },
    { label: 'Worked, not rostered', swatch: <span className="h-3 w-3 rounded-sm" style={{ background: COLOR.neutral }} /> },
    { label: 'Leave / off', swatch: <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR.neutral }} /> },
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.swatch}
          {it.label}
        </span>
      ))}
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'warn' | 'bad'
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-foreground'
        }`}
      >
        {value}
      </div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  )
}
