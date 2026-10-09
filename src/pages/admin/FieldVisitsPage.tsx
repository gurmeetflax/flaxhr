import { useState } from 'react'
import { Download, MapPin } from 'lucide-react'
import { format, startOfDay, subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { mapsLink, useFieldVisits, type FieldVisit } from '@/lib/fieldVisits'

const IST = 'Asia/Kolkata'

export default function FieldVisitsPage() {
  const [from, setFrom] = useState(format(startOfDay(subDays(new Date(), 7)), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [search, setSearch] = useState('')
  const { data: rows = [], isLoading, error } = useFieldVisits(from, to)

  const needle = search.trim().toLowerCase()
  const filtered = needle
    ? rows.filter(
        (r) =>
          r.employee_name.toLowerCase().includes(needle) ||
          r.employee_code.toLowerCase().includes(needle) ||
          r.client_name.toLowerCase().includes(needle),
      )
    : rows
  const totalMin = filtered.reduce((n, r) => n + (r.duration_min ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Field visits"
        description={
          isLoading
            ? 'Loading…'
            : `${filtered.length} meetings · ${Math.round((totalMin / 60) * 10) / 10} h in meetings`
        }
        actions={
          <Button size="sm" variant="outline" onClick={() => downloadCsv(filtered)} disabled={!filtered.length}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input placeholder="Search employee or client" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Check in</th>
                  <th className="px-4 py-3">Check out</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.employee_name}</div>
                      <div className="text-xs text-muted-foreground">{r.employee_code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.client_name}</div>
                      {r.purpose ? <div className="text-xs text-muted-foreground">{r.purpose}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <Stamp at={r.check_in_at} lat={r.check_in_lat} lng={r.check_in_lng} />
                    </td>
                    <td className="px-4 py-3">
                      {r.check_out_at && r.check_out_lat != null && r.check_out_lng != null ? (
                        <Stamp at={r.check_out_at} lat={r.check_out_lat} lng={r.check_out_lng} />
                      ) : (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                          In meeting
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{fmtDuration(r.duration_min)}</td>
                    <td className="max-w-xs px-4 py-3 text-muted-foreground">{r.outcome ?? '—'}</td>
                  </tr>
                ))}
                {!filtered.length && !isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      {error ? "Couldn't load field visits." : 'No meetings in this range.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">
        Turn on "Field staff" on an employee's profile to give them meeting check-in.
      </p>
    </>
  )
}

function Stamp({ at, lat, lng }: { at: string; lat: number; lng: number }) {
  return (
    <div>
      <div>{formatInTimeZone(at, IST, 'd MMM, h:mm a')}</div>
      <a
        href={mapsLink(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <MapPin className="h-3 w-3" /> Map
      </a>
    </div>
  )
}

function fmtDuration(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function downloadCsv(rows: FieldVisit[]) {
  const header = ['employee_code', 'employee_name', 'client', 'purpose', 'check_in', 'check_in_map', 'check_out', 'check_out_map', 'duration_min', 'outcome']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csv(r.employee_code),
        csv(r.employee_name),
        csv(r.client_name),
        csv(r.purpose ?? ''),
        formatInTimeZone(r.check_in_at, IST, 'yyyy-MM-dd HH:mm'),
        mapsLink(r.check_in_lat, r.check_in_lng),
        r.check_out_at ? formatInTimeZone(r.check_out_at, IST, 'yyyy-MM-dd HH:mm') : '',
        r.check_out_lat != null && r.check_out_lng != null ? mapsLink(r.check_out_lat, r.check_out_lng) : '',
        r.duration_min ?? '',
        csv(r.outcome ?? ''),
      ].join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `field-visits-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function csv(s: string): string {
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
