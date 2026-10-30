import { useNavigate, useParams } from 'react-router-dom'
import { Calculator, CheckCircle2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  useComputePayrollRun,
  useFinalisePayrollRun,
  usePayrollLines,
  usePayrollRun,
  useReopenPayrollRun,
} from '@/lib/payroll'

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: run } = usePayrollRun(id)
  const { data: lines = [], isLoading } = usePayrollLines(id)
  const compute = useComputePayrollRun()
  const finalise = useFinalisePayrollRun()
  const reopen = useReopenPayrollRun()

  if (!id) return null

  const isDraft = run?.status === 'draft'
  const isEmpty = !isLoading && lines.length === 0

  async function onReopen() {
    if (!confirm('Reopen this run as a draft?')) return
    try {
      await reopen.mutateAsync(id!)
      toast.success('Reopened as draft')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reopen failed')
    }
  }

  async function onCompute() {
    try {
      await compute.mutateAsync(id!)
      toast.success('Recomputed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Compute failed')
    }
  }

  async function onFinalise() {
    if (!confirm('Finalise this run? Deductions will decrement and employees will be notified.')) return
    try {
      await finalise.mutateAsync(id!)
      toast.success('Finalised')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Finalise failed')
    }
  }

  const totalGross = lines.reduce((s, l) => s + Number(l.prorated_gross), 0)
  const totalDed = lines.reduce((s, l) => s + Number(l.deductions_total), 0)
  const totalNet = lines.reduce((s, l) => s + Number(l.net_pay), 0)
  const totalOt = lines.reduce((s, l) => s + Number(l.ot_amount ?? 0), 0)

  return (
    <>
      <PageHeader
        title={`Payroll · ${run?.period_month?.slice(0, 7) ?? ''}`}
        description={`${run?.outlet_name ?? run?.outlet_id ?? ''} · ${run?.status ?? ''}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/payroll')}>
            Back
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <CardTitle>Totals</CardTitle>
              <CardDescription className="mt-1">
                Gross ₹{totalGross.toFixed(2)} · Overtime ₹{totalOt.toFixed(2)} · Deductions ₹
                {totalDed.toFixed(2)} · Net ₹{totalNet.toFixed(2)} · {lines.length} employees
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {isDraft ? (
                <>
                  <Button variant="outline" onClick={onCompute} loading={compute.isPending}>
                    <Calculator className="h-4 w-4" /> Recompute
                  </Button>
                  <Button
                    onClick={onFinalise}
                    loading={finalise.isPending}
                    disabled={isEmpty}
                    title={isEmpty ? 'Recompute first — this run has no lines.' : undefined}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Finalise
                  </Button>
                </>
              ) : isEmpty ? (
                <Button variant="outline" onClick={onReopen} loading={reopen.isPending}>
                  <RotateCcw className="h-4 w-4" /> Reopen
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Code</th>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Gross</th>
                    <th className="px-3 py-2.5" title="Full days / half days worked">
                      Full / Half
                    </th>
                    <th className="px-3 py-2.5" title="Paid week offs earned">
                      Offs
                    </th>
                    <th className="px-3 py-2.5">Leave</th>
                    <th className="px-3 py-2.5" title="Lates over 15 min; every 3 cost half a day">
                      Lates
                    </th>
                    <th className="px-3 py-2.5">Payable</th>
                    <th className="px-3 py-2.5">Prorated</th>
                    <th className="px-3 py-2.5" title="Hours beyond 9h 30m, at salary / days / 9 per hour">
                      OT
                    </th>
                    <th className="px-3 py-2.5">Deductions</th>
                    <th className="px-3 py-2.5">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : lines.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                        {isDraft ? 'No lines yet. Click Recompute to populate.' : 'This run has no lines.'}
                      </td>
                    </tr>
                  ) : (
                    lines.map((l) => (
                      <tr key={l.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{l.employee_code}</td>
                        <td className="px-3 py-2 font-medium">{l.full_name}</td>
                        <td className="px-3 py-2 font-mono">{Number(l.gross).toFixed(0)}</td>
                        <td className="px-3 py-2 font-mono">
                          {l.calc
                            ? `${l.calc.full_days} / ${l.calc.half_days}`
                            : Number(l.days_present).toFixed(1)}
                        </td>
                        <td className="px-3 py-2 font-mono">{l.calc?.week_offs ?? '—'}</td>
                        <td className="px-3 py-2 font-mono">{Number(l.days_paid_leave).toFixed(1)}</td>
                        <td className="px-3 py-2 font-mono">
                          {l.calc ? (l.calc.field_staff ? 'field' : l.calc.lates) : '—'}
                          {l.calc && l.calc.late_cut_days > 0 ? ` (−${l.calc.late_cut_days})` : ''}
                        </td>
                        <td className="px-3 py-2 font-mono">{Number(l.days_payable).toFixed(1)}</td>
                        <td className="px-3 py-2 font-mono">{Number(l.prorated_gross).toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">
                          {Number(l.ot_amount ?? 0) > 0
                            ? `${Number(l.ot_amount).toFixed(2)} (${(Number(l.ot_minutes) / 60).toFixed(1)}h)`
                            : '—'}
                          {l.calc?.long_shifts ? (
                            <span
                              className="ml-1 text-warning"
                              title={`${l.calc.long_shifts} shift(s) over 14 hours — check before paying OT`}
                            >
                              ⚠
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-mono text-warning">
                          {Number(l.deductions_total).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold">{Number(l.net_pay).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
