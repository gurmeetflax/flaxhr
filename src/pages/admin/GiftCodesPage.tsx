import { useState } from 'react'
import { toast } from 'sonner'
import { Cake, Gift, Play, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import { useAppSetting, useSetAppSetting } from '@/lib/appSettings'
import {
  useAddGiftCodes,
  useBirthdaysToday,
  useDeleteGiftCode,
  useGiftCodeStats,
  useGiftCodes,
  useRunBirthdaysToday,
} from '@/lib/giftCodes'

export default function GiftCodesPage() {
  return (
    <>
      <PageHeader
        title="Birthday vouchers"
        description="Pre-purchased gift codes assigned automatically on each employee's birthday."
      />
      <div className="flex flex-col gap-4">
        <VoucherToggleCard />
        <BirthdaysTodayCard />
        <PoolStatsCard />
        <AddCodesCard />
        <CodesListCard />
      </div>
    </>
  )
}

function VoucherToggleCard() {
  const { data: enabled = false, isLoading } = useAppSetting<boolean>(
    'birthday_voucher_enabled',
    false,
  )
  const setting = useSetAppSetting()

  const onToggle = async (next: boolean) => {
    try {
      await setting.mutateAsync({ key: 'birthday_voucher_enabled', value: next })
      toast.success(next ? 'Vouchers will be assigned' : 'Vouchers paused (wishes only)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-6">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Gift className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <CardTitle>Send a voucher with each birthday wish</CardTitle>
          <CardDescription className="mt-1">
            When on, the daily birthday job picks the next available code from
            the pool below. When off, employees only get a text wish.
          </CardDescription>
        </div>
        <Toggle
          checked={!!enabled}
          disabled={isLoading || setting.isPending}
          onChange={onToggle}
          ariaLabel="Toggle birthday voucher"
        />
      </CardContent>
    </Card>
  )
}

function BirthdaysTodayCard() {
  const { data: rows = [], isLoading } = useBirthdaysToday()
  const run = useRunBirthdaysToday()

  async function onRun() {
    try {
      const out = await run.mutateAsync()
      toast.success(`Sent ${out.length} birthday wish${out.length === 1 ? '' : 'es'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not run')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Cake className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <CardTitle>Birthdays today</CardTitle>
            <CardDescription className="mt-1">
              The runner is also scheduled daily at 09:00 IST. Use this for
              missed runs or testing.
            </CardDescription>
          </div>
          <Button size="sm" onClick={onRun} loading={run.isPending} disabled={rows.length === 0}>
            <Play className="h-4 w-4" /> Run now
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No birthdays today.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {rows.map((r) => (
              <li key={r.employee_id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium">{r.full_name}</span>{' '}
                  <span className="font-mono text-xs text-muted-foreground">{r.employee_code}</span>
                </span>
                <span className="text-xs text-muted-foreground">{r.personal_email ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function PoolStatsCard() {
  const { data: stats = [] } = useGiftCodeStats()
  if (stats.length === 0) return null
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-4 p-6">
        {stats.map((s) => (
          <div key={s.provider} className="rounded border border-border px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {s.provider}
            </div>
            <div className="mt-1 text-sm">
              <span className="font-mono font-semibold">{s.available}</span> available
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="font-mono">{s.assigned}</span> assigned
              {s.expired > 0 ? (
                <>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="font-mono text-warning">{s.expired}</span> expired
                </>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function AddCodesCard() {
  const add = useAddGiftCodes()
  const [codes, setCodes] = useState('')
  const [provider, setProvider] = useState('amazon')
  const [faceValue, setFaceValue] = useState('500')
  const [currency, setCurrency] = useState('INR')
  const [expiresOn, setExpiresOn] = useState('')
  const [notes, setNotes] = useState('')

  async function onSubmit() {
    const list = codes
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (list.length === 0) {
      toast.error('Paste at least one code')
      return
    }
    const fv = Number(faceValue)
    if (Number.isNaN(fv) || fv < 0) {
      toast.error('Face value must be a non-negative number')
      return
    }
    try {
      const n = await add.mutateAsync({
        codes: list,
        provider: provider.trim() || 'amazon',
        face_value: fv,
        currency: currency.trim() || 'INR',
        expires_on: expiresOn || null,
        notes: notes.trim() || null,
      })
      toast.success(`Added ${n} code${n === 1 ? '' : 's'}`)
      setCodes('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <CardTitle>Add codes to pool</CardTitle>
        <CardDescription>
          Paste codes one per line (or comma-separated). All inherit the
          provider, face value, expiry and note below.
        </CardDescription>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs">Provider</Label>
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Face value</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={faceValue}
              onChange={(e) => setFaceValue(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Currency</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Expires on (optional)</Label>
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Codes</Label>
          <textarea
            value={codes}
            onChange={(e) => setCodes(e.target.value)}
            rows={5}
            className="min-h-24 w-full rounded-lg border border-input bg-surface px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={'AMZ-XXXX-YYYY\nAMZ-AAAA-BBBB\n…'}
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Q2 batch" />
        </div>
        <div>
          <Button onClick={onSubmit} loading={add.isPending}>
            Add to pool
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CodesListCard() {
  const { data: codes = [], isLoading } = useGiftCodes()
  const remove = useDeleteGiftCode()

  async function onDelete(id: string) {
    if (!confirm('Delete this code? Assigned codes can be deleted too — the recipient just loses the link.')) return
    try {
      await remove.mutateAsync(id)
      toast.success('Deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <CardTitle>Pool</CardTitle>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No codes added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Value</th>
                  <th className="py-2 pr-3">Expires</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-mono">{c.code}</td>
                    <td className="py-2 pr-3">{c.provider}</td>
                    <td className="py-2 pr-3">
                      {c.currency} {Number(c.face_value).toFixed(2)}
                    </td>
                    <td className="py-2 pr-3">{c.expires_on ?? '—'}</td>
                    <td className="py-2 pr-3">
                      {c.assigned_to ? (
                        <span className="text-xs">
                          assigned to{' '}
                          <span className="font-medium">{c.assignee_name ?? '—'}</span>{' '}
                          <span className="font-mono text-muted-foreground">
                            {c.assignee_code ?? ''}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-primary">available</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(c.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
