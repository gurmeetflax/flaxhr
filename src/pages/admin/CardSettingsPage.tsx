import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import {
  useCardReasons,
  useCardSettings,
  useSaveCardSettings,
  useUpsertCardReason,
  type CardColour,
  type CardReason,
  type CardSettings,
} from '@/lib/cards'
import { humanErr } from '@/lib/humanErr'

const DEFAULTS: CardSettings = {
  yellow_expiry_days: 90,
  red_expiry_days: 180,
  green_expiry_days: 90,
  yellows_to_red: 3,
  reds_to_pip: 2,
  reds_to_termination_review: 3,
  greens_offset_yellow: 3,
  onboarding_grace_days: 60,
  late_grace_minutes: 15,
  lates_window_days: 7,
  lates_window_n: 3,
  alert_slack: true,
  alert_email: true,
  alert_function_url: 'https://fcrwxuyyixozudwyhkcz.supabase.co/functions/v1/card-alert',
}

const NUMBER_FIELDS: [keyof CardSettings, string, string][] = [
  ['yellows_to_red', 'Yellows → 1 red', 'How many active yellows trigger a red'],
  ['reds_to_pip', 'Reds → PIP', 'How many active reds trigger a mandatory PIP'],
  ['reds_to_termination_review', 'Reds → termination review', 'Reds in 90 days that queue a termination review'],
  ['greens_offset_yellow', 'Greens offset a yellow', 'How many greens erase 1 yellow'],
  ['onboarding_grace_days', 'Onboarding grace (days)', 'First N days: no auto-cards, coaching only'],
  ['late_grace_minutes', 'Late grace (minutes)', 'Beyond this many minutes past shift start → card'],
  ['lates_window_days', 'Lates window (days)', 'Rolling window for repeated-lates check'],
  ['lates_window_n', 'Lates threshold', 'Number of lates in the window that trigger a yellow'],
  ['yellow_expiry_days', 'Yellow expiry (days)', 'How long a yellow stays active'],
  ['red_expiry_days', 'Red expiry (days)', 'How long a red stays active'],
  ['green_expiry_days', 'Green expiry (days)', 'How long a green stays active'],
]

export default function CardSettingsPage() {
  const settingsQ = useCardSettings()
  const save = useSaveCardSettings()
  const [draft, setDraft] = useState<CardSettings>(DEFAULTS)

  useEffect(() => {
    if (settingsQ.data) setDraft({ ...DEFAULTS, ...settingsQ.data })
  }, [settingsQ.data])

  async function saveAll() {
    try {
      await save.mutateAsync(draft)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(humanErr(err, 'Save failed'))
    }
  }

  return (
    <>
      <PageHeader
        title="Card settings"
        description="Thresholds, expiry and alerts for the discipline card system"
        actions={
          <Button size="sm" onClick={saveAll} loading={save.isPending}>
            <Save className="h-4 w-4" /> Save
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle>Thresholds</CardTitle>
          <CardDescription>
            Every value editable. Auto-scan runs nightly at 23:30 IST.
          </CardDescription>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {NUMBER_FIELDS.map(([key, label, hint]) => (
              <label key={key} className="flex flex-col gap-1 text-xs">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  value={String(draft[key] ?? 0)}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: Number(e.target.value) })
                  }
                />
                <span className="text-[11px] text-muted-foreground">{hint}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle>Alerts</CardTitle>
          <CardDescription>
            Every new card fires a webhook. Toggle channels here; message contents defined in the
            <span className="font-mono"> card-alert</span> Edge Function.
          </CardDescription>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.alert_slack}
              onChange={(e) => setDraft({ ...draft, alert_slack: e.target.checked })}
            />
            Post to Slack (uses <span className="font-mono">SLACK_WEBHOOK_URL</span> secret)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.alert_email}
              onChange={(e) => setDraft({ ...draft, alert_email: e.target.checked })}
            />
            Email the employee's personal email (uses <span className="font-mono">RESEND_API_KEY</span>)
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <Label className="text-xs">Alert Edge Function URL</Label>
            <Input
              value={draft.alert_function_url ?? ''}
              onChange={(e) => setDraft({ ...draft, alert_function_url: e.target.value })}
            />
          </label>
        </CardContent>
      </Card>

      <ReasonsCard />
    </>
  )
}

