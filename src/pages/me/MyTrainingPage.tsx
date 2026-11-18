import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Award, CheckCircle2, Clock, Crown, GraduationCap, Medal, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { KIND_ICON } from '@/components/training/icons'
import PrizesCard from '@/components/training/PrizesCard'
import BadgeArt from '@/components/training/BadgeArt'
import OutletLeagueCard from '@/components/training/OutletLeagueCard'
import ScoreBreakdown from '@/components/training/ScoreBreakdown'
import DoneTick from '@/components/training/DoneTick'
import {
  KIND_LABEL,
  STATUS_LABEL,
  useMyProgress,
  useMyTraining,
  type MyModuleRow,
  type MyProgress,
} from '@/lib/training'

export default function MyTrainingPage() {
  const q = useMyTraining()
  const prog = useMyProgress()
  const rows = q.data ?? []
  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <>
      <PageHeader title="Training" description="Learn, take the quiz, earn points and badges." />
      {q.isLoading ? (
        <CardDescription>Loading…</CardDescription>
      ) : q.error ? (
        <CardDescription>
          {q.error instanceof Error ? q.error.message : 'Could not load training.'}
        </CardDescription>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <GraduationCap className="h-8 w-8 text-muted-foreground" />
            <CardTitle>No training assigned yet</CardTitle>
            <CardDescription>New modules will show up here.</CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <PrizesCard />
          {prog.data ? <ProgressCard p={prog.data} /> : null}
          <div>
            <div className="mb-2 text-sm font-medium">Your modules</div>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((r) => (
                <ModuleCard key={r.assignment_id} r={r} today={today} />
              ))}
            </div>
          </div>
          {prog.data ? <Leaderboards p={prog.data} /> : null}
          <OutletLeagueCard />
        </div>
      )}
    </>
  )
}

function ProgressCard({ p }: { p: MyProgress }) {
  const [open, setOpen] = useState(false)
  const span = p.next_level ? p.next_level - p.level_floor : 1
  const pct = p.next_level ? Math.min(100, Math.round((100 * (p.points - p.level_floor)) / span)) : 100
  const LevelIcon =
    p.level === 'Champion' ? Crown : p.level === 'Pro' ? Trophy : p.level === 'Learner' ? Medal : Award
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LevelIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Level</div>
            <div className="text-xl font-semibold">{p.level}</div>
          </div>
          <button type="button" className="text-right" onClick={() => setOpen(true)}>
            <div className="text-2xl font-semibold tabular-nums">{p.points}</div>
            <div className="text-xs text-primary underline-offset-2 hover:underline">points · see how</div>
          </button>
        </div>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>
              {p.passed} of {p.assigned} modules done
            </span>
            <span>
              {p.next_level
                ? `${p.next_level - p.points} points to ${p.next_level_name}`
                : 'Top level reached'}
            </span>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Badges</span>
            <span className="text-xs text-muted-foreground">
              {p.badges.filter((b) => b.earned).length} of {p.badges.length} collected
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {p.badges.map((b) => (
              <div
                key={b.key}
                title={b.hint}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center ${
                  b.earned ? 'border-primary/30 bg-primary/5' : 'border-border'
                }`}
              >
                <BadgeArt badge={b.key} earned={b.earned} size={56} />
                <div
                  className={`text-[11px] font-semibold leading-tight ${b.earned ? '' : 'text-muted-foreground'}`}
                >
                  {b.name}
                </div>
                <div className="text-[10px] leading-tight text-muted-foreground">{b.hint}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Points for each module you pass: your quiz score, +50 if you pass first time, +25 if you finish by
          the due date.{' '}
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => setOpen(true)}
          >
            See how your points add up
          </button>
        </p>
      </CardContent>
      {open ? <ScoreBreakdown employeeId={null} title="Your points" onClose={() => setOpen(false)} /> : null}
    </Card>
  )
}

function ModuleCard({ r, today }: { r: MyModuleRow; today: string }) {
  const steps = r.lessons + (r.questions ? 1 : 0)
  const doneSteps = Math.min(r.viewed, r.lessons) + (r.status === 'passed' ? 1 : 0)
  const pct = steps ? Math.round((100 * doneSteps) / steps) : 0
  const late = r.status !== 'passed' && r.due_on && r.due_on < today
  const Icon = KIND_ICON[r.kind]
  const passed = r.status === 'passed'
  return (
    <Link to={`/me/training/${r.module_id}`} className="block">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex h-full gap-4 p-4">
          <div className="relative h-14 w-14 shrink-0">
            <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" className="stroke-muted" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                className={passed ? 'stroke-emerald-500' : 'stroke-primary'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 100.5} 100.5`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {passed ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              ) : (
                <Icon className="h-6 w-6 text-primary" />
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[r.kind]}
            </div>
            <CardTitle className="text-base">{r.title}</CardTitle>
            {r.summary ? <CardDescription className="line-clamp-2">{r.summary}</CardDescription> : null}
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
              <span>
                {passed && r.best_score != null
                  ? `Passed · ${Math.round(r.best_score)}%`
                  : STATUS_LABEL[r.status]}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {r.est_minutes} min
              </span>
              {r.due_on && !passed ? (
                <span className={late ? 'font-medium text-destructive' : ''}>
                  {late ? 'Overdue since' : 'Due'} {format(parseISO(r.due_on), 'd MMM')}
                </span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function Leaderboards({ p }: { p: MyProgress }) {
  const [tab, setTab] = useState<'outlet' | 'company'>('outlet')
  const rows = tab === 'outlet' ? p.outlet_board : p.company_board
  const rank = tab === 'outlet' ? p.rank_outlet : p.rank_company
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" /> Leaderboard
          </CardTitle>
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            {(['outlet', 'company'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 ${tab === t ? 'bg-primary text-primary-foreground' : ''}`}
              >
                {t === 'outlet' ? 'My outlet' : 'All Flax'}
              </button>
            ))}
          </div>
        </div>
        {rank && p.points > 0 ? <div className="text-sm text-muted-foreground">You are #{rank}</div> : null}
        {rows.length ? (
          <>
            <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {rows.map((r, i) => (
                <li
                  key={`${r.name}-${i}`}
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${r.me ? 'bg-primary/5 font-medium' : ''}`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      i === 0
                        ? 'bg-amber-400 text-white'
                        : i === 1
                          ? 'bg-zinc-300'
                          : i === 2
                            ? 'bg-amber-700/70 text-white'
                            : 'bg-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    {r.name}
                    {r.me ? ' (you)' : ''} <DoneTick show={r.done} />
                    {'outlet' in r && r.outlet ? (
                      <span className="ml-1 text-xs text-muted-foreground">{r.outlet as string}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">{r.points}</span>
                </li>
              ))}
            </ol>
            {rows.some((r) => r.done) ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <DoneTick show /> finished all their training
              </div>
            ) : null}
          </>
        ) : (
          <CardDescription>No points yet. Pass a module to get on the board.</CardDescription>
        )}
      </CardContent>
    </Card>
  )
}
