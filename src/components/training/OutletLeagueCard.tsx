import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Star, Trophy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { useOutletLeague } from '@/lib/training'

const MEDAL = ['bg-amber-400 text-white', 'bg-zinc-300 text-zinc-800', 'bg-amber-700/80 text-white']
const GRADE: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-700',
  B: 'bg-lime-500/15 text-lime-700',
  C: 'bg-amber-500/15 text-amber-700',
  D: 'bg-orange-500/15 text-orange-700',
  F: 'bg-destructive/10 text-destructive',
}

// The Operations team's monthly outlet league: winners and full table.
export default function OutletLeagueCard() {
  const q = useOutletLeague()
  const months = q.data ?? []
  const [i, setI] = useState(0)
  if (!months.length) return null
  const m = months[Math.min(i, months.length - 1)]
  const live = m.status !== 'final'
  const winners = m.rows.filter((r) => r.rank && r.rank <= 3)
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" /> Outlet league
            </CardTitle>
            <CardDescription className="mt-1">
              The Operations scorecard: ratings, kitchen speed, availability, complaints and growth.
            </CardDescription>
          </div>
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            {months.map((mm, k) => (
              <button
                key={mm.month}
                type="button"
                onClick={() => setI(k)}
                className={`rounded-md px-3 py-1 ${k === i ? 'bg-primary text-primary-foreground' : ''}`}
              >
                {format(parseISO(mm.start), 'MMM yyyy')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
            {live ? 'Leading so far' : 'Winners'}
          </div>
          <ol className="grid grid-cols-3 gap-2">
            {winners.map((w, k) => (
              <li
                key={w.outlet_id}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
                  w.outlet_id === m.my_outlet ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${MEDAL[k]}`}
                >
                  {w.rank}
                </span>
                <span className="text-sm font-semibold leading-tight">{w.outlet}</span>
                <span className="text-xs text-muted-foreground">
                  {w.score} · grade {w.grade}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Outlet</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Grade</th>
                <th className="px-3 py-2 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr
                  key={r.outlet_id}
                  className={`border-t border-border ${r.outlet_id === m.my_outlet ? 'bg-primary/5 font-medium' : ''}`}
                >
                  <td className="px-3 py-2 tabular-nums">{r.rank ?? '—'}</td>
                  <td className="px-3 py-2">
                    {r.outlet}
                    {r.outlet_id === m.my_outlet ? (
                      <span className="ml-1 text-xs text-primary">(yours)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.score ?? '—'}</td>
                  <td className="px-3 py-2">
                    {r.grade ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GRADE[r.grade] ?? 'bg-muted'}`}
                      >
                        {r.grade}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.rating ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{' '}
                        {Number(r.rating).toFixed(1)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {live ? (
          <p className="text-xs text-muted-foreground">This month is still running; ranks can change.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
