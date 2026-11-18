import { Award, Lock } from 'lucide-react'
import { BADGE_ICON } from './icons'

// Badge medals: each badge has its own shape, colours and icon, with a
// ribbon. Locked badges are shown in grey with a padlock.
type Shape = 'circle' | 'hexagon' | 'star' | 'clock' | 'shield' | 'crown'

const STYLE: Record<string, { shape: Shape; ring: string; face: string; ribbon: [string, string] }> = {
  first_pass: { shape: 'circle', ring: '#16a34a', face: '#dcfce7', ribbon: ['#22c55e', '#15803d'] },
  first_try: { shape: 'hexagon', ring: '#2563eb', face: '#dbeafe', ribbon: ['#3b82f6', '#1d4ed8'] },
  perfect: { shape: 'star', ring: '#d97706', face: '#fef3c7', ribbon: ['#f59e0b', '#b45309'] },
  on_time: { shape: 'clock', ring: '#7c3aed', face: '#ede9fe', ribbon: ['#8b5cf6', '#6d28d9'] },
  safety: { shape: 'shield', ring: '#0d9488', face: '#ccfbf1', ribbon: ['#14b8a6', '#0f766e'] },
  all_done: { shape: 'crown', ring: '#b45309', face: '#fde68a', ribbon: ['#e11d48', '#9f1239'] },
}

const GREY = { ring: '#a1a1aa', face: '#f4f4f5', ribbon: ['#d4d4d8', '#a1a1aa'] as [string, string] }

function starPoints(cx: number, cy: number, r1: number, r2: number, n: number) {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1
    const a = (Math.PI * i) / n - Math.PI / 2
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}

function Medal({ shape, ring, face }: { shape: Shape; ring: string; face: string }) {
  switch (shape) {
    case 'hexagon':
      return (
        <>
          <polygon points="50,6 86,27 86,69 50,90 14,69 14,27" fill={ring} />
          <polygon points="50,15 78,31.5 78,64.5 50,81 22,64.5 22,31.5" fill={face} />
        </>
      )
    case 'star':
      return (
        <>
          <polygon points={starPoints(50, 48, 44, 36, 12)} fill={ring} />
          <circle cx="50" cy="48" r="30" fill={face} />
        </>
      )
    case 'clock':
      return (
        <>
          <circle cx="50" cy="48" r="42" fill={ring} />
          <circle cx="50" cy="48" r="34" fill={face} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (Math.PI * i) / 6
            return (
              <circle
                key={i}
                cx={50 + 38 * Math.cos(a)}
                cy={48 + 38 * Math.sin(a)}
                r="1.8"
                fill={face}
                opacity="0.9"
              />
            )
          })}
        </>
      )
    case 'shield':
      return (
        <>
          <path d="M50 4 L86 16 V46 C86 68 70 82 50 92 C30 82 14 68 14 46 V16 Z" fill={ring} />
          <path d="M50 13 L78 22.5 V46 C78 63 66 74 50 82.5 C34 74 22 63 22 46 V22.5 Z" fill={face} />
        </>
      )
    case 'crown':
      return (
        <>
          <circle cx="50" cy="50" r="40" fill={ring} />
          <circle cx="50" cy="50" r="32" fill={face} />
          <polygon points="30,14 38,4 44,12 50,1 56,12 62,4 70,14" fill={ring} />
        </>
      )
    default:
      return (
        <>
          <circle cx="50" cy="48" r="42" fill={ring} />
          <circle cx="50" cy="48" r="34" fill={face} />
          <circle cx="50" cy="48" r="38" fill="none" stroke={face} strokeWidth="1.2" strokeDasharray="2 3" />
        </>
      )
  }
}

export default function BadgeArt({
  badge,
  earned,
  size = 72,
}: {
  badge: string
  earned: boolean
  size?: number
}) {
  const s = STYLE[badge] ?? STYLE.first_pass
  const c = earned ? s : { ...s, ...GREY }
  const Icon = BADGE_ICON[badge] ?? Award
  const h = size * 1.2
  return (
    <div className="relative shrink-0" style={{ width: size, height: h }} aria-hidden>
      <svg viewBox="0 0 100 120" width={size} height={h} className="absolute inset-0">
        <path d="M30 74 L22 116 L36 108 L44 118 L50 80 Z" fill={c.ribbon[0]} />
        <path d="M70 74 L78 116 L64 108 L56 118 L50 80 Z" fill={c.ribbon[1]} />
        <Medal shape={s.shape} ring={c.ring} face={c.face} />
      </svg>
      <div
        className="absolute left-0 right-0 flex items-center justify-center"
        style={{ top: size * 0.48 - size * 0.18, height: size * 0.36 }}
      >
        {earned ? (
          <Icon style={{ width: size * 0.32, height: size * 0.32, color: s.ring }} strokeWidth={2.2} />
        ) : (
          <Lock style={{ width: size * 0.26, height: size * 0.26, color: '#a1a1aa' }} strokeWidth={2.2} />
        )}
      </div>
    </div>
  )
}
