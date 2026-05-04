import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Download, Lock, Save, Unlock } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import {
  deriveSCNumbers,
  useFinalizeSCRun,
  useSCRun,
  useSCRunLines,
  useSCRunPreview,
  useUnlockSCRun,
  useUpsertSCLineOverride,
  useUpsertSCRun,
  type SCRunLine,
  type SCRunPreviewLine,
} from '@/lib/serviceCharge'

export default function ServiceChargeRunPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const runQ = useSCRun(id)
  const previewQ = useSCRunPreview(id)
  const linesQ = useSCRunLines(id)
  const upsertRun = useUpsertSCRun()
  const upsertLine = useUpsertSCLineOverride()
  const finalize = useFinalizeSCRun()
  const unlock = useUnlockSCRun()

  const run = runQ.data
  const isLocked = run?.status === 'final'

  const [draft, setDraft] = useState({
    surcharge_collected: '',
    surcharge_note: '',
    company_retain_pct: '30',
    mnr_pct: '10',
    breakages_amount: '',
    breakages_note: '',
    complaints_amount: '',
    complaints_note: '',
    notes: '',
  })

  useEffect(() => {
    if (!run) return
    setDraft({
      surcharge_collected: String(run.surcharge_collected ?? 0),
      surcharge_note: run.surcharge_note ?? '',
      company_retain_pct: String(run.company_retain_pct ?? 30),
      mnr_pct: String(run.mnr_pct ?? 10),
      breakages_amount: String(run.breakages_amount ?? 0),
      breakages_note: run.breakages_note ?? '',
      complaints_amount: String(run.complaints_amount ?? 0),
      complaints_note: run.complaints_note ?? '',
      notes: run.notes ?? '',
    })
  }, [run])

  const derived = useMemo(() => {
    const n = (s: string) => Number(s) || 0
    return deriveSCNumbers({
      surcharge_collected: n(draft.surcharge_collected),
      company_retain_pct: n(draft.company_retain_pct),
      mnr_pct: n(draft.mnr_pct),
      breakages_amount: n(draft.breakages_amount),
      complaints_amount: n(draft.complaints_amount),
    })
  }, [draft])

  async function saveHeader() {
    if (!id || !run) return
    try {
      await upsertRun.mutateAsync({
        id,
        outlet_id: run.outlet_id,
        period_month: run.period_month,
        surcharge_collected: Number(draft.surcharge_collected) || 0,
        surcharge_note: draft.surcharge_note || null,
        company_retain_pct: Number(draft.company_retain_pct) || 0,
        mnr_pct: Number(draft.mnr_pct) || 0,
        breakages_amount: Number(draft.breakages_amount) || 0,
        breakages_note: draft.breakages_note || null,
        complaints_amount: Number(draft.complaints_amount) || 0,
        complaints_note: draft.complaints_note || null,
        notes: draft.notes || null,
      })
      toast.success('Saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function onFinalize() {
    if (!id) return
    if (!confirm('Finalize this run? It will lock and snapshot per-employee values.'))
      return
    // Save header first so derived values match what the server uses.
    await saveHeader()
    try {
      const result = await finalize.mutateAsync(id)
      toast.success(
        `Finalized · Net ${inr(result.net_payable)} · Point ₹${result.point_value.toFixed(2)}`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Finalize failed'
      if (msg.includes('NEGATIVE_NET_PAYABLE'))
        toast.error('Net Payable is negative — reduce deductions first.')
      else if (msg.includes('ALREADY_FINAL')) toast.error('Already finalized.')
      else toast.error(msg)
    }
  }

  async function onUnlock() {
    if (!id) return
    if (!confirm('Unlock this run? Status returns to draft (lines preserved).'))
      return
    try {
      await unlock.mutateAsync(id)
      toast.success('Unlocked')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlock failed')
    }
  }

  function exportCsv() {
    if (!run) return
    const rows: SCRunLine[] = (linesQ.data ?? [])
    const header = [
      'Sr No', 'Name', 'Designation', 'DOJ', 'Points/day',
      'Days Present', 'Total Points', 'SC Payable', 'Notes',
    ].join(',')
    const body = rows
      .map((r, i) =>
        [
          i + 1,
          csvCell(r.employee_name),
          csvCell(r.designation_name ?? ''),
          r.hired_on ?? '',
          r.points_per_day,
          r.days_present,
          r.total_points,
          r.sc_payable,
          csvCell(r.notes ?? ''),
        ].join(','),
      )
      .join('\n')
    const summary = [
      '',
      `Surcharge,${run.surcharge_collected}`,
      `Company Retain (${run.company_retain_pct}%),${(run.surcharge_collected * run.company_retain_pct) / 100}`,
      `MnR (${run.mnr_pct}%),${(run.surcharge_collected * run.mnr_pct) / 100}`,
      `Gross Payable,${run.gross_payable ?? ''}`,
      `Breakages,${run.breakages_amount}`,
      `Complaints,${run.complaints_amount}`,
      `Net Payable,${run.net_payable ?? ''}`,
      `Total Points,${run.total_points_sum ?? ''}`,
      `Point Value,${run.point_value ?? ''}`,
    ].join('\n')
    const csv = `${header}\n${body}\n${summary}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `service-charge-${run.outlet_id}-${run.period_month.slice(0, 7)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (runQ.isLoading || !run) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    )
  }

  return (
    <>
      <PageHeader
        title={`Service charge — ${format(new Date(run.period_month), 'MMM yyyy')}`}
        description={
          <>
            <span className="font-medium">{run.outlet_name ?? run.outlet_id}</span>
            {' · '}
            <span
              className={
                'rounded-full px-2 py-0.5 text-xs font-medium capitalize ' +
                (isLocked
                  ? 'bg-primary/10 text-primary'
                  : 'bg-amber-500/10 text-amber-600')
              }
            >
              {run.status}
            </span>
          </>
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/service-charge')}>
            Back
          </Button>
        }
      />

      <HeaderCard
        draft={draft}
        setDraft={setDraft}
        derived={derived}
        isLocked={isLocked}
        onSave={saveHeader}
        saving={upsertRun.isPending}
        run={run}
      />

      {!isLocked ? (
        <PreviewLinesCard
          rows={previewQ.data ?? []}
          loading={previewQ.isLoading}
          onSaveOverride={async (employee_id, days_present, points_per_day, notes) => {
            try {
              await upsertLine.mutateAsync({
                run_id: id!,
                employee_id,
                days_present,
                points_per_day,
                notes,
              })
              toast.success('Override saved')
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not save')
            }
          }}
        />
      ) : (
        <FinalLinesCard rows={linesQ.data ?? []} loading={linesQ.isLoading} />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!isLocked ? (
          <Button onClick={onFinalize} loading={finalize.isPending}>
            <Lock className="h-4 w-4" /> Finalize run
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="ghost" onClick={onUnlock} loading={unlock.isPending}>
              <Unlock className="h-4 w-4" /> Unlock
            </Button>
          </>
        )}
      </div>
    </>
  )
}

// ===========================================================================
// Header card
// ===========================================================================

interface DraftHeader {
  surcharge_collected: string
  surcharge_note: string
  company_retain_pct: string
  mnr_pct: string
  breakages_amount: string
  breakages_note: string
  complaints_amount: string
  complaints_note: string
  notes: string
}

function HeaderCard({
  draft,
  setDraft,
  derived,
  isLocked,
  onSave,
  saving,
  run,
}: {
  draft: DraftHeader
  setDraft: React.Dispatch<React.SetStateAction<DraftHeader>>
  derived: { retain: number; mnr: number; gross: number; net: number }
  isLocked: boolean
  onSave: () => void
  saving: boolean
  run: { net_payable: number | null; gross_payable: number | null; point_value: number | null; total_points_sum: number | null }
}) {
  const set = (k: keyof DraftHeader) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }))

  return (
    <Card className="mb-4">
      <CardContent className="p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Surcharge + Tip collected</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={draft.surcharge_collected}
              onChange={set('surcharge_collected')}
              disabled={isLocked}
            />
            <Input
              placeholder="Note (e.g. As per DSR)"
              value={draft.surcharge_note}
              onChange={set('surcharge_note')}
              disabled={isLocked}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Company Retain %</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={draft.company_retain_pct}
              onChange={set('company_retain_pct')}
              disabled={isLocked}
            />
            <p className="font-mono text-xs text-muted-foreground">= {inr(derived.retain)}</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">MnR %</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={draft.mnr_pct}
              onChange={set('mnr_pct')}
              disabled={isLocked}
            />
            <p className="font-mono text-xs text-muted-foreground">= {inr(derived.mnr)}</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Breakages</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={draft.breakages_amount}
              onChange={set('breakages_amount')}
              disabled={isLocked}
            />
            <Input
              placeholder="Note (e.g. As per Breakage Report)"
              value={draft.breakages_note}
              onChange={set('breakages_note')}
              disabled={isLocked}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Guest complaints</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={draft.complaints_amount}
              onChange={set('complaints_amount')}
              disabled={isLocked}
            />
            <Input
              placeholder="Note (e.g. As per HQA Report)"
              value={draft.complaints_note}
              onChange={set('complaints_note')}
              disabled={isLocked}
            />
          </div>

          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <Label className="text-xs">Run notes</Label>
            <textarea
              className="min-h-[64px] w-full rounded-lg border border-border bg-surface p-2 text-sm disabled:opacity-60"
              value={draft.notes}
              onChange={set('notes')}
              disabled={isLocked}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
          <SummaryStat label="Gross Payable" value={inr(derived.gross)} />
          <SummaryStat label="Net Payable" value={inr(derived.net)} accent />
          {isLocked ? (
            <>
              <SummaryStat
                label="Total Points"
                value={String(run.total_points_sum ?? 0)}
              />
              <SummaryStat
                label="Point Value"
                value={`₹${(run.point_value ?? 0).toFixed(2)}`}
              />
            </>
          ) : null}
          {!isLocked ? (
            <Button size="sm" variant="secondary" className="ml-auto" onClick={onSave} loading={saving}>
              <Save className="h-4 w-4" /> Save header
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className={
        'rounded-lg border px-3 py-2 ' +
        (accent
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-muted/30')
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-base font-semibold">{value}</div>
    </div>
  )
}

// ===========================================================================
// Preview lines (draft) — editable days_present + points_per_day per row
// ===========================================================================

function PreviewLinesCard({
  rows,
  loading,
  onSaveOverride,
}: {
  rows: SCRunPreviewLine[]
  loading: boolean
  onSaveOverride: (
    employee_id: string,
    days_present: number | null,
    points_per_day: number | null,
    notes: string | null,
  ) => Promise<void>
}) {
  const sumProjected = rows.reduce((s, r) => s + Number(r.projected_sc_payable ?? 0), 0)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Lines — preview</CardTitle>
            <CardDescription className="mt-1">
              Days Present is auto-counted from punch-in dates this month
              (minus 0.5 per approved half-day leave). Edit the cell to
              override; clear it to revert. Points/day comes from the
              employee's designation (editable in Settings).
            </CardDescription>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-right">
            <div className="text-[10px] uppercase text-muted-foreground">
              Projected total
            </div>
            <div className="font-mono text-sm font-semibold">{inr(sumProjected)}</div>
          </div>
        </div>

        {loading ? (
          <CardDescription>Loading…</CardDescription>
        ) : rows.length === 0 ? (
          <CardDescription>No active employees at this outlet for the period.</CardDescription>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Employee</th>
                  <th className="px-2 py-2 font-medium">Designation</th>
                  <th className="px-2 py-2 font-medium">DOJ</th>
                  <th className="px-2 py-2 text-right font-medium">Pts/day</th>
                  <th className="px-2 py-2 text-right font-medium">Days</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2 text-right font-medium">Projected ₹</th>
                  <th className="px-2 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <PreviewRow key={r.employee_id} row={r} idx={i + 1} onSaveOverride={onSaveOverride} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PreviewRow({
  row,
  idx,
  onSaveOverride,
}: {
  row: SCRunPreviewLine
  idx: number
  onSaveOverride: (
    employee_id: string,
    days_present: number | null,
    points_per_day: number | null,
    notes: string | null,
  ) => Promise<void>
}) {
  const [days, setDays] = useState(String(row.days_present_override ?? ''))
  const [ppd, setPpd] = useState(String(row.points_per_day_override ?? ''))
  const [notes, setNotes] = useState(row.notes ?? '')

  // Reset when server values change underneath us.
  useEffect(() => {
    setDays(String(row.days_present_override ?? ''))
    setPpd(String(row.points_per_day_override ?? ''))
    setNotes(row.notes ?? '')
  }, [row.days_present_override, row.points_per_day_override, row.notes])

  function commit() {
    const d = days.trim() === '' ? null : Number(days)
    const p = ppd.trim() === '' ? null : Number(ppd)
    if (d != null && (Number.isNaN(d) || d < 0)) return
    if (p != null && (Number.isNaN(p) || p < 0)) return
    void onSaveOverride(row.employee_id, d, p, notes.trim() || null)
  }

  const hasOverride = row.days_present_override != null || row.points_per_day_override != null

  return (
    <tr className={hasOverride ? 'bg-amber-500/5' : undefined}>
      <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{idx}</td>
      <td className="px-2 py-2">
        <div className="font-medium">{row.full_name}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{row.employee_code}</div>
      </td>
      <td className="px-2 py-2 text-muted-foreground">{row.designation_name || '—'}</td>
      <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
        {row.hired_on ?? '—'}
      </td>
      <td className="px-2 py-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          className="h-8 w-20 text-right font-mono text-xs"
          placeholder={String(row.points_per_day_default)}
          value={ppd}
          onChange={(e) => setPpd(e.target.value)}
          onBlur={commit}
        />
      </td>
      <td className="px-2 py-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.5"
          min={0}
          className="h-8 w-20 text-right font-mono text-xs"
          placeholder={String(row.days_present_auto)}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          onBlur={commit}
        />
      </td>
      <td className="px-2 py-2 text-right font-mono text-xs">{row.total_points}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{inr(row.projected_sc_payable)}</td>
      <td className="px-2 py-2">
        <Input
          className="h-8 text-xs"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commit}
          placeholder="—"
        />
      </td>
    </tr>
  )
}

// ===========================================================================
// Final lines (locked)
// ===========================================================================

function FinalLinesCard({ rows, loading }: { rows: SCRunLine[]; loading: boolean }) {
  const total = rows.reduce((s, r) => s + Number(r.sc_payable ?? 0), 0)
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>Lines — final</CardTitle>
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-right">
            <div className="text-[10px] uppercase text-muted-foreground">Sum payable</div>
            <div className="font-mono text-sm font-semibold">{inr(total)}</div>
          </div>
        </div>
        {loading ? (
          <CardDescription>Loading…</CardDescription>
        ) : rows.length === 0 ? (
          <CardDescription>No lines.</CardDescription>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Employee</th>
                  <th className="px-2 py-2 font-medium">Designation</th>
                  <th className="px-2 py-2 font-medium">DOJ</th>
                  <th className="px-2 py-2 text-right font-medium">Pts/day</th>
                  <th className="px-2 py-2 text-right font-medium">Days</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2 text-right font-medium">SC Payable</th>
                  <th className="px-2 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={r.employee_id} className={r.total_points === 0 ? 'opacity-60' : undefined}>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{r.employee_name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {r.employee_code}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {r.designation_name ?? '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                      {r.hired_on ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs">{r.points_per_day}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">{r.days_present}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">{r.total_points}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs font-semibold">
                      {inr(r.sc_payable)}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.notes ?? '—'}</td>
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

// ===========================================================================
// utils
// ===========================================================================

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
function inr(n: number | null | undefined): string {
  if (n == null) return '—'
  return inrFmt.format(Number(n))
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
