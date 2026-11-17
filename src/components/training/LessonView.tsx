import { AlertTriangle, ExternalLink, Store, Target } from 'lucide-react'
import { useTeamForMe, useTrainingOutlets, type Lesson } from '@/lib/training'
import BrandSlide from './BrandSlide'
import RichText from './RichText'
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
  return <RichText text={text} className="text-sm leading-relaxed text-foreground/90" />
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

      {lesson.kind === 'recipe' ? <RecipeCard lesson={lesson} media={media} /> : null}

      {media && lesson.kind === 'image' ? (
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

export function Avatar({
  name,
  photo,
  size = 'md',
}: {
  name: string
  photo?: string | null
  size?: 'md' | 'lg'
}) {
  const dim = size === 'lg' ? 'h-16 w-16 text-base' : 'h-12 w-12 text-sm'
  return photo ? (
    <img
      src={photo}
      alt={name}
      className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-surface`}
      loading="lazy"
    />
  ) : (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ring-2 ring-surface`}
    >
      {initials(name)}
    </div>
  )
}

function Tier({
  label,
  people,
  big = false,
  last = false,
}: {
  label: string
  people: { name: string; role: string; photo_url: string | null }[]
  big?: boolean
  last?: boolean
}) {
  if (!people.length) return null
  return (
    <li className="relative pl-6">
      {!last ? <span aria-hidden className="absolute left-[7px] top-4 h-full w-px bg-border" /> : null}
      <span
        aria-hidden
        className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-primary bg-surface"
      />
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{label}</div>
      <ul className={`grid gap-2 ${big ? 'sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
        {people.map((p) => (
          <li
            key={p.name}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm"
          >
            <Avatar name={p.name} photo={p.photo_url} size={big ? 'lg' : 'md'} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{p.name}</div>
              <div className="truncate text-xs text-muted-foreground">{p.role}</div>
            </div>
          </li>
        ))}
      </ul>
    </li>
  )
}

function TeamLesson() {
  const q = useTeamForMe()
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  const t = q.data
  if (!t) return null
  const region = t.region ? t.region.charAt(0).toUpperCase() + t.region.slice(1) : null
  const tiers = [
    { label: 'Leadership', people: t.leadership ?? [], big: true },
    { label: region ? `${region} team` : 'Regional team', people: t.regional ?? [] },
    { label: t.outlet ? `At ${t.outlet}` : 'Your outlet', people: t.outlet_leads ?? [] },
  ].filter((x) => x.people.length)
  return (
    <ol className="flex flex-col gap-6">
      {tiers.map((x, i) => (
        <Tier key={x.label} label={x.label} people={x.people} big={x.big} last={i === tiers.length - 1} />
      ))}
    </ol>
  )
}

function OutletsLesson() {
  const q = useTrainingOutlets()
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  const rows = q.data ?? []
  const cities = [...new Set(rows.map((o) => o.city ?? ''))]
  return (
    <div className="flex flex-col gap-3">
      {cities.map((city) => (
        <div key={city}>
          {city ? (
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {city}
            </div>
          ) : null}
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {rows
              .filter((o) => (o.city ?? '') === city)
              .map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  {o.photo_url ? (
                    <img
                      src={o.photo_url}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Store className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{o.name}</div>
                    {o.note ? <div className="truncate text-xs text-muted-foreground">{o.note}</div> : null}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function RecipeCard({ lesson, media }: { lesson: Lesson; media: string | null }) {
  const d = lesson.data
  const ings = d.ingredients ?? []
  const sized = ings.some((g) => g.qty_l)
  return (
    <div className="flex flex-col gap-3">
      {media ? (
        <img
          src={media}
          alt={lesson.title ?? ''}
          className="max-h-72 w-full rounded-xl border border-border object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {d.veg != null ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
              d.veg ? 'border-emerald-600/40 text-emerald-700' : 'border-red-600/40 text-red-700'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${d.veg ? 'bg-emerald-600' : 'bg-red-600'}`} />
            {d.veg ? 'Veg' : 'Non-veg'}
          </span>
        ) : null}
        {d.category ? <span className="rounded-full bg-muted px-2.5 py-1">{d.category}</span> : null}
        {d.kcal ? <span className="rounded-full bg-muted px-2.5 py-1">{Math.round(d.kcal)} kcal</span> : null}
        {d.protein_g ? (
          <span className="rounded-full bg-muted px-2.5 py-1">{Math.round(d.protein_g)} g protein</span>
        ) : null}
        {d.allergens?.length ? (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-800">
            Allergens: {d.allergens.join(', ')}
          </span>
        ) : null}
      </div>
      {ings.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Ingredient</th>
                <th className="px-3 py-2 font-medium">{sized ? 'Small' : 'Quantity'}</th>
                {sized ? <th className="px-3 py-2 font-medium">Large</th> : null}
              </tr>
            </thead>
            <tbody>
              {ings.map((g, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">{g.name}</td>
                  <td className="px-3 py-2 font-medium tabular-nums">{g.qty_s || '—'}</td>
                  {sized ? <td className="px-3 py-2 font-medium tabular-nums">{g.qty_l || '—'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {d.plating ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <div className="mb-1 font-medium">Plating</div>
          <RichText text={d.plating} className="text-muted-foreground" />
        </div>
      ) : null}
    </div>
  )
}
