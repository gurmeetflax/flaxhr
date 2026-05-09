import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calculator, FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { useCreatePayrollRun, usePayrollRuns } from '@/lib/payroll'

interface OutletOption {
  id: string
  display_name: string | null
}

export default function PayrollPage() {
  const outletsQ = useQuery<OutletOption[]>({
    queryKey: ['outlets-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flax_outlets')
        .select('id, display_name')
        .eq('active', true)
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
  })

  const [outletId, setOutletId] = useState<string>('')
  const [periodMonth, setPeriodMonth] = useState<string>(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1) // default last month
    return d.toISOString().slice(0, 7) // "YYYY-MM"
  })

  const runsQ = usePayrollRuns(outletId || null)
  const create = useCreatePayrollRun()

  const periodFirst = useMemo(() => `${periodMonth}-01`, [periodMonth])

  async function onCreate() {
    if (!outletId) {
      toast.error('Pick an outlet')
      return
    }
    try {
      const id = await create.mutateAsync({ outlet_id: outletId, period_month: periodFirst })
      toast.success('Draft run created')
      window.location.assign(`/admin/payroll/runs/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create')
    }
  }

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Monthly run per outlet. Computes prorated pay from attendance + paid leave, applies the deductions ledger."
      />
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Plus className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <CardTitle>Create draft run</CardTitle>
                <CardDescription className="mt-1">
                  Pick an outlet and a month. Existing draft for that outlet/month is reused.
                </CardDescription>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1 block text-xs">Outlet</Label>
                <select
                  value={outletId}
                  onChange={(e) => setOutletId(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
                >
                  <option value="">All outlets (filter)</option>
                  {(outletsQ.data ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.display_name ?? o.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Period (month)</Label>
                <Input
                  type="month"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={onCreate} loading={create.isPending} disabled={!outletId}>
                  <Calculator className="h-4 w-4" /> Create draft
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Period</th>
                    <th className="px-4 py-2.5">Outlet</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Employees</th>
                    <th className="px-4 py-2.5">Gross</th>
                    <th className="px-4 py-2.5">Net</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {runsQ.isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : (runsQ.data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        No runs yet.
                      </td>
                    </tr>
                  ) : (
                    (runsQ.data ?? []).map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono">{r.period_month?.slice(0, 7)}</td>
                        <td className="px-4 py-3">{r.outlet_name ?? r.outlet_id}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              'rounded-md px-2 py-0.5 text-xs font-medium ' +
                              (r.status === 'finalised'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-warning/10 text-warning')
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{r.employee_count}</td>
                        <td className="px-4 py-3 font-mono">₹{Number(r.total_gross).toFixed(2)}</td>
                        <td className="px-4 py-3 font-mono">₹{Number(r.total_net).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/admin/payroll/runs/${r.id}`}>
                            <Button size="sm" variant="ghost">
                              <FileText className="h-4 w-4" /> Open
                            </Button>
                          </Link>
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
