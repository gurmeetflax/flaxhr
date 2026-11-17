import type { SlideData } from '@/lib/training'
import { ICONS } from './icons'

// A presentation slide in the app's standard style: neutral card, an icon,
// an optional photo, normal type. (Older slide data may carry theme / leaf
// fields; they are ignored.)
export default function BrandSlide({ data, compact = false }: { data: SlideData; compact?: boolean }) {
  const Icon = data.icon ? ICONS[data.icon] : null
  return (
    <div className="flex w-full flex-col bg-surface">
      {data.image_url ? (
        <img
          src={data.image_url}
          alt={data.headline ?? ''}
          className={`w-full object-cover ${compact ? 'h-28' : 'h-48 sm:h-64'}`}
          loading="lazy"
        />
      ) : null}
      <div
        className={`flex flex-col gap-3 ${compact ? 'p-4' : 'p-6 sm:p-8'} ${data.image_url ? '' : 'min-h-[260px]'}`}
      >
        <div className="flex items-center gap-3">
          {Icon ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          {data.eyebrow ? (
            <div className="text-xs font-medium uppercase tracking-wider text-primary">{data.eyebrow}</div>
          ) : null}
        </div>
        {data.headline ? (
          <h2 className={`font-semibold tracking-tight text-foreground ${compact ? 'text-lg' : 'text-2xl'}`}>
            {data.headline.charAt(0) + data.headline.slice(1).toLowerCase()}
          </h2>
        ) : null}
        {data.body ? (
          <div
            className={`max-w-[65ch] space-y-3 text-muted-foreground ${compact ? 'text-xs' : 'text-sm leading-relaxed sm:text-base'}`}
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
