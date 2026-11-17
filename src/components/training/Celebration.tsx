import { useMemo } from 'react'
import { Award, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Badge } from '@/lib/training'
import { BADGE_ICON } from './icons'

export interface CelebrationData {
  score: number
  points: number
  level: string
  levelUp: boolean
  badges: Badge[]
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6']

// Shown when a quiz is passed: points earned, new badges, level up, and a
// short burst of confetti.
export default function Celebration({ data, onClose }: { data: CelebrationData; onClose: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 12) * 0.08,
        duration: 1.8 + ((i * 7) % 10) / 10,
        color: COLORS[i % COLORS.length],
        rotate: (i * 47) % 360,
        size: 6 + (i % 4) * 2,
      })),
    [],
  )
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Module passed"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/40 p-4"
      onClick={onClose}
    >
      <style>{`@keyframes flax-confetti { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1 } 100% { transform: translateY(110vh) rotate(540deg); opacity: 0.9 } }
@media (prefers-reduced-motion: reduce) { .flax-confetti { display: none } }`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="flax-confetti pointer-events-none absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `flax-confetti ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
      <div
        className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-surface p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <PartyPopper className="h-7 w-7" />
        </div>
        <div>
          <div className="text-xl font-semibold">Well done!</div>
          <div className="mt-1 text-sm text-muted-foreground">You passed with {Math.round(data.score)}%</div>
        </div>
        {data.points > 0 ? (
          <div className="rounded-full bg-primary px-4 py-1.5 text-lg font-semibold text-primary-foreground">
            +{data.points} points
          </div>
        ) : null}
        {data.levelUp ? (
          <div className="text-sm font-medium">
            New level: <span className="text-primary">{data.level}</span>
          </div>
        ) : null}
        {data.badges.length ? (
          <div className="flex w-full flex-col gap-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              New badge{data.badges.length > 1 ? 's' : ''}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {data.badges.map((b) => {
                const Icon = BADGE_ICON[b.key] ?? Award
                return (
                  <div
                    key={b.key}
                    className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-sm"
                  >
                    <Icon className="h-4 w-4 text-primary" /> {b.name}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
        <Button className="w-full" onClick={onClose}>
          Continue
        </Button>
      </div>
    </div>
  )
}
