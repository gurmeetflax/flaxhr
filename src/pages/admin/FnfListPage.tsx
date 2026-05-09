import { Link } from 'react-router-dom'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useFnfRecords, type FnfStatus } from '@/lib/fnf'

const STATUS_LABEL: Record<FnfStatus, string> = {
  open: 'Open',
  clearance_done: 'Clearance done',
  settled: 'Settled',
  closed: 'Closed',
}

export default function FnfListPage() {
  const { data = [], isLoading } = useFnfRecords()
  const [filter, setFilter] = useState<'all' | FnfStatus>('all')
  const filtered = filter === 'all' ? data : data.filter((r) => r.status === filter)

  return (
    <>
      <PageHeader
        title="FnF & clearance"
        description="Separation workflow. Triggered automatically when an exit_date is set on an employee."
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', 'open', 'clearance_done', 'settled', 'closed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
              (filter === s
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface text-muted-foreground hover:border-primary/50')
            }
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]} ·{' '}
            {s === 'all' ? data.length : data.filter((r) => r.status === s).length}
          </button>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Outlet</th>
                  <th className="px-4 py-2.5">Exit</th>
                  <th className="px-4 py-2.5">Target</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5">Final</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No FnF records.</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.full_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{r.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.outlet_name ?? '—'}</td>
                      <td className="px-4 py-3 font-mono">{r.exit_date}</td>
                      <td className="px-4 py-3 font-mono">{r.fnf_target_date}</td>
                      <td className="px-4 py-3">
                        <span className={
                          'rounded-md px-2 py-0.5 text-xs font-medium ' +
                          (r.status === 'settled' ? 'bg-primary/10 text-primary' :
                           r.status === 'clearance_done' ? 'bg-warning/10 text-warning' :
                           r.status === 'closed' ? 'bg-muted text-muted-foreground' :
                           'bg-destructive/10 text-destructive')
                        }>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.items_done}/{r.items_total}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {r.final_amount != null ? `₹${Number(r.final_amount).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/admin/fnf/${r.id}`}>
                          <Button size="sm" variant="ghost"><LogOut className="h-4 w-4" /> Open</Button>
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
    </>
  )
}
