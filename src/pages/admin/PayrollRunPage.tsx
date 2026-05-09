import { useNavigate, useParams } from 'react-router-dom'
import { Calculator, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  useComputePayrollRun,
  useFinalisePayrollRun,
  usePayrollLines,
  usePayrollRun,
} from '@/lib/payroll'

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: run } = usePayrollRun(id)
  const { data: lines = [], isLoading } = usePayrollLines(id)
  const compute = useComputePayrollRun()
  const finalise = useFinalisePayrollRun()

  if (!id) return null

  const isDraft = run?.status === 'draft'

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
                Gross ₹{totalGross.toFixed(2)} · Deductions ₹{totalDed.toFixed(2)} · Net ₹
                {totalNet.toFixed(2)} · {lines.length} employees
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {isDraft ? (
                <>
                  <Button variant="outline" onClick={onCompute} loading={compute.isPending}>
                    <Calculator className="h-4 w-4" /> Recompute
                  </Button>
                  <Button onClick={onFinalise} loading={finalise.isPending}>
                    <CheckCircle2 className="h-4 w-4" /> Finalise
                  </Button>
                </>
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
                    <th className="px-3 py-2.5">Days P</th>
                    <th className="px-3 py-2.5">Leave</th>
                    <th className="px-3 py-2.5">Payable</th>
                    <th className="px-3 py-2.5">Prorated</th>
                    <th className="px-3 py-2.5">Deductions</th>
                    <th className="px-3 py-2.5">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : lines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                        {isDraft
                          ? 'No lines yet. Click Recompute to populate.'
                          : 'This run has no lines.'}
                      </td>
                    </tr>
                  ) : (
                    lines.map((l) => (
                      <tr key={l.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{l.employee_code}</td>
                        <td className="px-3 py-2 font-medium">{l.full_name}</td>
                        <td className="px-3 py-2 font-mono">{Number(l.gross).toFixed(0)}</td>
                        <td className="px-3 py-2 font-mono">{Number(l.days_present).toFixed(1)}</td>
                        <td className="px-3 py-2 font-mono">
                          {Number(l.days_paid_leave).toFixed(1)}
                        </td>
                        <td className="px-3 py-2 font-mono">{Number(l.days_payable).toFixed(1)}</td>
                        <td className="px-3 py-2 font-mono">
                          {Number(l.prorated_gross).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono text-warning">
                          {Number(l.deductions_total).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold">
                          {Number(l.net_pay).toFixed(2)}
                        </td>
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
