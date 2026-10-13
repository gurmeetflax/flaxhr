import { LETTER_CSS } from '@/lib/documents'

// Renders a letter as it will be signed. The HTML comes from HR-edited
// templates filled with employee data (values are escaped).
export default function LetterPreview({ html }: { html: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-zinc-100 p-3">
      <style>{LETTER_CSS}</style>
      <div className="mx-auto shadow-sm" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
