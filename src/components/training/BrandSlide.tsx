import type { SlideData } from '@/lib/training'
import './brand.css'

// One brand slide in the Flax paper-collage style: flat paper or colour
// ground, brush headline, short copy, a leaf bleeding off the edge.
const THEMES: Record<NonNullable<SlideData['theme']>, { bg: string; fg: string; sub: string }> = {
  paper: { bg: '#E9E7DC', fg: '#252D63', sub: '#1A1A1D' },
  yellow: { bg: '#FFDC6F', fg: '#252D63', sub: '#1A1A1D' },
  navy: { bg: '#252D63', fg: '#FFDC6F', sub: '#FFFFFF' },
  teal: { bg: '#51BFAA', fg: '#252D63', sub: '#1A1A1D' },
  pink: { bg: '#F48F9C', fg: '#252D63', sub: '#1A1A1D' },
  sky: { bg: '#91DAE2', fg: '#252D63', sub: '#1A1A1D' },
}

export default function BrandSlide({ data, compact = false }: { data: SlideData; compact?: boolean }) {
  const t = THEMES[data.theme ?? 'paper'] ?? THEMES.paper
  const logo = data.theme === 'navy' ? '/brand/logo-flax-badge-white.png' : '/brand/logo-flax-badge-ink.png'
  return (
    <div
      className="flax-brand relative w-full overflow-hidden"
      style={{ backgroundColor: t.bg, color: t.sub, aspectRatio: compact ? '16 / 9' : undefined }}
    >
      {data.leaf ? (
        <img
          src={`/brand/leaf-${data.leaf}.png`}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -right-12 w-48 rotate-[-18deg] select-none opacity-95 sm:w-64"
        />
      ) : null}
      <div className={`relative flex flex-col gap-4 ${compact ? 'p-5' : 'min-h-[420px] p-6 sm:p-10'}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flax-eyebrow font-bold" style={{ color: t.fg }}>
              Flax
            </div>
            {data.eyebrow ? (
              <div className="flax-eyebrow mt-1 opacity-80" style={{ color: t.sub }}>
                {data.eyebrow}
              </div>
            ) : null}
          </div>
          <img src={logo} alt="Flax Healthy Living" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
        </div>
        {data.headline ? (
          <h2
            className={`flax-brush ${compact ? 'text-3xl' : 'mt-6 text-5xl sm:text-7xl'}`}
            style={{ color: t.fg }}
          >
            {data.headline}
          </h2>
        ) : null}
        {data.body ? (
          <div
            className={`max-w-[46ch] space-y-3 ${compact ? 'text-xs' : 'text-base leading-relaxed sm:text-lg'}`}
          >
            {data.body.split(/\n\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
