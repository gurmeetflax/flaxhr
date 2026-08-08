import { useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useMyOvertimeDaily, useMyOvertimeMonthly } from '@/lib/overtime'

const IST = 'Asia/Kolkata'

export default function MyOvertimePage() {
  const [periodMonth, setPeriodMonth] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )

  const monthly = useMyOvertimeMonthly()
  const daily = useMyOvertimeDaily(periodMonth)

  const current = monthly.data?.find((m) => m.period_month.slice(0, 7) === periodMonth.slice(0, 7))
  const otDays = (daily.data ?? []).filter((d) => d.ot_minutes > 0)

  return (
    <>
      <PageHeader title="My overtime" description="Regular shift 9 hrs · 1 hr grace · anything more counts as OT." />

      <div className="mb-4 max-w-xs">
        <Input
          type="month"
          value={periodMonth.slice(0, 7)}
          onChange={(e) => setPeriodMonth(`${e.target.value}-01`)}
        />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Total worked (hrs)" value={current ? current.worked_hours_total.toFixed(2) : '—'} />
        <Stat label="OT days" value={current ? String(current.ot_days) : '—'} />
        <Stat label="OT hours" value={current ? current.ot_hours_total.toFixed(2) : '—'} tone={current && current.ot_hours_total > 0 ? 'good' : undefined} />
        <Stat label="OT payable" value={current ? `₹${current.ot_amount_total.toFixed(2)}` : '—'} tone={current && current.ot_amount_total > 0 ? 'good' : undefined} />
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle>Days with overtime</CardTitle>
          {otDays.length === 0 ? (
            <CardDescription>No overtime days in this period.</CardDescription>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {otDays.map((d) => (
                <li key={d.work_date} className="flex items-center justify-between py-2">
                  <span>
                    {formatInTimeZone(new Date(d.work_date + 'T00:00:00'), IST, 'EEE, dd MMM')}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {d.outlet_name ?? ''}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {d.worked_hours.toFixed(2)} hrs
                    <span className="ml-3 font-medium text-primary">
                      +{d.ot_hours.toFixed(2)} OT
                    </span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      ₹{d.ot_amount.toFixed(2)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle>Last 24 months</CardTitle>
          {monthly.data && monthly.data.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {monthly.data.map((m) => (
                <li key={m.period_month} className="flex items-center justify-between py-2">
                  <span>{formatInTimeZone(new Date(m.period_month + 'T00:00:00'), IST, 'MMM yyyy')}</span>
                  <span className="tabular-nums">
                    {m.ot_days}d · {m.ot_hours_total.toFixed(2)} hrs
                    <span className="ml-3 font-medium">₹{m.ot_amount_total.toFixed(2)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <CardDescription>No overtime history yet.</CardDescription>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <Card>
      <CardContent className="flex flex-col p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${tone === 'good' ? 'text-primary' : ''}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}
