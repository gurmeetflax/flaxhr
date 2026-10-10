import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { loadPeriod } from '@/lib/periodAttendance'
import { downloadMonthlySheet } from '@/lib/monthlySheet'

export default function MonthlySheetPanel({ outlets }: { outlets: { id: string; display_name: string | null }[] }) {
  const [month, setMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'))
  const [outletId, setOutletId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [busy, setBusy] = useState(false)

  const empQ = useQuery<{ id: string; employee_code: string; full_name: string; outlet_id: string | null }[]>({
    queryKey: ['report-employee-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, employee_code, full_name, outlet_id')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return data ?? []
    },
  })
  const options = (empQ.data ?? []).filter((e) => !outletId || e.outlet_id === outletId)

  const onDownload = async () => {
    const start = parseISO(`${month}-01`)
    const from = format(startOfMonth(start), 'yyyy-MM-dd')
    const to = format(endOfMonth(start), 'yyyy-MM-dd')
    setBusy(true)
    try {
      const rows = await loadPeriod({ from, to, employeeId: employeeId || null, outletId: outletId || null })
      if (!rows.length) {
        toast.error('No employees match these filters.')
        return
      }
      await downloadMonthlySheet(rows, from, to)
      toast.success(`Downloaded ${rows.length} employee sheet${rows.length === 1 ? '' : 's'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div>
          <CardTitle>Monthly attendance sheet (Excel)</CardTitle>
          <CardDescription className="mt-1">
            One sheet per employee with every date of the month — status, hours, late, early
            departure, overtime, notes, punch times, shift and punch outlets — plus a summary.
          </CardDescription>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Month
            <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Outlet
            <select
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              value={outletId}
              onChange={(e) => {
                setOutletId(e.target.value)
                setEmployeeId('')
              }}
            >
              <option value="">All outlets</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name ?? o.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Employee
            <select
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Everyone ({options.length})</option>
              {options.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} · {e.employee_code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <Button onClick={onDownload} loading={busy}>
            <FileSpreadsheet className="h-4 w-4" /> Download Excel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
