import { useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmployeeOption {
  id: string
  full_name: string
  employee_code?: string | null
  hint?: string | null // designation, outlet…
}

// Searchable employee picker: type part of a name or code instead of
// scrolling a long dropdown. `emptyLabel` adds a "nobody / everyone" choice.
export function EmployeeSelect({
  options,
  value,
  onChange,
  placeholder = 'Search name or code…',
  emptyLabel,
  className,
  required,
}: {
  options: EmployeeOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  emptyLabel?: string
  className?: string
  required?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.id === value)
  const label = (o: EmployeeOption) => `${o.full_name}${o.employee_code ? ` · ${o.employee_code}` : ''}`

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const list = words.length
      ? options.filter((o) => {
          const hay = `${o.full_name} ${o.employee_code ?? ''} ${o.hint ?? ''}`.toLowerCase()
          return words.every((w) => hay.includes(w))
        })
      : options
    return list.slice(0, 60)
  }, [options, query])

  const items: { id: string; text: string; hint?: string | null }[] = [
    ...(emptyLabel && !query ? [{ id: '', text: emptyLabel }] : []),
    ...matches.map((o) => ({ id: o.id, text: label(o), hint: o.hint })),
  ]

  const pick = (id: string) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div
      ref={box}
      className={cn('relative', className)}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className="h-10 w-full rounded-lg border border-border bg-surface pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={open ? query : selected ? label(selected) : value === '' && emptyLabel ? emptyLabel : ''}
        placeholder={placeholder}
        required={required && !value}
        onFocus={() => {
          setOpen(true)
          setActive(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, items.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && open) {
            e.preventDefault()
            if (items[active]) pick(items[active].id)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {value && !open ? (
        <button
          type="button"
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => pick('')}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-lg">
          {items.length ? (
            items.map((it, i) => (
              <li key={it.id || 'none'}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    'flex w-full flex-col px-3 py-1.5 text-left',
                    i === active ? 'bg-muted' : 'hover:bg-muted/60',
                    it.id === value && 'font-medium',
                  )}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(it.id)}
                >
                  {it.text}
                  {it.hint ? <span className="text-xs text-muted-foreground">{it.hint}</span> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-muted-foreground">No match</li>
          )}
        </ul>
      ) : null}
    </div>
  )
}
