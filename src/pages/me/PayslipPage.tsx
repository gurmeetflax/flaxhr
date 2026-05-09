import { useState } from 'react'
import { Printer } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useMyPayslips, type MyPayslip } from '@/lib/payroll'

export default function PayslipPage() {
  const { data = [], isLoading } = useMyPayslips()
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = data.find((p) => p.id === activeId) ?? data[0] ?? null

  return (
    <>
      <PageHeader
        title="My payslips"
        description="Available after each monthly payroll is finalised."
      />
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border text-sm">
              {isLoading ? (
                <li className="px-4 py-3 text-muted-foreground">Loading…</li>
              ) : data.length === 0 ? (
                <li className="px-4 py-3 text-muted-foreground">No payslips yet.</li>
              ) : (
                data.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(p.id)}
                      className={
                        'flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 ' +
                        ((active?.id ?? null) === p.id ? 'bg-primary/5' : '')
                      }
                    >
                      <span className="font-mono">{p.period_month?.slice(0, 7)}</span>
                      <span className="text-xs font-mono text-muted-foreground">
                        ₹{Number(p.net_pay).toFixed(0)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        {active ? <Payslip slip={active} /> : null}
      </div>
    </>
  )
}

function Payslip({ slip }: { slip: MyPayslip }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start justify-between gap-3 print:hidden">
          <div>
            <h2 className="text-lg font-semibold">Payslip</h2>
            <p className="text-sm text-muted-foreground">
              {slip.period_month?.slice(0, 7)} · {slip.outlet_name ?? slip.outlet_id}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>

        <div className="rounded-lg border border-border p-6 print:border-0 print:p-0">
          <div className="mb-4 flex items-baseline justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-xl font-bold">Flax HR — Payslip</h3>
              <p className="text-sm text-muted-foreground">
                {slip.period_month?.slice(0, 7)} · {slip.outlet_name ?? ''}
              </p>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {slip.employee_code}
            </p>
          </div>

          <dl className="mb-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Employee</dt>
            <dd className="text-right font-medium">{slip.full_name}</dd>
            <dt className="text-muted-foreground">Gross (CTC)</dt>
            <dd className="text-right font-mono">₹{Number(slip.gross).toFixed(2)}</dd>
            <dt className="text-muted-foreground">Days in month</dt>
            <dd className="text-right font-mono">{slip.days_in_month}</dd>
            <dt className="text-muted-foreground">Days present</dt>
            <dd className="text-right font-mono">{Number(slip.days_present).toFixed(1)}</dd>
            <dt className="text-muted-foreground">Paid leave</dt>
            <dd className="text-right font-mono">{Number(slip.days_paid_leave).toFixed(1)}</dd>
            <dt className="text-muted-foreground">Days payable</dt>
            <dd className="text-right font-mono">{Number(slip.days_payable).toFixed(1)}</dd>
            <dt className="text-muted-foreground">Prorated gross</dt>
            <dd className="text-right font-mono">₹{Number(slip.prorated_gross).toFixed(2)}</dd>
          </dl>

          {slip.deductions_breakdown.length > 0 ? (
            <div className="mb-4 rounded border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Deductions
              </div>
              <ul className="text-sm">
                {slip.deductions_breakdown.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-1">
                    <span className="capitalize">
                      {d.kind} {d.notes ? `· ${d.notes}` : ''}
                    </span>
                    <span className="font-mono">₹{Number(d.amount).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
                <span>Total deductions</span>
                <span className="font-mono">₹{Number(slip.deductions_total).toFixed(2)}</span>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded bg-primary/10 px-4 py-3 text-base font-bold">
            <span>Net pay</span>
            <span className="font-mono">₹{Number(slip.net_pay).toFixed(2)}</span>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Finalised {new Date(slip.finalised_at).toLocaleDateString()}.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
