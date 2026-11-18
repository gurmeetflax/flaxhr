import { format, parseISO } from 'date-fns'
import { CheckCircle2, Clock, X, Zap } from 'lucide-react'
import { CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import BadgeArt from './BadgeArt'
import { KIND_ICON } from './icons'
import { KIND_LABEL, STATUS_LABEL, useScoreBreakdown, type BreakdownModule } from '@/lib/training'

// Drawer: how someone's points add up, module by module, and why each badge
// was (or was not) earned. employeeId null = the signed-in employee.
export default function ScoreBreakdown({
  employeeId,
  title,
  onClose,
}: {
  employeeId: string | null
  title?: string
  onClose: () => void
}) {
  const q = useScoreBreakdown(employeeId)
  const d = q.data
  const passed = d?.modules.filter((m) => m.status === 'passed') ?? []
  const pending = d?.modules.filter((m) => m.status !== 'passed') ?? []
  const sum = (k: 'quiz_points' | 'first_try_points' | 'on_time_points') =>
    passed.reduce((n, m) => n + m[k], 0)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">{title ?? d?.employee?.name ?? 'Points'}</div>
            {d?.employee ? (
              <div className="text-xs text-muted-foreground">
                {d.employee.employee_code}
                {d.employee.outlet ? ` · ${d.employee.outlet}` : ''}
              </div>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {q.isLoading ? (
          <CardDescription>Loading…</CardDescription>
        ) : q.error || !d ? (
          <CardDescription>{q.error instanceof Error ? q.error.message : 'Could not load'}</CardDescription>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Points" value={String(d.points)} />
              <Stat label="Level" value={d.level} />
              <Stat
                label={`${format(parseISO(d.month), 'MMMM')}`}
                value={d.month_rank ? `#${d.month_rank} · ${d.month_points}` : '—'}
              />
            </div>

            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="mb-2 font-medium">How the {d.points} points add up</div>
              <Line label={`Quiz scores (${passed.length} modules passed)`} value={sum('quiz_points')} />
              <Line label="Passed first try (+50 each)" value={sum('first_try_points')} />
              <Line label="Finished on time (+25 each)" value={sum('on_time_points')} />
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{d.points}</span>
              </div>
            </div>

            <section>
              <div className="mb-2 text-sm font-medium">Modules passed</div>
              {passed.length ? (
                <ul className="flex flex-col gap-2">
                  {passed.map((m) => (
                    <ModuleRow key={m.assignment_id} m={m} />
                  ))}
                </ul>
              ) : (
                <CardDescription>No module passed yet.</CardDescription>
              )}
            </section>

            {pending.length ? (
              <section>
                <div className="mb-2 text-sm font-medium">Not passed yet (0 points)</div>
                <ul className="flex flex-col gap-2">
                  {pending.map((m) => (
                    <ModuleRow key={m.assignment_id} m={m} />
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <div className="mb-2 text-sm font-medium">Badges</div>
              <ul className="flex flex-col gap-2">
                {d.badges.map((b) => (
                  <li
                    key={b.key}
                    className={`flex items-center gap-3 rounded-lg border p-2 ${
                      b.earned ? 'border-primary/30 bg-primary/5' : 'border-border'
                    }`}
                  >
                    <BadgeArt badge={b.key} earned={b.earned} size={36} />
                    <div className="min-w-0 text-sm">
                      <div className={`font-medium ${b.earned ? '' : 'text-muted-foreground'}`}>
                        {b.name}
                        {b.earned ? '' : ' · locked'}
                      </div>
                      <div className="text-xs text-muted-foreground">{b.why}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-0.5 text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function ModuleRow({ m }: { m: BreakdownModule }) {
  const Icon = KIND_ICON[m.kind]
  const passed = m.status === 'passed'
  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          {passed ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Icon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium">{m.title}</div>
            <div className="shrink-0 font-semibold tabular-nums">{m.points} pts</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {KIND_LABEL[m.kind]} ·{' '}
            {passed && m.passed_at
              ? `passed ${format(parseISO(m.passed_at), 'd MMM')}`
              : STATUS_LABEL[m.status]}
            {m.due_on ? ` · due ${format(parseISO(m.due_on), 'd MMM')}` : ''} · lessons read {m.viewed}/
            {m.lessons}
          </div>
          {passed ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <Chip>Quiz {m.quiz_points}</Chip>
              <Chip on={m.first_try_points > 0} icon={<Zap className="h-3 w-3" />}>
                {m.first_try_points
                  ? '+50 first try'
                  : `first try ${Math.round(m.first_score ?? 0)}% (needs ${m.pass_mark}%)`}
              </Chip>
              <Chip on={m.on_time_points > 0} icon={<Clock className="h-3 w-3" />}>
                {m.on_time_points ? '+25 on time' : 'late, no bonus'}
              </Chip>
            </div>
          ) : null}
          {m.history.length ? (
            <div className="mt-2 text-xs text-muted-foreground">
              {m.attempts === 1 ? '1 attempt' : `${m.attempts} attempts`}:{' '}
              {m.history
                .map(
                  (h) =>
                    `${format(parseISO(h.at), 'd MMM')} ${h.correct}/${h.total} (${Math.round(h.score)}%)${h.passed ? ' ✓' : ''}`,
                )
                .join(' · ')}
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">Quiz not taken yet</div>
          )}
        </div>
      </div>
    </li>
  )
}

function Chip({
  children,
  on = true,
  icon,
}: {
  children: React.ReactNode
  on?: boolean
  icon?: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
        on ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-border text-muted-foreground'
      }`}
    >
      {icon}
      {children}
    </span>
  )
}
