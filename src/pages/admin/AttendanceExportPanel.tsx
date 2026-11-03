import { useState } from 'react'
import { format, subMonths } from 'date-fns'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { downloadExcel, downloadPdf, loadMonthReport, RULES } from '@/lib/attendanceReport'

export default function AttendanceExportPanel({
  outlets,
}: {
  outlets: { id: string; display_name: string | null }[]
}) {
  const [month, setMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'))
  const [outletId, setOutletId] = useState('')
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)

  const run = async (kind: 'xlsx' | 'pdf') => {
    setBusy(kind)
    try {
      const report = await loadMonthReport(month, outletId || null)
      if (!report.employees.length) {
        toast.error('No employees for this month and outlet.')
        return
      }
      const scope = outletId
        ? (outlets.find((o) => o.id === outletId)?.display_name ?? outletId)
        : 'All_outlets'
      if (kind === 'xlsx') await downloadExcel(report, scope)
      else await downloadPdf(report, scope)
      toast.success(
        `Downloaded ${report.employees.length} employee${report.employees.length === 1 ? '' : 's'}`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div>
            <CardTitle>Monthly attendance report</CardTitle>
            <CardDescription className="mt-1">
              One page per employee in the SalaryBox layout: every day of the month with status, punch times,
              hours, late, early and overtime. Days where a rule was broken are marked, with the reason. Uses
              the same calculation as payroll.
            </CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Month
              <Input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Outlet
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
              >
                <option value="">All outlets</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.display_name ?? o.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run('xlsx')} loading={busy === 'xlsx'} disabled={busy !== null}>
              <FileSpreadsheet className="h-4 w-4" /> Download Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => run('pdf')}
              loading={busy === 'pdf'}
              disabled={busy !== null}
            >
              <FileText className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <CardTitle>Rules used</CardTitle>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
