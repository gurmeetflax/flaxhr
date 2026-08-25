import { useState } from 'react'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useMyAttendance, type AttendanceRow } from '@/lib/attendance'
import { useMyEmployee } from '@/lib/auth'

export default function MyAttendancePage() {
  const [periodMonth, setPeriodMonth] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )

  const monthStart = new Date(periodMonth + 'T00:00:00')
  const fromDate = startOfMonth(monthStart).toISOString()
  const toDate = endOfMonth(monthStart).toISOString()

  const { data: rows = [], isLoading } = useMyAttendance({ fromDate, toDate, limit: 1000 })
  const { data: employee } = useMyEmployee()

  const groups = groupByDay(rows)
  const monthLabel = format(monthStart, 'MMMM yyyy')

  const whatsappHref = buildWhatsappHref(employee?.full_name ?? null, monthLabel, groups)

  return (
    <>
      <PageHeader
        title="My attendance"
        description={monthLabel}
        actions={
          rows.length > 0 ? (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline">
                <MessageCircle className="h-4 w-4" /> Send to WhatsApp
              </Button>
            </a>
          ) : null
        }
      />

      <div className="mb-4 max-w-xs">
        <Input
          type="month"
          value={periodMonth.slice(0, 7)}
          onChange={(e) => setPeriodMonth(`${e.target.value}-01`)}
        />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <CardDescription>Loading…</CardDescription>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <CardTitle>No punches in {monthLabel}</CardTitle>
            <CardDescription className="mt-1">
              Pick a different month above to see earlier attendance.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <Card key={g.dayKey}>
              <CardContent className="flex flex-col gap-3 p-6">
                <CardTitle>{g.dayLabel}</CardTitle>
                <ul className="flex flex-col divide-y divide-border">
                  {g.rows.map((r) => (
                    <Row key={r.id} row={r} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function Row({ row }: { row: AttendanceRow }) {
  const tz = row.outlet_timezone ?? 'Asia/Kolkata'
  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <span className="flex items-center gap-2">
        <Pill tone={row.type === 'in' ? 'positive' : 'neutral'}>{row.type === 'in' ? 'In' : 'Out'}</Pill>
        {row.source === 'regularised' ? <Pill tone="warn">Regularised</Pill> : null}
        {row.is_within_geofence === false ? <Pill tone="negative">Off-site</Pill> : null}
      </span>
      <span className="flex items-center gap-3 text-muted-foreground">
        {row.distance_m != null ? <span>{row.distance_m} m</span> : null}
        <span className="font-medium text-foreground">
          {formatInTimeZone(row.punched_at, tz, 'h:mm a')}
        </span>
      </span>
    </li>
  )
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'positive' | 'neutral' | 'warn' | 'negative' }) {
  const cls =
    tone === 'positive'
      ? 'bg-primary/10 text-primary'
      : tone === 'warn'
      ? 'bg-amber-500/10 text-amber-600'
      : tone === 'negative'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-muted text-muted-foreground'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

function buildWhatsappHref(
  name: string | null,
  monthLabel: string,
  groups: { dayKey: string; dayLabel: string; rows: AttendanceRow[] }[],
): string {
  const header = `📋 Attendance — ${monthLabel}${name ? `\n${name}` : ''}`
  const body = groups
    .slice()
    .reverse()
    .map((g) => {
      const tz = g.rows[0].outlet_timezone ?? 'Asia/Kolkata'
      const times = g.rows
        .map((r) => `${r.type === 'in' ? 'In' : 'Out'} ${formatInTimeZone(r.punched_at, tz, 'h:mm a')}`)
        .join(', ')
      return `${g.dayLabel} — ${times}`
    })
    .join('\n')
  const text = `${header}\n\n${body}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

function groupByDay(rows: AttendanceRow[]): { dayKey: string; dayLabel: string; rows: AttendanceRow[] }[] {
  const map = new Map<string, AttendanceRow[]>()
  for (const r of rows) {
    const tz = r.outlet_timezone ?? 'Asia/Kolkata'
    const key = formatInTimeZone(r.punched_at, tz, 'yyyy-MM-dd')
    const arr = map.get(key) ?? []
    arr.push(r)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dayKey, rs]) => ({
      dayKey,
      dayLabel: formatInTimeZone(rs[0].punched_at, rs[0].outlet_timezone ?? 'Asia/Kolkata', 'EEEE, d MMM'),
      rows: rs,
    }))
}
