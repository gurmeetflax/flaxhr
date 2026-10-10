import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { hm, loadPeriod, type PeriodRow } from '@/lib/periodAttendance'

const LIMITS = [10, 20, 50, 0] as const

// Attendance score = % of working days (not week off / leave) the person
// punched in. Lowest first so HR sees who to follow up with.
export default function ScoresPanel({
  from,
  to,
  outletId,
  search,
}: {
  from: string
  to: string
  outletId: string
  search: string
}) {
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(10)
  const [minDays, setMinDays] = useState(3)

  const q = useQuery<PeriodRow[]>({
    queryKey: ['attendance-scores', from, to, outletId],
    queryFn: () => loadPeriod({ from, to, outletId: outletId || null }),
    staleTime: 60_000,
  })

  const ranked = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (q.data ?? [])
      .filter((r) => r.totals.score != null && r.totals.workingDays >= minDays)
      .filter(
        (r) =>
          !needle ||
          r.employee.full_name.toLowerCase().includes(needle) ||
          r.employee.employee_code.toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          (a.totals.score ?? 0) - (b.totals.score ?? 0) ||
          b.totals.absent - a.totals.absent ||
          (a.totals.punctuality ?? 0) - (b.totals.punctuality ?? 0),
      )
  }, [q.data, search, minDays])
  const shown = limit ? ranked.slice(0, limit) : ranked

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Show
          <select
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) as (typeof LIMITS)[number])}
          >
            {LIMITS.map((l) => (
              <option key={l} value={l}>
                {l ? `Lowest ${l}` : 'Everyone'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Min. working days
          <select
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
            value={minDays}
            onChange={(e) => setMinDays(Number(e.target.value))}
          >
            {[1, 3, 7, 15].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted-foreground">
          Score = days punched in ÷ working days (week offs and approved leave excluded).
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Outlet</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Present / working</th>
                  <th className="px-3 py-2 text-right">Absent</th>
                  <th className="px-3 py-2 text-right">Late</th>
                  <th className="px-3 py-2 text-right">No punch-out</th>
                  <th className="px-3 py-2 text-right" title="Punched in and out minutes apart — not counted as present">
                    Double taps
                  </th>
                  <th className="px-3 py-2 text-right">On time</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r, i) => {
                  const tt = r.totals
                  return (
                    <tr key={r.employee.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.employee.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.employee.employee_code}</div>
                      </td>
                      <td className="px-3 py-2">{r.employee.outlet_name ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <ScorePill score={tt.score} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {tt.present + tt.late + tt.noOut} / {tt.workingDays}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${tt.absent ? 'text-destructive' : ''}`}>
                        {tt.absent}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${tt.late ? 'text-amber-600' : ''}`}>{tt.late}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{tt.noOut}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${tt.short ? 'text-amber-600' : ''}`}>{tt.short}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {tt.punctuality == null ? '—' : `${tt.punctuality}%`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{hm(tt.workedMin)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to={`/admin/employees/${r.employee.id}/report?from=${from}&to=${to}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" /> Report
                        </Link>
                      </td>
                    </tr>
                  )
                })}
                {!shown.length ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                      {q.isLoading ? 'Calculating scores…' : q.error ? "Couldn't load scores." : 'Nobody in this range.'}
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

export function ScorePill({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground">—</span>
  const cls =
    score >= 90
      ? 'bg-primary/10 text-primary'
      : score >= 75
        ? 'bg-amber-500/10 text-amber-700'
        : 'bg-destructive/10 text-destructive'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>{score}%</span>
}
