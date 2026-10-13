import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { Bold, Heading, List, ListOrdered, Pilcrow, Undo2 } from 'lucide-react'
import { LETTER_CSS } from '@/lib/documents'

export interface RichTextEditorHandle {
  insertText: (text: string) => void
}

// Word-style editor for letter wording. Produces the same simple HTML the
// templates use (<p>, <b>, <h3>, <ul>/<ol>), so nobody types tags by hand.
// Uses the browser's built-in editing commands; old but supported everywhere.
export default function RichTextEditor({
  ref,
  initialHtml,
  onChange,
}: {
  ref?: Ref<RichTextEditorHandle>
  initialHtml: string
  onChange: (html: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const lastRange = useRef<Range | null>(null)

  useEffect(() => {
    el.current!.innerHTML = initialHtml
    document.execCommand('defaultParagraphSeparator', false, 'p')
    // initialHtml is only the starting value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remember = () => {
    const sel = window.getSelection()
    if (sel?.rangeCount && el.current?.contains(sel.anchorNode))
      lastRange.current = sel.getRangeAt(0).cloneRange()
  }

  const restore = () => {
    const node = el.current!
    if (document.activeElement !== node) node.focus()
    const sel = window.getSelection()
    if (lastRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(lastRange.current)
    }
  }

  const run = (cmd: string, arg?: string) => {
    restore()
    document.execCommand(cmd, false, arg)
    remember()
    onChange(el.current!.innerHTML)
  }

  useImperativeHandle(ref, () => ({ insertText: (text: string) => run('insertText', text) }))

  const tools: { icon: typeof Bold; label: string; cmd: string; arg?: string }[] = [
    { icon: Bold, label: 'Bold', cmd: 'bold' },
    { icon: Heading, label: 'Heading', cmd: 'formatBlock', arg: 'h3' },
    { icon: Pilcrow, label: 'Normal text', cmd: 'formatBlock', arg: 'p' },
    { icon: List, label: 'Bullets', cmd: 'insertUnorderedList' },
    { icon: ListOrdered, label: 'Numbered list', cmd: 'insertOrderedList' },
    { icon: Undo2, label: 'Undo', cmd: 'undo' },
  ]

  return (
    <div className="rounded-lg border border-border bg-surface">
      <style>{`${LETTER_CSS} .letter.editing{max-width:none;padding:16px 20px;min-height:360px;outline:none}`}</style>
      <div className="flex flex-wrap gap-1 border-b border-border p-1.5">
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.label}
            aria-label={t.label}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(t.cmd, t.arg)}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      <div
        ref={el}
        className="letter editing"
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          remember()
          onChange(el.current!.innerHTML)
        }}
        onKeyUp={remember}
        onMouseUp={remember}
        onBlur={remember}
        onPaste={(e) => {
          // Paste as plain text so Word/WhatsApp formatting doesn't leak in.
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
      />
    </div>
  )
}
