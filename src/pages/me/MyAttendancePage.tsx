import { startOfMonth } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { useMyAttendance, type AttendanceRow } from '@/lib/attendance'

export default function MyAttendancePage() {
  const fromDate = startOfMonth(new Date()).toISOString()
  const { data: rows = [], isLoading } = useMyAttendance({ fromDate })

  const groups = groupByDay(rows)

  return (
    <>
      <PageHeader title="My attendance" description="This month" />
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <CardDescription>Loading…</CardDescription>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <CardTitle>No punches yet</CardTitle>
            <CardDescription className="mt-1">
              Your attendance for this month will show up here.
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
