import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import {
  useMarkAllRead,
  useMarkRead,
  useMyNotificationPrefs,
  useMyNotifications,
  useNotificationsRealtime,
  useUpsertMyPrefs,
} from '@/lib/notifications'
import { cn } from '@/lib/utils'

export default function NotificationsPage() {
  useNotificationsRealtime()
  const { data: items = [], isLoading } = useMyNotifications(200)
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const unread = items.filter((n) => !n.read_at).length

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Everything Flax HR has sent you."
        actions={
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={unread === 0 || markAll.isPending}
            className="text-sm text-primary disabled:opacity-50"
          >
            Mark all read
          </button>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      'px-4 py-3 transition-colors',
                      !n.read_at && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {!n.read_at ? (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      ) : (
                        <span className="mt-1 h-2 w-2 shrink-0" aria-hidden />
                      )}
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{n.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Date(n.created_at).toLocaleString()}
                          </span>
                        </div>
                        {n.body ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {n.body}
                          </p>
                        ) : null}
                        <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {n.type}
                        </div>
                      </div>
                      {!n.read_at ? (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(n.id)}
                          className="text-xs text-primary"
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <PreferencesCard />
      </div>
    </>
  )
}

function PreferencesCard() {
  const { data: prefs } = useMyNotificationPrefs()
  const upsert = useUpsertMyPrefs()
  const channelEmail = prefs?.channel_email ?? true
  const channelInapp = prefs?.channel_inapp ?? true

  async function toggle(field: 'channel_email' | 'channel_inapp') {
    try {
      await upsert.mutateAsync({
        channel_email: field === 'channel_email' ? !channelEmail : channelEmail,
        channel_inapp: field === 'channel_inapp' ? !channelInapp : channelInapp,
        mute_types: prefs?.mute_types ?? [],
      })
      toast.success('Preferences saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div>
          <CardTitle>Preferences</CardTitle>
          <CardDescription className="mt-1">
            Choose where you receive notifications. Turning a channel off mutes
            future deliveries on that channel; existing items stay visible.
          </CardDescription>
        </div>
        <PrefRow
          label="In-app bell"
          checked={channelInapp}
          onChange={() => toggle('channel_inapp')}
          disabled={upsert.isPending}
        />
        <PrefRow
          label="Email"
          checked={channelEmail}
          onChange={() => toggle('channel_email')}
          disabled={upsert.isPending}
        />
      </CardContent>
    </Card>
  )
}

function PrefRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
          'disabled:opacity-50',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}
