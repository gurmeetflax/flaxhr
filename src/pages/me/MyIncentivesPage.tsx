import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'

interface MyIncentive {
  run_id: string
  outlet_id: string
  outlet_name: string | null
  period_month: string
  designation_code: string | null
  designation_name: string | null
  days_present: number
  points_per_day: number
  total_points: number
  sc_payable: number
}

export default function MyIncentivesPage() {
  const { data = [], isLoading } = useQuery<MyIncentive[]>({
    queryKey: ['my-incentives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_incentives')
        .select('*')
        .order('period_month', { ascending: false })
      if (error) throw error
      return (data ?? []) as MyIncentive[]
    },
  })

  const total = data.reduce((s, r) => s + Number(r.sc_payable), 0)

  return (
    <>
      <PageHeader
        title="My incentives"
        description="Service-charge payouts from finalised monthly runs."
      />
      <Card className="mb-3">
        <CardContent className="flex items-center justify-between gap-3 p-6">
          <div>
            <CardTitle>Lifetime total</CardTitle>
            <CardDescription className="mt-1">Across all finalised SC runs</CardDescription>
          </div>
          <span className="text-2xl font-bold font-mono">₹{total.toFixed(2)}</span>
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
                  <th className="px-4 py-2.5">Designation</th>
                  <th className="px-4 py-2.5">Days</th>
                  <th className="px-4 py-2.5">Points</th>
                  <th className="px-4 py-2.5">Payout</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No incentives yet.</td></tr>
                ) : (
                  data.map((r) => (
                    <tr key={`${r.run_id}-${r.period_month}`} className="border-t border-border">
                      <td className="px-4 py-3 font-mono">{r.period_month?.slice(0, 7)}</td>
                      <td className="px-4 py-3">{r.outlet_name ?? r.outlet_id}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.designation_name ?? r.designation_code ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono">{Number(r.days_present).toFixed(1)}</td>
                      <td className="px-4 py-3 font-mono">{Number(r.total_points).toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono font-semibold">₹{Number(r.sc_payable).toFixed(2)}</td>
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
