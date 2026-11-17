import { AlertTriangle, ExternalLink } from 'lucide-react'
import type { Lesson } from '@/lib/training'
import BrandSlide from './BrandSlide'

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

      {lesson.kind === 'steps' && lesson.data.steps?.length ? (
        <ol className="flex flex-col gap-2">
          {lesson.data.steps.map((s, i) => (
            <li
              key={i}
              className={`rounded-lg border p-3 text-sm ${s.ccp ? 'border-amber-500/50 bg-amber-500/5' : 'border-border'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="font-medium">{s.title}</span>
                {s.ccp ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> Critical step
                  </span>
                ) : null}
                {s.target ? (
                  <span className="ml-auto rounded-md bg-muted px-2 py-0.5 text-xs">Target: {s.target}</span>
                ) : null}
              </div>
              {s.body ? <p className="mt-1.5 text-muted-foreground">{s.body}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}

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
