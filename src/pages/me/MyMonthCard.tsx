import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, getDay, parseISO } from 'date-fns'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  calculationLines,
  clock,
  downloadPdf,
  FLAGS,
  hm,
  hmTotal,
  loadMonthReport,
  STATUS_FILL,
  STATUS_LABEL,
  type ReportDay,
} from '@/lib/attendanceReport'

// The employee's own month, worked out exactly as the monthly attendance
// report and the payroll run do (core.attendance_days).
export default function MyMonthCard({ month }: { month: string }) {
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const q = useQuery({
    queryKey: ['my-attendance-month', month],
    queryFn: () => loadMonthReport(month, null, { mine: true }),
  })
  const report = q.data
  const me = report?.employees[0]

  if (q.isLoading) {
    return (
      <Card className="mb-4">
        <CardContent className="p-6">
          <CardDescription>Loading…</CardDescription>
        </CardContent>
      </Card>
    )
  }
  if (q.error || !report || !me) {
    return (
      <Card className="mb-4">
        <CardContent className="p-6">
          <CardDescription>
            {q.error instanceof Error ? q.error.message : 'No attendance for this month.'}
          </CardDescription>
        </CardContent>
      </Card>
    )
  }

  const s = me.summary
  const day = me.days.find((d) => d.date === picked) ?? null
  const lead = getDay(parseISO(me.days[0].date)) // 0 = Sunday
  const tiles: [string, string][] = [
    ['Payable days', String(s.payable)],
    ['Present', String(s.present)],
    ['Half days', String(s.halfDays)],
    ['Week offs', String(s.weekOff)],
    ['Absent', String(s.absent)],
    ['Lates', s.lateCut ? `${s.lates} (−${s.lateCut} day)` : String(s.lates)],
    ['Short hours', hmTotal(s.shortMin)],
    ['Overtime', hmTotal(s.otMin)],
  ]

  const onPdf = async () => {
    setBusy(true)
    try {
      await downloadPdf(report, me.name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>My month</CardTitle>
            <CardDescription className="mt-1">
              Worked out the same way as your salary. Tap a day for details.{' '}
              <Link to="/me/policies" className="underline">
                See the rules
              </Link>
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onPdf} loading={busy}>
            <FileText className="h-4 w-4" /> Download PDF
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="mt-0.5 text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {me.days.map((d) => (
              <DayCell key={d.date} d={d} active={d.date === picked} onClick={() => setPicked(d.date)} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {FLAGS.map((f) => (
              <span key={f.flag} className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: `#${f.color}` }}
                />
                {f.label.split(':')[0].split(' (')[0]}
              </span>
            ))}
          </div>
        </div>

        {day ? <DayDetail d={day} /> : null}

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <div className="mb-1 font-medium">How this month was calculated</div>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {calculationLines(me, me.days.length).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function DayCell({ d, active, onClick }: { d: ReportDay; active: boolean; onClick: () => void }) {
  const fill = STATUS_FILL[d.status]
  const code = d.status === 'NE' || d.status === 'FUT' ? '' : d.status
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-14 flex-col items-center justify-center rounded-md border text-xs ${
        active ? 'border-primary ring-1 ring-primary' : 'border-border'
      }`}
      style={fill ? { backgroundColor: `#${fill}` } : undefined}
    >
      <span className="text-[11px] text-muted-foreground">{format(parseISO(d.date), 'd')}</span>
      <span className="font-semibold text-foreground">{code}</span>
      {d.flags.length ? (
        <span className="absolute right-1 top-1 flex gap-0.5">
          {d.flags.map((f) => (
            <span
              key={f}
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: `#${FLAGS.find((x) => x.flag === f)?.color ?? '000000'}` }}
            />
          ))}
        </span>
      ) : null}
    </button>
  )
}

function DayDetail({ d }: { d: ReportDay }) {
  const rows: [string, string][] = [
    ['Status', STATUS_LABEL[d.status]],
    ...d.pairs.map((p, i): [string, string] => [
      d.pairs.length > 1 ? `In / out ${i + 1}` : 'In / out',
      `${clock(p[0])} – ${clock(p[1])}`,
    ]),
    ['Hours worked', hm(d.workedMin)],
  ]
  if (d.lateMin) rows.push(['Late', hm(d.lateMin)])
  if (d.shortMin) rows.push(['Short hours (cut)', hm(d.shortMin)])
  if (d.otMin) rows.push(['Overtime', hm(d.otMin)])
  if (d.reason) rows.push(['Why', d.reason])
  if (d.longShift) rows.push(['Note', 'Shift over 14 hours, checked before overtime is paid'])
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="mb-2 font-medium">{format(parseISO(d.date), 'EEEE, d MMMM')}</div>
      <dl className="grid grid-cols-2 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {d.status === 'HD' || d.status === 'A' ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Missed a punch?{' '}
          <Link to="/me/regularise" className="underline">
            Regularise it
          </Link>{' '}
          so the day is counted in full.
        </p>
      ) : null}
    </div>
  )
}
