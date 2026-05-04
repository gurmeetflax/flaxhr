import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  useOutletMonthlySales,
  useUpsertOutletSales,
} from '@/lib/dashboards'

interface OutletOption {
  id: string
  display_name: string | null
}

export default function SalesPage() {
  const [periodMonth, setPeriodMonth] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )
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
  const sales = useOutletMonthlySales(periodMonth)
  const upsert = useUpsertOutletSales()
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const o of outletsQ.data ?? []) {
      const row = sales.data?.find((s) => s.outlet_id === o.id)
      next[o.id] = row ? String(row.amount) : ''
    }
    setDrafts(next)
  }, [sales.data, outletsQ.data, periodMonth])

  const onSave = async (outletId: string) => {
    const raw = drafts[outletId]?.trim() ?? ''
    if (raw === '') return
    const amount = Number(raw)
    if (Number.isNaN(amount) || amount < 0) {
      toast.error('Enter a non-negative number')
      return
    }
    try {
      await upsert.mutateAsync({ outlet_id: outletId, period_month: periodMonth, amount })
      toast.success('Sales saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const total = (sales.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Sales"
        description="Per-outlet monthly revenue. Drives manpower-cost % on the dashboard."
        actions={
          <input
            type="month"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            value={periodMonth.slice(0, 7)}
            onChange={(e) => setPeriodMonth(`${e.target.value}-01`)}
          />
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <CardTitle>{format(new Date(periodMonth), 'MMM yyyy')}</CardTitle>
              <CardDescription>
                One amount per outlet. Total: ₹
                {total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </CardDescription>
            </div>
          </div>
          {outletsQ.data && outletsQ.data.length === 0 ? (
            <CardDescription>No outlets yet.</CardDescription>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {(outletsQ.data ?? []).map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1 truncate font-medium">
                    {o.display_name ?? o.id}
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    className="h-9 w-36"
                    placeholder="₹ amount"
                    value={drafts[o.id] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [o.id]: e.target.value }))
                    }
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onSave(o.id)}
                    loading={upsert.isPending}
                  >
                    Save
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
