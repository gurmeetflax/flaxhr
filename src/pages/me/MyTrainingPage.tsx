import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { CheckCircle2, Clock, GraduationCap } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { KIND_LABEL, STATUS_LABEL, useMyTraining, type MyModuleRow } from '@/lib/training'

export default function MyTrainingPage() {
  const q = useMyTraining()
  const rows = q.data ?? []
  const done = rows.filter((r) => r.status === 'passed').length
  const today = format(new Date(), 'yyyy-MM-dd')
  const overdue = rows.filter((r) => r.status !== 'passed' && r.due_on && r.due_on < today).length

  return (
    <>
      <PageHeader
        title="Training"
        description="Read each lesson, then take the quiz. Your scores are shared with HR and your manager."
      />
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
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Tile label="Done" value={`${done} of ${rows.length}`} />
            <Tile label="To do" value={String(rows.length - done)} />
            <Tile label="Overdue" value={String(overdue)} warn={overdue > 0} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((r) => (
              <ModuleCard key={r.assignment_id} r={r} today={today} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${warn ? 'text-destructive' : ''}`}>{value}</div>
    </div>
  )
}

function ModuleCard({ r, today }: { r: MyModuleRow; today: string }) {
  const steps = r.lessons + (r.questions ? 1 : 0)
  const doneSteps = Math.min(r.viewed, r.lessons) + (r.status === 'passed' ? 1 : 0)
  const pct = steps ? Math.round((100 * doneSteps) / steps) : 0
  const late = r.status !== 'passed' && r.due_on && r.due_on < today
  return (
    <Link to={`/me/training/${r.module_id}`} className="block">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {KIND_LABEL[r.kind]}
              </div>
              <CardTitle className="mt-0.5 text-base">{r.title}</CardTitle>
            </div>
            {r.status === 'passed' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : null}
          </div>
          {r.summary ? <CardDescription>{r.summary}</CardDescription> : null}
          <div className="mt-auto flex flex-col gap-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{STATUS_LABEL[r.status]}</span>
              {r.best_score != null ? <span>Best score {Math.round(r.best_score)}%</span> : null}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {r.est_minutes} min
              </span>
              {r.due_on && r.status !== 'passed' ? (
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
