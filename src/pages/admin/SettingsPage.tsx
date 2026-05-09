import { useState } from 'react'
import { toast } from 'sonner'
import { Bell, Briefcase, Camera, Pencil, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import { useAppSetting, useSetAppSetting } from '@/lib/appSettings'
import {
  useDesignations,
  useUpsertDesignation,
  useDeleteDesignation,
  type Designation,
} from '@/lib/designations'

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="App-wide toggles and master lists."
      />
      <div className="flex flex-col gap-4">
        <SelfieRequiredCard />
        <NotificationEmailCard />
        <DesignationsCard />
      </div>
    </>
  )
}

function SelfieRequiredCard() {
  const { data: required = true, isLoading } = useAppSetting<boolean>(
    'selfie_required',
    true,
  )
  const setting = useSetAppSetting()

  const onToggle = async (next: boolean) => {
    try {
      await setting.mutateAsync({ key: 'selfie_required', value: next })
      toast.success(next ? 'Selfie now required on punch' : 'Selfie no longer required')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-6">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Camera className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <CardTitle>Require selfie on punch in/out</CardTitle>
          <CardDescription className="mt-1">
            When on, every punch must include a selfie. Turn off to let
            employees punch with just location.
          </CardDescription>
        </div>
        <Toggle
          checked={!!required}
          disabled={isLoading || setting.isPending}
          onChange={onToggle}
          ariaLabel="Toggle selfie requirement"
        />
      </CardContent>
    </Card>
  )
}

function NotificationEmailCard() {
  const { data: enabled = true, isLoading } = useAppSetting<boolean>(
    'notif_email_enabled',
    true,
  )
  const setting = useSetAppSetting()

  const onToggle = async (next: boolean) => {
    try {
      await setting.mutateAsync({ key: 'notif_email_enabled', value: next })
      toast.success(next ? 'Email notifications enabled' : 'Email notifications paused')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-6">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Bell className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <CardTitle>Send notification emails</CardTitle>
          <CardDescription className="mt-1">
            Global kill-switch. Off = no outbound emails (in-app bell still
            works). Each employee can also opt out individually.
          </CardDescription>
        </div>
        <Toggle
          checked={!!enabled}
          disabled={isLoading || setting.isPending}
          onChange={onToggle}
          ariaLabel="Toggle notification emails"
        />
      </CardContent>
    </Card>
  )
}

function DesignationsCard() {
  const { data: designations = [], isLoading } = useDesignations()
  const upsert = useUpsertDesignation()
  const remove = useDeleteDesignation()

  const [editing, setEditing] = useState<Designation | null>(null)
  const [draftCode, setDraftCode] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftPoints, setDraftPoints] = useState('1')
  const [adding, setAdding] = useState(false)

  function startAdd() {
    setEditing(null)
    setDraftCode('')
    setDraftName('')
    setDraftPoints('1')
    setAdding(true)
  }
  function startEdit(d: Designation) {
    setAdding(false)
    setEditing(d)
    setDraftCode(d.code)
    setDraftName(d.name)
    setDraftPoints(String(d.sc_points_per_day ?? 1))
  }
  function cancel() {
    setAdding(false)
    setEditing(null)
    setDraftCode('')
    setDraftName('')
    setDraftPoints('1')
  }
  async function save() {
    const code = draftCode.trim().toLowerCase()
    const name = draftName.trim()
    if (!code || !name) {
      toast.error('Code and name are required.')
      return
    }
    if (!/^[a-z0-9_-]+$/.test(code)) {
      toast.error('Code can only contain lowercase letters, digits, _ and -.')
      return
    }
    const points = Number(draftPoints)
    if (Number.isNaN(points) || points < 0) {
      toast.error('Points/day must be 0 or more.')
      return
    }
    try {
      await upsert.mutateAsync({
        code,
        name,
        is_active: editing?.is_active ?? true,
        display_order: editing?.display_order ?? designations.length * 10 + 10,
        sc_points_per_day: points,
      })
      toast.success(editing ? 'Designation updated' : 'Designation added')
      cancel()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }
  async function toggleActive(d: Designation) {
    try {
      await upsert.mutateAsync({
        code: d.code,
        name: d.name,
        is_active: !d.is_active,
        display_order: d.display_order,
        sc_points_per_day: d.sc_points_per_day,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update')
    }
  }
  async function onDelete(d: Designation) {
    if (!confirm(`Delete "${d.name}"? Employees with this designation will have it cleared.`)) return
    try {
      await remove.mutateAsync(d.code)
      toast.success('Designation deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Briefcase className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <CardTitle>Designations</CardTitle>
            <CardDescription className="mt-1">
              Job titles. Used for the dropdown on every employee. Deactivating
              hides a designation from the dropdown without breaking existing
              assignments.
            </CardDescription>
          </div>
          <Button size="sm" onClick={startAdd}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : designations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No designations yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {designations.map((d) => (
              <li key={d.code} className="flex items-center gap-3 py-2">
                <div className="flex-1">
                  <div className="font-medium">{d.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{d.code}</div>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  SC pts/day:{' '}
                  <span className="font-mono">{Number(d.sc_points_per_day ?? 1).toFixed(2)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => toggleActive(d)}
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (d.is_active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground')
                  }
                >
                  {d.is_active ? 'Active' : 'Inactive'}
                </button>
                <Button size="sm" variant="ghost" onClick={() => startEdit(d)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(d)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {(adding || editing) ? (
          <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-[1fr_2fr_120px_auto_auto]">
            <div>
              <Label className="mb-1 block text-xs">Code</Label>
              <Input
                value={draftCode}
                onChange={(e) => setDraftCode(e.target.value)}
                placeholder="cashier"
                disabled={!!editing}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Name</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Cashier"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">SC pts/day</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={draftPoints}
                onChange={(e) => setDraftPoints(e.target.value)}
                placeholder="1.00"
              />
            </div>
            <Button onClick={save} loading={upsert.isPending} className="self-end">
              {editing ? 'Save' : 'Add'}
            </Button>
            <Button variant="ghost" onClick={cancel} className="self-end">
              Cancel
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
        (checked ? 'bg-primary' : 'bg-muted') +
        ' disabled:opacity-50'
      }
    >
      <span
        className={
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
          (checked ? 'translate-x-5' : 'translate-x-0.5')
        }
      />
    </button>
  )
}