function ReasonsCard() {
  const { data: reasons = [] } = useCardReasons()
  const upsert = useUpsertCardReason()
  const [editing, setEditing] = useState<Partial<CardReason> | null>(null)

  async function saveReason(e: React.FormEvent) {
    e.preventDefault()
    if (!editing?.code || !editing.title || !editing.colour || !editing.category) return
    try {
      await upsert.mutateAsync({
        code: editing.code,
        title: editing.title,
        description: editing.description ?? null,
        colour: editing.colour as CardColour,
        category: editing.category,
        is_auto: editing.is_auto ?? false,
        threshold: editing.threshold ?? null,
        is_active: editing.is_active ?? true,
      })
      toast.success('Reason saved')
      setEditing(null)
    } catch (err) {
      toast.error(humanErr(err, 'Save failed'))
    }
  }

  async function toggleActive(r: CardReason) {
    try {
      await upsert.mutateAsync({
        code: r.code,
        title: r.title,
        colour: r.colour,
        category: r.category,
        is_auto: r.is_auto,
        threshold: r.threshold,
        description: r.description ?? undefined,
        is_active: !r.is_active,
      })
      toast.success(r.is_active ? 'Deactivated' : 'Activated')
    } catch (err) {
      toast.error(humanErr(err, 'Failed'))
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-0">
        <div className="flex items-center justify-between p-6 pb-3">
          <div>
            <CardTitle>Reason catalog</CardTitle>
            <CardDescription>
              What can earn a card. Deactivate the ones you don't want to use.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setEditing({ colour: 'yellow', category: 'behaviour', is_auto: false, is_active: true })
            }
          >
            New reason
          </Button>
        </div>

        {editing ? (
          <div className="mx-6 mb-4 rounded-lg border border-border p-4">
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveReason}>
              <label className="flex flex-col gap-1 text-xs">
                <Label className="text-xs">Code</Label>
                <Input
                  value={editing.code ?? ''}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toLowerCase() })}
                  required
                  disabled={reasons.some((r) => r.code === editing.code)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <Label className="text-xs">Title</Label>
                <Input
                  value={editing.title ?? ''}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <Label className="text-xs">Colour</Label>
                <select
                  className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                  value={editing.colour ?? 'yellow'}
                  onChange={(e) => setEditing({ ...editing, colour: e.target.value as CardColour })}
                >
                  <option value="yellow">🟡 Yellow</option>
                  <option value="red">🔴 Red</option>
                  <option value="green">🟢 Green</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <Label className="text-xs">Category</Label>
                <select
                  className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                  value={editing.category ?? 'behaviour'}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                >
                  {['attendance', 'behaviour', 'skill', 'compliance', 'safety', 'excellence'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input
                  type="checkbox"
                  checked={editing.is_auto ?? false}
                  onChange={(e) => setEditing({ ...editing, is_auto: e.target.checked })}
                />
                Automatic — issued by the nightly scan
              </label>
              <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                <Label className="text-xs">Description</Label>
                <textarea
                  className="min-h-[50px] rounded-lg border border-border bg-surface p-3 text-sm"
                  value={editing.description ?? ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" loading={upsert.isPending}>Save reason</Button>
              </div>
            </form>
          </div>
        ) : null}

        <ul className="divide-y divide-border">
          {reasons.map((r) => (
            <li key={r.code} className="flex items-start justify-between gap-3 p-4 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {r.colour === 'red' ? '🔴' : r.colour === 'green' ? '🟢' : '🟡'} {r.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.category} · {r.is_auto ? 'auto' : 'manual'} · <span className="font-mono">{r.code}</span>
                  </span>
                </span>
                {r.description ? (
                  <span className="text-xs text-muted-foreground">{r.description}</span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleActive(r)}
                  className={r.is_active ? 'text-destructive hover:text-destructive' : ''}
                  aria-label={r.is_active ? 'Deactivate' : 'Activate'}
                >
                  {r.is_active ? <Trash2 className="h-4 w-4" /> : 'Enable'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
