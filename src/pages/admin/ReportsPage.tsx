import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import {
  useAttendanceReport,
  useAttendanceReportDetailed,
  useEmployeeLeaveSummary,
  type AttendanceDetailedRow,
  type AttendanceReportRow,
  type AttendanceStatus,
} from '@/lib/reports'

interface OutletOption {
  id: string
  display_name: string | null
}

const IST = 'Asia/Kolkata'

export default function ReportsPage() {
  const [tab, setTab] = useState<'standard' | 'detailed'>('standard')
  const [outletId, setOutletId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('')
  // Default to a rolling 30-day window — using startOfMonth caused an empty
  // page on the 1st and 2nd of a month when nobody had punched yet.
  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))

  const outletsQ = useQuery<OutletOption[]>({
    queryKey: ['outlets-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flax_outlets')
        .select('id, display_name')
        .eq('active', true)
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: rows = [], isLoading } = useAttendanceReport({
    outletId: outletId || null,
    fromDate: from,
    toDate: to,
    limit: 5000,
  })
  const { data: detailedRows = [], isLoading: detailedLoading } = useAttendanceReportDetailed({
    outletId: outletId || null,
    fromDate: from,
    toDate: to,
    limit: 5000,
  })
  const { data: leaveSummary = [] } = useEmployeeLeaveSummary()
  const summaryByEmp = useMemo(() => {
    const m = new Map<string, { pending: number; used: number }>()
    for (const s of leaveSummary) {
      m.set(s.employee_id, { pending: s.leaves_pending, used: s.leaves_used })
    }
    return m
  }, [leaveSummary])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (!needle) return true
      return (
        r.employee_name.toLowerCase().includes(needle) ||
        r.employee_code.toLowerCase().includes(needle)
      )
    })
  }, [rows, search, statusFilter])

  const detailedFiltered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return detailedRows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (!needle) return true
      return (
        r.employee_name.toLowerCase().includes(needle) ||
        r.employee_code.toLowerCase().includes(needle)
      )
    })
  }, [detailedRows, search, statusFilter])

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          tab === 'standard'
            ? isLoading ? 'Loading…' : `${filtered.length} rows`
            : detailedLoading ? 'Loading…' : `${detailedFiltered.length} rows`
        }
        actions={
          tab === 'standard' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv(filtered, summaryByEmp)}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadDetailedCsv(detailedFiltered)}
              disabled={detailedFiltered.length === 0}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'standard' | 'detailed')} className="mb-4">
        <TabsList>
          <TabsTrigger value="standard">Standard</TabsTrigger>
          <TabsTrigger value="detailed">Detailed report</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-3 flex flex-wrap gap-2">
        <PresetBtn label="This month" onClick={() => {
          setFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
          setTo(format(new Date(), 'yyyy-MM-dd'))
        }} />
        <PresetBtn label="Last month" onClick={() => {
          const d = subMonths(new Date(), 1)
          setFrom(format(startOfMonth(d), 'yyyy-MM-dd'))
          setTo(format(endOfMonth(d), 'yyyy-MM-dd'))
        }} />
        <PresetBtn label="Last 7 days" onClick={() => {
          setFrom(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
          setTo(format(new Date(), 'yyyy-MM-dd'))
        }} />
        <PresetBtn label="Last 30 days" onClick={() => {
          setFrom(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
          setTo(format(new Date(), 'yyyy-MM-dd'))
        }} />
        <PresetBtn label="Last 90 days" onClick={() => {
          setFrom(format(subDays(new Date(), 89), 'yyyy-MM-dd'))
          setTo(format(new Date(), 'yyyy-MM-dd'))
        }} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          placeholder="Search employee"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
        >
          <option value="">All outlets</option>
          {outletsQ.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.display_name ?? o.id}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
          <option value="on_leave">On leave</option>
        </select>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {tab === 'standard' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Emp code</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Designation</th>
                    <th className="px-3 py-2">Outlet</th>
                    <th className="px-3 py-2">Punch in</th>
                    <th className="px-3 py-2">Punch out</th>
                    <th className="px-3 py-2">Late (hrs)</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Leaves pending</th>
                    <th className="px-3 py-2">Leaves used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <Row key={`${r.employee_id}-${r.work_date}`} row={r} summary={summaryByEmp.get(r.employee_id)} />
                  ))}
                  {filtered.length === 0 && !isLoading ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                        No rows in this range. Try widening the date filters
                        {rows.length !== filtered.length
                          ? ' or clearing the search / status / outlet filters.'
                          : '.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Emp</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Punch in</th>
                    <th className="px-3 py-2">Punch out</th>
                    <th className="px-3 py-2 text-right">Hours worked</th>
                    <th className="px-3 py-2 text-right">Late</th>
                    <th className="px-3 py-2 text-right">Early departure</th>
                    <th className="px-3 py-2 text-right">Overtime</th>
                    <th className="px-3 py-2">Shift start</th>
                    <th className="px-3 py-2">Shift end</th>
                    <th className="px-3 py-2">Punch in location</th>
                    <th className="px-3 py-2">Punch out location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detailedFiltered.map((r) => (
                    <DetailedRow key={`${r.employee_id}-${r.work_date}`} row={r} />
                  ))}
                  {detailedFiltered.length === 0 && !detailedLoading ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                        No rows in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function DetailedRow({ row }: { row: AttendanceDetailedRow }) {
  return (
    <tr className="hover:bg-muted/30 align-top">
      <td className="px-3 py-2 whitespace-nowrap">{formatDateDDMMYY(row.work_date)}</td>
      <td className="px-3 py-2">
        <div className="font-medium">{row.employee_name}</div>
        <div className="text-xs text-muted-foreground">{row.employee_code}</div>
      </td>
      <td className="px-3 py-2"><StatusPill status={row.status} /></td>
      <td className="px-3 py-2 whitespace-nowrap">{formatIstTime(row.first_in_at)}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatIstTime(row.last_out_at)}</td>
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatMinsAsHrs(row.worked_minutes)}</td>
      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${row.late_minutes && row.late_minutes > 0 ? 'text-amber-600 font-medium' : ''}`}>
        {formatMinsCompact(row.late_minutes)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${row.early_departure_minutes && row.early_departure_minutes > 0 ? 'text-amber-600 font-medium' : ''}`}>
        {formatMinsCompact(row.early_departure_minutes)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${row.overtime_minutes && row.overtime_minutes > 0 ? 'text-primary font-medium' : ''}`}>
        {formatMinsCompact(row.overtime_minutes)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatIstTime(row.scheduled_start_at)}</td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatIstTime(row.scheduled_end_at)}</td>
      <td className="px-3 py-2">{formatLocation(row.first_in_outlet_name, row.first_in_lat, row.first_in_lng)}</td>
      <td className="px-3 py-2">{formatLocation(row.last_out_outlet_name, row.last_out_lat, row.last_out_lng)}</td>
    </tr>
  )
}

function formatMinsAsHrs(mins: number | null): string {
  if (mins == null) return '—'
  return (mins / 60).toFixed(2)
}

function formatMinsCompact(mins: number | null): string {
  if (mins == null) return '—'
  if (mins === 0) return '0'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatLocation(
  outletName: string | null,
  lat: number | null,
  lng: number | null,
): React.ReactNode {
  if (!outletName && lat == null) return <span className="text-muted-foreground">—</span>
  const mapsHref =
    lat != null && lng != null
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null
  return (
    <div className="flex flex-col">
      <span>{outletName ?? '—'}</span>
      {mapsHref ? (
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {lat!.toFixed(4)}, {lng!.toFixed(4)}
        </a>
      ) : null}
    </div>
  )
}

function downloadDetailedCsv(rows: AttendanceDetailedRow[]) {
  const header = [
    'Date',
    'Emp code',
    'Name',
    'Status',
    'Punch in',
    'Punch out',
    'Hours worked',
    'Late arrival (mins)',
    'Early departure (mins)',
    'Overtime (mins)',
    'Shift start',
    'Shift end',
    'Punch in location',
    'Punch in lat',
    'Punch in lng',
    'Punch out location',
    'Punch out lat',
    'Punch out lng',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csv(formatDateDDMMYY(r.work_date)),
        csv(r.employee_code),
        csv(r.employee_name),
        csv(r.status),
        csv(formatIstTime(r.first_in_at)),
        csv(formatIstTime(r.last_out_at)),
        csv(formatMinsAsHrs(r.worked_minutes)),
        r.late_minutes ?? '',
        r.early_departure_minutes ?? '',
        r.overtime_minutes ?? '',
        csv(formatIstTime(r.scheduled_start_at)),
        csv(formatIstTime(r.scheduled_end_at)),
        csv(r.first_in_outlet_name ?? ''),
        r.first_in_lat ?? '',
        r.first_in_lng ?? '',
        csv(r.last_out_outlet_name ?? ''),
        r.last_out_lat ?? '',
        r.last_out_lng ?? '',
      ].join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `attendance-detailed-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Row({
  row,
  summary,
}: {
  row: AttendanceReportRow
  summary?: { pending: number; used: number }
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2 whitespace-nowrap">{formatDateDDMMYY(row.work_date)}</td>
      <td className="px-3 py-2 whitespace-nowrap">{row.employee_code}</td>
      <td className="px-3 py-2">{row.employee_name}</td>
      <td className="px-3 py-2">{row.designation_name ?? '—'}</td>
      <td className="px-3 py-2">{row.outlet_name ?? '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatIstTime(row.first_in_at)}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatIstTime(row.last_out_at)}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatLateHours(row.late_minutes)}</td>
      <td className="px-3 py-2">
        <StatusPill status={row.status} />
      </td>
      <td className="px-3 py-2 tabular-nums">{summary ? summary.pending : '—'}</td>
      <td className="px-3 py-2 tabular-nums">{summary ? summary.used : '—'}</td>
    </tr>
  )
}

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {label}
    </button>
  )
}

function StatusPill({ status }: { status: AttendanceStatus }) {
  const cls =
    status === 'present'
      ? 'bg-primary/10 text-primary'
      : status === 'late'
      ? 'bg-amber-500/10 text-amber-600'
      : status === 'on_leave'
      ? 'bg-blue-500/10 text-blue-600'
      : 'bg-destructive/10 text-destructive'
  const label =
    status === 'on_leave' ? 'On leave' : status[0].toUpperCase() + status.slice(1)
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function formatDateDDMMYY(isoDate: string): string {
  // work_date is a plain YYYY-MM-DD — parse as local, no tz shift.
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y.slice(-2)}`
}

function formatIstTime(ts: string | null): string {
  if (!ts) return '—'
  return formatInTimeZone(new Date(ts), IST, 'h:mm a')
}

function formatLateHours(mins: number | null): string {
  if (mins == null) return '—'
  if (mins === 0) return '0'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function downloadCsv(
  rows: AttendanceReportRow[],
  summaryByEmp: Map<string, { pending: number; used: number }>,
) {
  const header = [
    'Date',
    'Emp code',
    'Name',
    'Designation',
    'Outlet',
    'Punch in (IST)',
    'Punch out (IST)',
    'Late (hrs)',
    'Status',
    'Leaves pending',
    'Leaves used',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    const s = summaryByEmp.get(r.employee_id)
    lines.push(
      [
        csv(formatDateDDMMYY(r.work_date)),
        csv(r.employee_code),
        csv(r.employee_name),
        csv(r.designation_name ?? ''),
        csv(r.outlet_name ?? ''),
        csv(formatIstTime(r.first_in_at)),
        csv(formatIstTime(r.last_out_at)),
        csv(formatLateHours(r.late_minutes)),
        csv(r.status),
        s?.pending ?? '',
        s?.used ?? '',
      ].join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `attendance-report-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function csv(s: string | number): string {
  const str = String(s)
  if (/[,"\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}
