import { useState } from 'react'
import { toast } from 'sonner'
import { TrendingDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAppSetting, useSetAppSetting } from '@/lib/appSettings'
import { useClosePip, usePips, type PipStatus } from '@/lib/pip'

export default function PipsPage() {
  const { data = [], isLoading } = usePips()
  const close = useClosePip()
  const [filter, setFilter] = useState<'all' | PipStatus>('open')
  const filtered = filter === 'all' ? data : data.filter((p) => p.status === filter)

  async function onClose(id: string, outcome: 'pass' | 'fail') {
    const note = prompt(`Closing PIP as ${outcome}. Notes (optional)?`) ?? undefined
    try {
      await close.mutateAsync({ id, outcome, notes: note })
      toast.success(`PIP closed: ${outcome}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <>
      <PageHeader
        title="PIPs"
        description="Performance Improvement Plans. Auto-opened when an employee shows a configurable trend of low evaluations."
      />
      <PipSettingsCard />
      <div className="my-3 flex flex-wrap gap-1.5">
        {(['all', 'open', 'review', 'closed_pass', 'closed_fail'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
              (filter === s
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface text-muted-foreground hover:border-primary/50')
            }
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')} ·{' '}
            {s === 'all' ? data.length : data.filter((p) => p.status === s).length}
          </button>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Outlet</th>
                  <th className="px-4 py-2.5">Started</th>
                  <th className="px-4 py-2.5">Target</th>
                  <th className="px-4 py-2.5">Trigger</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No PIPs.</td></tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.full_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{p.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.outlet_name ?? '—'}</td>
                      <td className="px-4 py-3 font-mono">{p.started_on}</td>
                      <td className="px-4 py-3 font-mono">{p.target_date}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {p.score_pct_at_trigger != null
                          ? `${Number(p.score_pct_at_trigger).toFixed(0)}% (≤${Number(p.threshold_pct_at_trigger).toFixed(0)}%, ${p.consecutive_low_at_trigger}× low)`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={
                          'rounded-md px-2 py-0.5 text-xs font-medium capitalize ' +
                          (p.status === 'closed_pass' ? 'bg-primary/10 text-primary' :
                           p.status === 'closed_fail' ? 'bg-destructive/10 text-destructive' :
                           p.status === 'review' ? 'bg-warning/10 text-warning' :
                           'bg-amber-500/10 text-amber-700')
                        }>
                          {p.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.status === 'open' || p.status === 'review' ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => onClose(p.id, 'pass')}>
                              Pass
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onClose(p.id, 'fail')}
                              className="text-destructive hover:text-destructive">
                              Fail
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function PipSettingsCard() {
  const { data: thr = 60 } = useAppSetting<number>('pip_threshold_pct', 60)
  const { data: low = 2 } = useAppSetting<number>('pip_consecutive_low', 2)
  const { data: dur = 30 } = useAppSetting<number>('pip_default_duration_days', 30)
  const setting = useSetAppSetting()

  const [threshold, setThreshold] = useState(String(thr))
  const [need, setNeed] = useState(String(low))
  const [duration, setDuration] = useState(String(dur))

  async function save(key: string, value: number) {
    try {
      await setting.mutateAsync({ key, value })
      toast.success('Saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <TrendingDown className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Trigger settings</CardTitle>
            <CardDescription className="mt-1">
              PIP fires when the last <span className="font-mono">N</span> evaluations all score below the threshold.
            </CardDescription>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberSetting label="Threshold %" value={threshold} setValue={setThreshold}
            onSave={() => save('pip_threshold_pct', Number(threshold))} />
          <NumberSetting label="Consecutive low evaluations" value={need} setValue={setNeed}
            onSave={() => save('pip_consecutive_low', Number(need))} />
          <NumberSetting label="PIP duration (days)" value={duration} setValue={setDuration}
            onSave={() => save('pip_default_duration_days', Number(duration))} />
        </div>
      </CardContent>
    </Card>
  )
}

function NumberSetting({
  label, value, setValue, onSave,
}: {
  label: string
  value: string
  setValue: (s: string) => void
  onSave: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex h-10 flex-1 rounded-lg border border-input bg-surface px-3 text-base sm:text-sm"
        />
        <Button size="sm" variant="outline" onClick={onSave}>Save</Button>
      </div>
    </div>
  )
}
