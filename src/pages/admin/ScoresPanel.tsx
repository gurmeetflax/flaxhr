import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { hmTotal, loadMonthReport, type ReportEmployee } from '@/lib/attendanceReport'

const LIMITS = [10, 20, 50, 0] as const

interface Scored {
  e: ReportEmployee
  expected: number
  worked: number
  score: number | null
  punctuality: number | null
}

// Attendance score = (present + ½ × half days) ÷ days expected at work
// (days employed less week offs and leave), from the same calculation as
// payroll. Lowest first so HR sees who to follow up with.
export default function ScoresPanel({
  month,
  outletId,
  search,
}: {
  month: string
  outletId: string
  search: string
}) {
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(10)
  const [minDays, setMinDays] = useState(3)

  const q = useQuery({
    queryKey: ['attendance-scores', month, outletId],
    queryFn: () => loadMonthReport(month, outletId || null),
    staleTime: 60_000,
  })

  const ranked = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows: Scored[] = (q.data?.employees ?? []).map((e) => {
      const s = e.summary
      const expected = e.days.filter((d) => d.status === 'P' || d.status === 'HD' || d.status === 'A').length
      const worked = s.present + s.halfDays / 2
      const punched = s.present + s.halfDays
      return {
        e,
        expected,
        worked,
        score: expected ? Math.round((worked / expected) * 100) : null,
        punctuality: punched ? Math.round(((punched - s.lates) / punched) * 100) : null,
      }
    })
    return rows
      .filter((r) => r.score != null && r.expected >= minDays)
      .filter(
        (r) => !needle || r.e.name.toLowerCase().includes(needle) || r.e.code.toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          (a.score ?? 0) - (b.score ?? 0) ||
          b.e.summary.absent - a.e.summary.absent ||
          (a.punctuality ?? 0) - (b.punctuality ?? 0),
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
          Score = (present + ½ × half days) ÷ days expected at work (week offs and leave excluded). Same
          calculation as payroll.
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
                  <th className="px-3 py-2 text-right">Worked / expected</th>
                  <th className="px-3 py-2 text-right">Absent</th>
                  <th className="px-3 py-2 text-right">Half days</th>
                  <th className="px-3 py-2 text-right">Lates</th>
                  <th className="px-3 py-2 text-right">On time</th>
                  <th className="px-3 py-2 text-right">Short hrs</th>
                  <th className="px-3 py-2 text-right">Overtime</th>
                  <th className="px-3 py-2 text-right">Payable</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r, i) => {
                  const s = r.e.summary
                  return (
                    <tr key={r.e.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.e.name}</div>
                        <div className="text-xs text-muted-foreground">{r.e.code}</div>
                      </td>
                      <td className="px-3 py-2">{r.e.outlet ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <ScorePill score={r.score} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.worked} / {r.expected}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${s.absent ? 'text-destructive' : ''}`}
                      >
                        {s.absent}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${s.halfDays ? 'text-amber-600' : ''}`}
                      >
                        {s.halfDays}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${s.lates ? 'text-amber-600' : ''}`}>
                        {s.lates}
                        {s.lateCut ? <span className="text-xs"> (−{s.lateCut})</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.punctuality == null ? '—' : `${r.punctuality}%`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {hmTotal(s.shortMin)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {hmTotal(s.otMin)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.payable}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to={`/admin/employees/${r.e.id}/report?month=${month}`}
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
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                      {q.isLoading
                        ? 'Calculating scores…'
                        : q.error
                          ? "Couldn't load scores."
                          : 'Nobody in this month.'}
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
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>{score}%</span>
  )
}
