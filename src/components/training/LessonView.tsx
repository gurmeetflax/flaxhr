import { AlertTriangle, ExternalLink, MapPin, Store, Target } from 'lucide-react'
import { useTeamForMe, useTrainingOutlets, type Lesson } from '@/lib/training'
import BrandSlide from './BrandSlide'
import { stepIcon } from './icons'

// Only plain web links are shown or embedded.
function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null
  try {
    const url = new URL(u)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return u.startsWith('/') ? u : null
  }
}

function youTubeEmbed(u: string): string | null {
  const m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
}

function Paragraphs({ text }: { text?: string | null }) {
  if (!text) return null
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
      {text.split(/\n\n+/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  )
}

export default function LessonView({ lesson }: { lesson: Lesson }) {
  const media = safeUrl(lesson.media_url)
  if (lesson.kind === 'slide') {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <BrandSlide data={lesson.data} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {lesson.title ? <h2 className="text-lg font-semibold">{lesson.title}</h2> : null}
      <Paragraphs text={lesson.body} />

      {media && (lesson.kind === 'text' || lesson.kind === 'steps') ? (
        <img
          src={media}
          alt={lesson.title ?? ''}
          className="w-full rounded-lg border border-border object-cover"
          loading="lazy"
        />
      ) : null}

      {lesson.kind === 'steps' && lesson.data.steps?.length ? (
        <ol className="grid gap-3 sm:grid-cols-2">
          {lesson.data.steps.map((s, i) => {
            const Icon = stepIcon(s.title, s.body, s.icon)
            return (
              <li
                key={i}
                className={`flex flex-col overflow-hidden rounded-xl border bg-surface text-sm ${
                  s.ccp ? 'border-amber-500/60' : 'border-border'
                }`}
              >
                {s.image_url ? (
                  <img src={s.image_url} alt={s.title} className="h-36 w-full object-cover" loading="lazy" />
                ) : null}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                        s.ccp ? 'bg-amber-500/15 text-amber-700' : 'bg-primary/10 text-primary'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-semibold text-foreground">
                        {i + 1}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">{s.title}</div>
                      {s.ccp ? (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> Critical step
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {s.body ? <p className="text-muted-foreground">{s.body}</p> : null}
                  {s.target ? (
                    <div className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium">
                      <Target className="h-3.5 w-3.5" /> {s.target}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}

      {lesson.kind === 'team' ? <TeamLesson /> : null}
      {lesson.kind === 'outlets' ? <OutletsLesson /> : null}

      {lesson.kind === 'recipe' ? (
        <div className="flex flex-col gap-3">
          {lesson.data.ingredients?.length ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Ingredient</th>
                    <th className="px-3 py-2 font-medium">Small</th>
                    <th className="px-3 py-2 font-medium">Large</th>
                  </tr>
                </thead>
                <tbody>
                  {lesson.data.ingredients.map((g, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{g.name}</td>
                      <td className="px-3 py-2 tabular-nums">{g.qty_s || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{g.qty_l || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {lesson.data.plating ? (
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <div className="mb-1 font-medium">Plating</div>
              <p className="whitespace-pre-line text-muted-foreground">{lesson.data.plating}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {media && (lesson.kind === 'image' || lesson.kind === 'recipe') ? (
        <img
          src={media}
          alt={lesson.title ?? ''}
          className="w-full rounded-lg border border-border object-cover"
        />
      ) : null}

      {media && lesson.kind === 'video' ? (
        youTubeEmbed(media) ? (
          <div className="aspect-video overflow-hidden rounded-lg border border-border">
            <iframe
              src={youTubeEmbed(media) ?? undefined}
              title={lesson.title ?? 'Video'}
              className="h-full w-full"
              allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <video src={media} controls playsInline className="w-full rounded-lg border border-border" />
        )
      ) : null}

      {media && lesson.kind === 'pdf' ? (
        <div className="flex flex-col gap-2">
          <iframe
            src={media}
            title={lesson.title ?? 'PDF'}
            className="h-[70vh] w-full rounded-lg border border-border"
          />
          <a
            href={media}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm underline"
          >
            Open the PDF <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}
    </div>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function Person({ name, role, where }: { name: string; role: string; where?: string | null }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {initials(name)}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {role}
          {where ? ` · ${where}` : ''}
        </div>
      </div>
    </li>
  )
}

function TeamLesson() {
  const q = useTeamForMe()
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  const t = q.data
  if (!t) return null
  return (
    <div className="flex flex-col gap-4">
      {t.outlet_leads.length ? (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            At {t.outlet ?? 'your outlet'}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {t.outlet_leads.map((p) => (
              <Person key={p.name} name={p.name} role={p.role} />
            ))}
          </ul>
        </div>
      ) : null}
      {t.company_leads.length ? (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Company leaders
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {t.company_leads.map((p) => (
              <Person key={p.name} name={p.name} role={p.role} where={p.outlet} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function OutletsLesson() {
  const q = useTrainingOutlets()
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {(q.data ?? []).map((o) => (
        <li key={o.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
          {o.photo_url ? (
            <img src={o.photo_url} alt={o.name} className="h-36 w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-24 items-center justify-center bg-muted/50 text-muted-foreground">
              <Store className="h-8 w-8" />
            </div>
          )}
          <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
            <div className="font-medium">{o.name}</div>
            {o.city ? <div className="text-xs text-muted-foreground">{o.city}</div> : null}
            {o.note ? <p className="text-xs text-muted-foreground">{o.note}</p> : null}
            {o.lat != null && o.lng != null ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center gap-1 pt-1 text-xs underline"
              >
                <MapPin className="h-3.5 w-3.5" /> Open in Maps
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
