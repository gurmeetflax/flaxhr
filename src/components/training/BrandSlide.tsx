import type { SlideData } from '@/lib/training'

// A presentation slide in the app's standard style: neutral card, normal
// type, primary-coloured label. (Older slide data may carry theme / leaf
// fields; they are ignored.)
export default function BrandSlide({ data, compact = false }: { data: SlideData; compact?: boolean }) {
  return (
    <div className={`flex w-full flex-col gap-3 bg-surface ${compact ? 'p-4' : 'min-h-[280px] p-6 sm:p-8'}`}>
      {data.eyebrow ? (
        <div className="text-xs font-medium uppercase tracking-wider text-primary">{data.eyebrow}</div>
      ) : null}
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
  )
}
