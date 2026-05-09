import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import {
  useMarkAllRead,
  useMarkRead,
  useMyNotifications,
  useNotificationsRealtime,
} from '@/lib/notifications'
import { cn } from '@/lib/utils'

export default function NotificationBell({ basePath = '/me' }: { basePath?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useNotificationsRealtime()
  const { data: items = [], isLoading } = useMyNotifications(15)
  const unread = items.filter((n) => !n.read_at).length
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications (${unread} unread)`}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded p-2 text-muted-foreground hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-border">
            {isLoading ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing new.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read_at) markRead.mutate(n.id)
                    }}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted/60',
                      !n.read_at && 'bg-primary/5',
                    )}
                  >
                    <div className="flex w-full items-center gap-2">
                      {!n.read_at ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      ) : null}
                      <span className="flex-1 truncate text-sm font-medium">{n.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {fmtRelative(n.created_at)}
                      </span>
                    </div>
                    {n.body ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-border px-3 py-2 text-right">
            <Link
              to={`${basePath}/notifications`}
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function fmtRelative(iso: string): string {
  const d = new Date(iso).getTime()
  const diffSec = Math.floor((Date.now() - d) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d`
  return new Date(iso).toLocaleDateString()
}
