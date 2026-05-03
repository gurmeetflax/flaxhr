import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { format, startOfDay, subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAttendance, getSignedSelfieUrl, type AttendanceRow } from '@/lib/attendance'

interface OutletOption {
  id: string
  display_name: string | null
}

export default function AttendancePage() {
  const [outletId, setOutletId] = useState('')
  const [type, setType] = useState<'' | 'in' | 'out'>('')
  const [source, setSource] = useState<'' | 'self' | 'regularised'>('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(format(startOfDay(subDays(new Date(), 7)), 'yyyy-MM-dd'))
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

  const { data: rows = [], isLoading } = useAttendance({
    outletId: outletId || null,
    type: type || null,
    source: source || null,
    fromDate: new Date(from).toISOString(),
    toDate: new Date(`${to}T23:59:59`).toISOString(),
    limit: 1000,
  })

  const needle = search.trim().toLowerCase()
  const filtered = needle
    ? rows.filter(
        (r) =>
          r.employee_name.toLowerCase().includes(needle) ||
          r.employee_code.toLowerCase().includes(needle),
      )
    : rows

  return (
    <>
      <PageHeader
        title="Attendance"
        description={isLoading ? 'Loading…' : `${filtered.length} punches`}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Input placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          value={type}
          onChange={(e) => setType(e.target.value as '' | 'in' | 'out')}
        >
          <option value="">In + Out</option>
          <option value="in">In only</option>
          <option value="out">Out only</option>
        </select>
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={source}
          onChange={(e) => setSource(e.target.value as '' | 'self' | 'regularised')}
        >
          <option value="">Any source</option>
          <option value="self">Self-punch</option>
          <option value="regularised">Regularised</option>
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
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Distance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Selfie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <AttendanceRowItem key={r.id} row={r} />
                ))}
                {filtered.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No punches in this range.
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

function AttendanceRowItem({ row }: { row: AttendanceRow }) {
  const tz = row.outlet_timezone ?? 'Asia/Kolkata'
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3">
        <div className="font-medium">{row.employee_name}</div>
        <div className="text-xs text-muted-foreground">{row.employee_code}</div>
      </td>
      <td className="px-4 py-3">{row.outlet_name ?? '—'}</td>
      <td className="px-4 py-3 capitalize">{row.type}</td>
      <td className="px-4 py-3">{formatInTimeZone(row.punched_at, tz, 'd MMM, h:mm a')}</td>
      <td className="px-4 py-3">{row.distance_m != null ? `${row.distance_m} m` : '—'}</td>
      <td className="px-4 py-3">
        {row.source === 'regularised' ? (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
            Regularised
          </span>
        ) : row.is_within_geofence === false ? (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
            Off-site
          </span>
        ) : (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">On-site</span>
        )}
      </td>
      <td className="px-4 py-3">
        {row.selfie_path ? <SelfieThumb path={row.selfie_path} /> : '—'}
      </td>
    </tr>
  )
}

function SelfieThumb({ path }: { path: string }) {
  const { data: url } = useQuery({
    queryKey: ['selfie-url', path],
    staleTime: 50_000,
    queryFn: () => getSignedSelfieUrl(path, 60),
  })
  if (!url) return <span className="text-xs text-muted-foreground">…</span>
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="selfie" className="h-10 w-10 rounded-md border border-border object-cover" />
    </a>
  )
}

function downloadCsv(rows: AttendanceRow[]) {
  const header = [
    'employee_code',
    'employee_name',
    'outlet',
    'type',
    'punched_at',
    'distance_m',
    'is_within_geofence',
    'source',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csv(r.employee_code),
        csv(r.employee_name),
        csv(r.outlet_name ?? ''),
        r.type,
        r.punched_at,
        r.distance_m ?? '',
        r.is_within_geofence ?? '',
        r.source,
      ].join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `attendance-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function csv(s: string): string {
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
