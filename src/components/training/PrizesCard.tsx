import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { Gift, Trophy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { useMonthPrizes } from '@/lib/training'

const MEDAL = ['bg-amber-400 text-white', 'bg-zinc-300 text-zinc-800', 'bg-amber-700/80 text-white']
const PLACE = ['1st', '2nd', '3rd']

// This month's prizes, the monthly board and where I stand.
export default function PrizesCard() {
  const q = useMonthPrizes()
  const d = q.data
  if (!d) return null
  const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(d.ends), new Date()))
  return (
    <Card className="border-primary/30">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4 text-primary" /> {format(parseISO(d.month), 'MMMM')} prizes
            </CardTitle>
            <CardDescription className="mt-1">
              The top 3 learners this month win. {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left.
            </CardDescription>
          </div>
          {d.me ? (
            <div className="rounded-lg bg-primary/10 px-3 py-1.5 text-right text-sm">
              <div className="font-semibold text-primary">#{d.me.rank} this month</div>
              <div className="text-xs text-muted-foreground">{d.me.points} points</div>
            </div>
          ) : null}
        </div>
        <ol className="grid grid-cols-3 gap-2">
          {d.prizes.map((p, i) => (
            <li
              key={p.rank}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-center"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${MEDAL[i]}`}
              >
                {PLACE[i]}
              </span>
              <span className="text-sm font-semibold leading-tight">{p.title}</span>
            </li>
          ))}
        </ol>
        {d.board.length ? (
          <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {d.board.map((r) => (
              <li
                key={r.rank}
                className={`flex items-center gap-3 px-3 py-2 text-sm ${r.me ? 'bg-primary/5 font-medium' : ''}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    r.rank <= 3 ? MEDAL[r.rank - 1] : 'bg-muted'
                  }`}
                >
                  {r.rank}
                </span>
                <span className="flex-1 truncate">
                  {r.name}
                  {r.me ? ' (you)' : ''}
                  {r.outlet ? <span className="ml-1 text-xs text-muted-foreground">{r.outlet}</span> : null}
                </span>
                {r.rank <= 3 ? <Trophy className="h-3.5 w-3.5 text-amber-500" /> : null}
                <span className="tabular-nums">{r.points}</span>
              </li>
            ))}
          </ol>
        ) : (
          <CardDescription>Nobody has scored this month yet. Pass a module to take the lead.</CardDescription>
        )}
      </CardContent>
    </Card>
  )
}
