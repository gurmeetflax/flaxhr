import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  useAttendanceReport,
  useEmployeeLeaveSummary,
  type AttendanceReportRow,
  type AttendanceStatus,
} from '@/lib/reports'

interface OutletOption {
  id: string
  display_name: string | null
}

const IST = 'Asia/Kolkata'

export default function ReportsPage() {
  const [outletId, setOutletId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('')
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
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

  return (
    <>
      <PageHeader
        title="Reports"
        description={isLoading ? 'Loading…' : `${filtered.length} rows`}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadCsv(filtered, summaryByEmp)}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

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
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

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
                      No rows in this range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  )
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
