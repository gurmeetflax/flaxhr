import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useMyTraining } from '@/lib/training'

const KEY = 'flax-training-splash-dismissed'

function dismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// Shown when an employee has training to do: a welcome the first time
// (nothing started yet), and a reminder after that. It never blocks
// punching in: "Later" hides it until the app is opened again.
export default function TrainingSplash() {
  const q = useMyTraining()
  const nav = useNavigate()
  const loc = useLocation()
  const [hidden, setHidden] = useState(dismissedThisSession)

  const rows = q.data ?? []
  const pending = rows.filter((r) => r.status !== 'passed')
  if (hidden || !pending.length || loc.pathname.startsWith('/me/training')) return null

  const today = format(new Date(), 'yyyy-MM-dd')
  const overdue = pending.filter((r) => r.due_on && r.due_on < today)
  const firstTime = rows.every((r) => r.viewed === 0 && r.attempts === 0)
  const next = pending[0]

  const close = () => {
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* private mode: just hide for now */
    }
    setHidden(true)
  }

  const start = () => {
    close()
    nav(`/me/training/${next.module_id}`)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Training"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {firstTime ? 'Welcome to Flax' : 'You have training to finish'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {pending.length} {pending.length === 1 ? 'module' : 'modules'} to complete
              {overdue.length ? ` · ${overdue.length} overdue` : ''}
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {firstTime
            ? 'Before you get started, take a few minutes to learn about Flax and how we work. Each module ends with a short quiz.'
            : 'Please finish your assigned training. Your progress and scores are shared with HR and your manager.'}
        </p>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
          {pending.slice(0, 4).map((r) => {
            const late = r.due_on && r.due_on < today
            return (
              <li key={r.assignment_id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span>{r.title}</span>
                {r.due_on ? (
                  <span
                    className={`shrink-0 text-xs ${late ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
                  >
                    {late ? 'Overdue' : `Due ${format(parseISO(r.due_on), 'd MMM')}`}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button className="sm:flex-1" size="lg" onClick={start}>
            {firstTime ? 'Start training' : 'Continue training'}
          </Button>
          <Button variant="outline" size="lg" onClick={close}>
            Later
          </Button>
        </div>
      </div>
    </div>
  )
}
