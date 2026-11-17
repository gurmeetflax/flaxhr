import type { ReactNode } from 'react'

// Light formatting for lesson and slide text, so cards read well:
//   blank line        new paragraph
//   - item            bullet list
//   Label: rest       short label in bold (up to 4 words before the colon)
//   **words**         bold
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

function line(text: string): ReactNode {
  const m = text.match(/^([^:.!?]{1,40}):\s+(.+)$/s)
  if (m && m[1].trim().split(/\s+/).length <= 4) {
    return (
      <>
        <strong className="font-semibold text-foreground">{m[1]}:</strong> {inline(m[2])}
      </>
    )
  }
  return inline(text)
}

export default function RichText({ text, className = '' }: { text?: string | null; className?: string }) {
  if (!text) return null
  const blocks = text.split(/\n\s*\n/)
  return (
    <div className={`space-y-3 ${className}`}>
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter((l) => l.trim())
        if (lines.length && lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((l, k) => (
                <li key={k} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{line(l.replace(/^\s*[-•]\s+/, ''))}</span>
                </li>
              ))}
            </ul>
          )
        }
        if (lines.length > 1 && lines.every((l) => /^[^:.!?]{1,40}:\s+/.test(l))) {
          return (
            <div key={i} className="space-y-1.5">
              {lines.map((l, k) => (
                <p key={k}>{line(l)}</p>
              ))}
            </div>
          )
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {line(b)}
          </p>
        )
      })}
    </div>
  )
}
