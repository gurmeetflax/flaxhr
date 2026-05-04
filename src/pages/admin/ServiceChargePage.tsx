import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { toast } from 'sonner'
import { CircleDollarSign, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { useSCRuns, useUpsertSCRun } from '@/lib/serviceCharge'

interface OutletOption {
  id: string
  display_name: string | null
}

export default function ServiceChargePage() {
  const [creating, setCreating] = useState(false)
  const runsQ = useSCRuns()

  return (
    <>
      <PageHeader
        title="Service charge"
        description="Per-outlet, per-month SC disbursement runs."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New run
          </Button>
        }
      />

      {creating ? (
        <NewRunCard onClose={() => setCreating(false)} />
      ) : null}

      <Card>
        <CardContent className="p-0">
          {runsQ.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : (runsQ.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <CircleDollarSign className="h-5 w-5" />
              </span>
              <p className="text-sm text-muted-foreground">
                No SC runs yet. Click <strong>New run</strong> to start one.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Period</th>
                    <th className="px-4 py-2 font-medium">Outlet</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Surcharge</th>
                    <th className="px-4 py-2 text-right font-medium">Net Payable</th>
                    <th className="px-4 py-2 text-right font-medium">Point ₹</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runsQ.data!.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">
                        {format(new Date(r.period_month), 'MMM yyyy')}
                      </td>
                      <td className="px-4 py-2">{r.outlet_name ?? r.outlet_id}</td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            'rounded-full px-2 py-0.5 text-xs font-medium capitalize ' +
                            (r.status === 'final'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-amber-500/10 text-amber-600')
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {inr(r.surcharge_collected)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {r.net_payable != null ? inr(r.net_payable) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {r.point_value != null ? `₹${Number(r.point_value).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link to={`/admin/service-charge/runs/${r.id}`}>
                          <Button variant="ghost" size="sm">
                            Open
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function NewRunCard({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const upsert = useUpsertSCRun()

  const outletsQ = useQuery<OutletOption[]>({
    queryKey: ['outlets-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flax_outlets')
        .select('id, display_name')
        .eq('active', true)
        .order('display_name')
      if (error) throw error
      return (data ?? []) as OutletOption[]
    },
  })

  const [outletId, setOutletId] = useState('')
  const [periodMonth, setPeriodMonth] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!outletId) return toast.error('Pick an outlet')
    try {
      const id = await upsert.mutateAsync({
        outlet_id: outletId,
        period_month: periodMonth,
      })
      toast.success('Run created')
      if (id) navigate(`/admin/service-charge/runs/${id}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create'
      toast.error(
        msg.includes('outlet_sc_runs_outlet_id_period_month_key')
          ? 'A run already exists for this outlet + month.'
          : msg,
      )
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-6">
        <CardTitle>New service charge run</CardTitle>
        <CardDescription className="mt-1">
          One run per outlet per month. Defaults: 30% retain, 10% MnR.
        </CardDescription>
        <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto_auto]">
          <div className="space-y-1">
            <Label className="text-xs">Outlet</Label>
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              required
              className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
            >
              <option value="">Select…</option>
              {(outletsQ.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name ?? o.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <input
              type="month"
              className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
              value={periodMonth.slice(0, 7)}
              onChange={(e) => setPeriodMonth(`${e.target.value}-01`)}
            />
          </div>
          <Button type="submit" loading={upsert.isPending} className="self-end">
            Create
          </Button>
          <Button type="button" variant="ghost" className="self-end" onClick={onClose}>
            Cancel
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
function inr(n: number | null | undefined): string {
  if (n == null) return '—'
  return inrFmt.format(Number(n))
}
