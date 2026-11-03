import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parseISO, subMonths } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { ArrowLeft, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  calculationLines,
  COMPANY,
  downloadPdf,
  hm,
  hmTotal,
  loadMonthReport,
  monthRange,
  RULES,
  STATUS_LABEL,
  type MonthReport,
  type ReportDay,
} from '@/lib/attendanceReport'
import { useEmployeeShifts } from '@/lib/shifts'

const IST = 'Asia/Kolkata'

interface Reg {
  id: string
  requested_for: string
  type: string
  reason: string | null
  status: string
  decision_note: string | null
}

interface EmpRow {
  id: string
  employee_code: string
  full_name: string
  designation_name: string | null
  outlet_id: string | null
  outlet_name: string | null
  hired_on: string | null
}

interface CardRow {
  id: string
  colour: string
  reason_title: string | null
  reason_category: string | null
  incident_date: string
  status: string
  source: string
  notes: string | null
}

// Printable employee report (browser "Save as PDF"). Lives outside the
// app shell so the printout is just the report. Attendance comes from the
// monthly attendance report (core.attendance_days), the same calculation
// payroll uses.
export default function EmployeeReportPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const month = (
    params.get('month') ??
    params.get('from') ??
    format(subMonths(new Date(), 1), 'yyyy-MM')
  ).slice(0, 7)
  const { from, to } = monthRange(month)
  const [busy, setBusy] = useState(false)

  const empQ = useQuery<EmpRow | null>({
    queryKey: ['employee-report-emp', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, employee_code, full_name, designation_name, outlet_id, outlet_name, hired_on')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as EmpRow | null) ?? null
    },
  })
  const reportQ = useQuery<MonthReport>({
    queryKey: ['employee-report', id, month, empQ.data?.outlet_id],
    enabled: !!id && !!empQ.data,
    queryFn: () => loadMonthReport(month, empQ.data?.outlet_id ?? null, { employeeId: id }),
  })
  const regsQ = useQuery<Reg[]>({
    queryKey: ['employee-report-regs', id, from, to],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_regularisations')
        .select('id, requested_for, type, reason, status, decision_note')
        .eq('employee_id', id)
        .gte('requested_for', `${from}T00:00:00+05:30`)
        .lte('requested_for', `${to}T23:59:59+05:30`)
        .order('requested_for')
      if (error) throw error
      return (data ?? []) as Reg[]
    },
  })
  const cardsQ = useQuery<CardRow[]>({
    queryKey: ['employee-report-cards', id, from, to],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_cards')
        .select('id, colour, reason_title, reason_category, incident_date, status, source, notes')
        .eq('employee_id', id)
        .gte('incident_date', from)
        .lte('incident_date', to)
        .order('incident_date')
      if (error) throw error
      return (data ?? []) as CardRow[]
    },
  })
  const shiftsQ = useEmployeeShifts(id)

  const emp = empQ.data
  const me = reportQ.data?.employees[0] ?? null
  const days = useMemo(() => (me?.days ?? []).filter((d) => d.status !== 'NE' && d.status !== 'FUT'), [me])
  const lates = days.filter((d) => d.isLate)
  const absentDays = days.filter((d) => d.status === 'A')
  const halfDays = days.filter((d) => d.status === 'HD')
  const shifts = (shiftsQ.data ?? []).filter(
    (s) => s.effective_from <= to && (!s.effective_to || s.effective_to >= from),
  )

  useEffect(() => {
    if (emp) document.title = `${emp.full_name} — attendance report ${format(parseISO(from), 'MMMM yyyy')}`
    return () => {
      document.title = 'Flax HR'
    }
  }, [emp, from])

  const loading = empQ.isLoading || reportQ.isLoading || regsQ.isLoading || cardsQ.isLoading
  const s = me?.summary

  const onPdf = async () => {
    if (!reportQ.data || !emp) return
    setBusy(true)
    try {
      await downloadPdf(reportQ.data, emp.full_name)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 py-6 text-zinc-900 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 12mm }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-end justify-between gap-3 px-4 print:hidden">
        <Link
          to={`/admin/employees/${id}/snapshot`}
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to snapshot
        </Link>
        <div className="flex flex-wrap items-end gap-2 text-xs text-zinc-600">
          <label className="flex flex-col gap-1">
            Month
            <input
              type="month"
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
              value={month}
              onChange={(e) => e.target.value && setParams({ month: e.target.value })}
            />
          </label>
          <button
            type="button"
            disabled={loading || !me}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            onClick={() => window.print()}
          >
            Print
          </button>
          <button
            type="button"
            disabled={loading || !me || busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            onClick={onPdf}
          >
            <Download className="h-4 w-4" /> Attendance PDF
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {loading ? (
          <p className="text-sm text-zinc-500">Building report…</p>
        ) : !emp || !me || !s ? (
          <p className="text-sm text-red-600">
            Couldn't load this employee for {format(parseISO(from), 'MMMM yyyy')}.
          </p>
        ) : (
          <>
            <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Attendance &amp; discipline report
                </p>
                <h1 className="mt-1 text-2xl font-bold">{emp.full_name}</h1>
                <p className="mt-1 text-sm text-zinc-600">
                  {emp.employee_code}
                  {emp.designation_name ? ` · ${emp.designation_name}` : ''}
                  {emp.outlet_name ? ` · ${emp.outlet_name}` : ''}
                  {emp.hired_on ? ` · Joined ${format(parseISO(emp.hired_on), 'd MMM yyyy')}` : ''}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Month: <b>{format(parseISO(from), 'MMMM yyyy')}</b>
                </p>
              </div>
              <img src={COMPANY.logo} alt="H&B" className="h-14 w-auto" />
            </header>

            <Section title="Summary">
              <div className="grid grid-cols-4 gap-2">
                <Kpi label="Payable days" value={s.payable} hint={`of ${me.days.length}`} />
                <Kpi label="Present" value={s.present} />
                <Kpi label="Half days" value={s.halfDays} tone={s.halfDays ? 'warn' : undefined} />
                <Kpi label="Week offs" value={s.weekOff} />
                <Kpi label="Absent" value={s.absent} tone={s.absent ? 'bad' : undefined} />
                <Kpi label="Paid leave" value={s.paidLeave} />
                <Kpi
                  label="Lates"
                  value={s.lates}
                  tone={s.lates ? 'warn' : undefined}
                  hint={s.lateCut ? `${s.lateCut} day cut` : undefined}
                />
                <Kpi label="Hours worked" value={hmTotal(s.workedMin)} />
                <Kpi
                  label="Short hours"
                  value={hmTotal(s.shortMin)}
                  tone={s.shortMin ? 'warn' : undefined}
                  hint="cut by the minute"
                />
                <Kpi
                  label="Overtime"
                  value={hmTotal(s.otMin)}
                  hint={s.longShifts ? `${s.longShifts} shift(s) over 14h` : undefined}
                />
                <Kpi label="Regularisations" value={regsQ.data?.length ?? 0} />
                <Kpi
                  label="Cards"
                  value={cardsQ.data?.length ?? 0}
                  tone={
                    cardsQ.data?.some((c) => c.colour === 'red')
                      ? 'bad'
                      : cardsQ.data?.length
                        ? 'warn'
                        : undefined
                  }
                />
              </div>
              <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[11px] text-zinc-600">
                {calculationLines(me, me.days.length).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Section>

            <Section title="Shift times">
              {shifts.length ? (
                <Table head={['Shift', 'Timing', 'Outlet', 'Effective']}>
                  {shifts.map((sh) => (
                    <tr key={`${sh.shift_id}-${sh.effective_from}`}>
                      <Td>{sh.shift_name}</Td>
                      <Td>
                        {fmtClock(sh.start_time)} – {fmtClock(sh.end_time)}
                      </Td>
                      <Td>{sh.outlet_name ?? '—'}</Td>
                      <Td>
                        {format(parseISO(sh.effective_from), 'd MMM yyyy')} –{' '}
                        {sh.effective_to ? format(parseISO(sh.effective_to), 'd MMM yyyy') : 'now'}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No fixed shift assigned. Late arrival is measured against the roster only.</Empty>
              )}
            </Section>

            <Section title={`Late arrivals (${lates.length})`}>
              {lates.length ? (
                <Table head={['Date', 'Punch in', 'Shift start', 'Late by']}>
                  {lates.map((d) => (
                    <tr key={d.date}>
                      <Td>{fmtDate(d.date)}</Td>
                      <Td>{clock(d.pairs[0]?.[0] ?? null)}</Td>
                      <Td>{clock(d.schedStart)}</Td>
                      <Td className="font-medium text-amber-700">
                        {hm(d.lateMin)}
                        {d.flags.includes('late_cut') ? (
                          <span className="block text-[10px]">3rd late: ½ day cut</span>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No late arrivals this month.</Empty>
              )}
            </Section>

            <Section title={`Absences & half days (${absentDays.length + halfDays.length})`}>
              {absentDays.length ? (
                <p className="mb-2 text-[11px]">
                  <span className="font-medium text-red-700">
                    Absent {absentDays.length} day{absentDays.length === 1 ? '' : 's'}:
                  </span>{' '}
                  {dateRuns(absentDays.map((d) => d.date))}
                  <span className="text-zinc-500">
                    {' '}
                    — no punch, no approved leave, beyond the paid week offs.
                  </span>
                </p>
              ) : null}
              {halfDays.length ? (
                <Table head={['Date', 'Why', 'Punches']}>
                  {halfDays.map((d) => (
                    <tr key={d.date}>
                      <Td>{fmtDate(d.date)}</Td>
                      <Td className="text-amber-700">{d.reason ?? 'Half day'}</Td>
                      <Td>{pairsText(d)}</Td>
                    </tr>
                  ))}
                </Table>
              ) : null}
              {!absentDays.length && !halfDays.length ? <Empty>None.</Empty> : null}
            </Section>

            <Section title={`Regularisations (${regsQ.data?.length ?? 0})`}>
              {regsQ.data?.length ? (
                <Table head={['For', 'Type', 'Reason', 'Status']}>
                  {regsQ.data.map((r) => (
                    <tr key={r.id}>
                      <Td>{formatInTimeZone(r.requested_for, IST, 'd MMM, h:mm a')}</Td>
                      <Td className="capitalize">{r.type}</Td>
                      <Td>{r.reason ?? '—'}</Td>
                      <Td className="capitalize">
                        {r.status}
                        {r.decision_note ? (
                          <span className="block text-[10px] text-zinc-500">{r.decision_note}</span>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No regularisation requests.</Empty>
              )}
            </Section>

            <Section title={`Cards & complaints (${cardsQ.data?.length ?? 0})`}>
              {cardsQ.data?.length ? (
                <Table head={['Date', 'Card', 'Reason', 'Notes', 'Status']}>
                  {cardsQ.data.map((c) => (
                    <tr key={c.id}>
                      <Td>{fmtDate(c.incident_date)}</Td>
                      <Td>
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full align-middle ${c.colour === 'red' ? 'bg-red-500' : c.colour === 'green' ? 'bg-green-500' : 'bg-amber-400'}`}
                        />{' '}
                        <span className="capitalize">{c.colour}</span>
                        {c.source === 'auto' ? <span className="text-zinc-500"> (auto)</span> : null}
                      </Td>
                      <Td>
                        {c.reason_title ?? '—'}
                        {c.reason_category ? (
                          <span className="block text-[10px] text-zinc-500">{c.reason_category}</span>
                        ) : null}
                      </Td>
                      <Td className="max-w-[60mm]">{c.notes ?? '—'}</Td>
                      <Td className="capitalize">{c.status}</Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No cards or complaints this month.</Empty>
              )}
            </Section>

            <Section title="Day by day" breakBefore>
              <Table head={['Date', 'Status', 'In / out', 'Hours', 'Late', 'Short', 'OT', 'Notes']}>
                {days.map((d) => (
                  <tr key={d.date}>
                    <Td className="whitespace-nowrap">{fmtDate(d.date)}</Td>
                    <Td className={statusColor(d)}>{STATUS_LABEL[d.status]}</Td>
                    <Td className="whitespace-nowrap">{pairsText(d)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{hm(d.workedMin)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{hm(d.lateMin)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{hm(d.shortMin)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{hm(d.otMin)}</Td>
                    <Td className="text-[10px] text-zinc-600">
                      {[
                        d.reason,
                        d.flags.includes('late_cut') ? '3rd late: ½ day cut' : null,
                        d.longShift ? 'shift over 14h' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Td>
                  </tr>
                ))}
              </Table>
            </Section>

            <footer className="mt-6 border-t border-zinc-200 pt-2 text-[10px] text-zinc-500">
              Generated {format(new Date(), 'd MMM yyyy, h:mm a')} from Flax HR, with the same calculation as
              payroll. Rules: {RULES.slice(1, 8).join(' ')}
            </footer>
          </>
        )}
      </article>
    </div>
  )
}

function Section({
  title,
  children,
  breakBefore,
}: {
  title: string
  children: React.ReactNode
  breakBefore?: boolean
}) {
  return (
    <section className={`mt-5 ${breakBefore ? 'print:break-before-page' : 'break-inside-avoid'}`}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-700">{title}</h2>
      {children}
    </section>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'warn' | 'bad' | 'good'
}) {
  const color =
    tone === 'bad'
      ? 'text-red-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'good'
          ? 'text-green-700'
          : 'text-zinc-900'
  return (
    <div className="rounded-md border border-zinc-200 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {hint ? <div className="text-[10px] text-zinc-500">{hint}</div> : null}
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="border-b border-zinc-300 text-left text-zinc-500">
          {head.map((h) => (
            <th key={h} className="py-1 pr-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&>tr]:border-b [&>tr]:border-zinc-100">{children}</tbody>
    </table>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-1 pr-2 align-top ${className}`}>{children}</td>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-zinc-500">{children}</p>
}

function statusColor(d: ReportDay): string {
  if (d.status === 'A') return 'text-red-700'
  if (d.status === 'HD') return 'text-amber-700'
  if (d.status === 'PL' || d.status === 'WO') return 'text-blue-700'
  return ''
}

function pairsText(d: ReportDay): string {
  return d.pairs.length ? d.pairs.map((p) => `${clock(p[0])} – ${clock(p[1])}`).join(', ') : '—'
}

// ['2026-09-02','2026-09-03','2026-09-04','2026-09-08'] → "2–4, 8 Sep"
function dateRuns(dates: string[]): string {
  const out: string[] = []
  let i = 0
  while (i < dates.length) {
    let j = i
    while (j + 1 < dates.length && differenceInCalendarDays(parseISO(dates[j + 1]), parseISO(dates[j])) === 1)
      j++
    const a = parseISO(dates[i])
    const b = parseISO(dates[j])
    const sameMonth = j + 1 >= dates.length || format(parseISO(dates[j + 1]), 'MMM') !== format(b, 'MMM')
    const end = sameMonth ? format(b, 'd MMM') : format(b, 'd')
    out.push(i === j ? end : `${format(a, 'd')}–${end}`)
    i = j + 1
  }
  return out.join(', ')
}

function fmtDate(d: string): string {
  return format(parseISO(d), 'EEE d MMM')
}

function clock(ts: string | null): string {
  return ts ? formatInTimeZone(ts, IST, 'h:mm a') : '—'
}

// "09:30:00" → "9:30 AM"
function fmtClock(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return format(new Date(2000, 0, 1, h, m), 'h:mm a')
}
