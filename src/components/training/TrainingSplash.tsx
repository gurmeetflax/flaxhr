import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useMyTraining } from '@/lib/training'
import './brand.css'

const KEY = 'flax-training-splash-dismissed'

function dismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// Full-screen welcome when an employee has training to do: a brand splash
// the first time (nothing started yet), and a reminder after that. It never
// blocks punching in: "Later" hides it until the app is opened again.
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
      className="flax-brand fixed inset-0 z-[60] flex items-center justify-center overflow-hidden p-4"
      style={{ backgroundColor: firstTime ? '#FFDC6F' : '#252D63' }}
    >
      <img
        src={firstTime ? '/brand/leaf-orange.png' : '/brand/leaf-periwinkle.png'}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -right-16 w-72 rotate-[-18deg] select-none sm:w-96"
      />
      <img
        src="/brand/leaf-navy.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-16 w-56 rotate-[160deg] select-none opacity-90"
        style={{ display: firstTime ? undefined : 'none' }}
      />
      <div
        className="relative flex w-full max-w-md flex-col gap-5"
        style={{ color: firstTime ? '#1A1A1D' : '#FFFFFF' }}
      >
        <img
          src={firstTime ? '/brand/logo-flax-badge-ink.png' : '/brand/logo-flax-badge-white.png'}
          alt="Flax Healthy Living"
          className="h-20 w-20 object-contain"
        />
        <div className="flax-eyebrow font-bold" style={{ color: firstTime ? '#252D63' : '#FFDC6F' }}>
          {firstTime ? 'Welcome to the team' : 'Training'}
        </div>
        <h1 className="flax-brush text-6xl sm:text-7xl" style={{ color: firstTime ? '#252D63' : '#FFDC6F' }}>
          {firstTime ? 'Flax it up' : 'Keep going'}
        </h1>
        {firstTime ? (
          <p className="text-base leading-relaxed">
            Before you get going, take a few minutes to meet Flax: who we are, what we make and how we work.
            You have {pending.length} short {pending.length === 1 ? 'module' : 'modules'} to finish.
          </p>
        ) : (
          <div className="flex flex-col gap-2 text-base leading-relaxed">
            <p>
              You have {pending.length} training {pending.length === 1 ? 'module' : 'modules'} to finish
              {overdue.length ? (
                <>
                  , and <strong>{overdue.length} overdue</strong>
                </>
              ) : null}
              .
            </p>
            <ul className="flex flex-col gap-1 text-sm opacity-90">
              {pending.slice(0, 3).map((r) => (
                <li key={r.assignment_id}>
                  · {r.title}
                  {r.due_on ? ` (due ${format(parseISO(r.due_on), 'd MMM')})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={start}
            className="h-12 shrink-0 rounded-full sm:flex-1 px-6 text-sm font-bold uppercase tracking-wider"
            style={{
              backgroundColor: firstTime ? '#252D63' : '#FFDC6F',
              color: firstTime ? '#FFFFFF' : '#252D63',
            }}
          >
            {firstTime ? 'Start training' : 'Continue training'}
          </button>
          <button
            type="button"
            onClick={close}
            className="h-12 rounded-full border px-6 text-sm font-medium"
            style={{ borderColor: firstTime ? 'rgba(26,26,29,.3)' : 'rgba(255,255,255,.4)' }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
