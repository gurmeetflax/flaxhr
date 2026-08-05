import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  useOvertimeMonthly,
  type OvertimeMonthlyRow,
} from '@/lib/overtime'

interface OutletOption { id: string; display_name: string | null }

export default function OvertimePage() {
  const [periodMonth, setPeriodMonth] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )
  const [outletId, setOutletId] = useState('')
  const [search, setSearch] = useState('')

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

  const { data: rows = [], isLoading } = useOvertimeMonthly(periodMonth, outletId || null)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.employee_name.toLowerCase().includes(needle) ||
        r.employee_code.toLowerCase().includes(needle),
    )
  }, [rows, search])

  const totals = useMemo(() => {
    let hours = 0, amount = 0, employees = 0
    for (const r of filtered) {
      hours += r.ot_hours_total
      amount += r.ot_amount_total
      if (r.ot_hours_total > 0) employees++
    }
    return { hours, amount, employees }
  }, [filtered])

  return (
    <>
      <PageHeader
        title="Overtime"
        description={
          isLoading
            ? 'Loading…'
            : `${filtered.length} employees · ${totals.employees} with OT · ${totals.hours.toFixed(2)} hrs · ₹${totals.amount.toFixed(2)}`
        }
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadCsv(filtered, periodMonth)}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input
          type="month"
          value={periodMonth.slice(0, 7)}
          onChange={(e) => setPeriodMonth(`${e.target.value}-01`)}
        />
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
        >
          <option value="">All outlets</option>
          {outletsQ.data?.map((o) => (
            <option key={o.id} value={o.id}>{o.display_name ?? o.id}</option>
          ))}
        </select>
        <Input
          placeholder="Search employee"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Emp code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Outlet</th>
                  <th className="px-3 py-2 text-right">OT days</th>
                  <th className="px-3 py-2 text-right">Worked (hrs)</th>
                  <th className="px-3 py-2 text-right">OT (hrs)</th>
                  <th className="px-3 py-2 text-right">Hourly ₹</th>
                  <th className="px-3 py-2 text-right">OT ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.employee_id} className={r.ot_hours_total > 0 ? '' : 'text-muted-foreground'}>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{r.employee_code}</td>
                    <td className="px-3 py-2">{r.employee_name}</td>
                    <td className="px-3 py-2">{r.outlet_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ot_days}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.worked_hours_total.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.ot_hours_total > 0 ? 'font-medium text-primary' : ''}`}>
                      {r.ot_hours_total.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">₹{r.hourly_rate.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.ot_amount_total > 0 ? 'font-medium text-primary' : ''}`}>
                      ₹{r.ot_amount_total.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No overtime rows for this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-6">
          <CardTitle>How this is calculated</CardTitle>
          <CardDescription className="mt-2 text-xs">
            Regular shift = 9 hrs. Grace = 1 hr. Anything beyond 10 hrs on a work day is overtime.
            Hourly rate = monthly_salary ÷ (working_days × regular_hours) — defaults 26 × 9 = 234 hrs/month.
            All values editable in <span className="font-mono">core.app_settings.overtime_settings</span>.
          </CardDescription>
        </CardContent>
      </Card>
    </>
  )
}

function downloadCsv(rows: OvertimeMonthlyRow[], periodMonth: string) {
  const header = [
    'Emp code', 'Name', 'Outlet',
    'OT days', 'Worked hrs', 'OT hrs',
    'Hourly rate', 'OT amount',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([
      csv(r.employee_code),
      csv(r.employee_name),
      csv(r.outlet_name ?? ''),
      r.ot_days,
      r.worked_hours_total.toFixed(2),
      r.ot_hours_total.toFixed(2),
      r.hourly_rate.toFixed(2),
      r.ot_amount_total.toFixed(2),
    ].join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `overtime-${periodMonth.slice(0, 7)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function csv(s: string): string {
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
