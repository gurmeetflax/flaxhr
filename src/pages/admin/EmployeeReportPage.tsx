import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parseISO, startOfMonth, subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { ArrowLeft, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { hm, loadPeriod, STATUS_TEXT, type PeriodDay, type PeriodRow } from '@/lib/periodAttendance'
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
// app shell so the printout is just the report.
export default function EmployeeReportPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const from = params.get('from') ?? format(startOfMonth(subDays(new Date(), 1)), 'yyyy-MM-dd')
  const to = params.get('to') ?? format(new Date(), 'yyyy-MM-dd')
  const [draft, setDraft] = useState({ from, to })

  const periodQ = useQuery<PeriodRow | null>({
    queryKey: ['employee-report', id, from, to],
    enabled: !!id,
    queryFn: async () => (await loadPeriod({ from, to, employeeId: id }))[0] ?? null,
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

  const row = periodQ.data
  const days = useMemo(() => (row?.days ?? []).filter((d) => d.status !== 'not_employed' && d.status !== 'future'), [row])
  const lates = days.filter((d) => d.status === 'late')
  const absentDays = days.filter((d) => d.status === 'absent')
  const problems = days.filter((d) => d.status === 'no_out' || d.status === 'short')
  const outlets = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of days) if (d.inOutlet) m.set(d.inOutlet, (m.get(d.inOutlet) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [days])
  const shifts = (shiftsQ.data ?? []).filter((s) => s.effective_from <= to && (!s.effective_to || s.effective_to >= from))

  useEffect(() => {
    if (row) document.title = `${row.employee.full_name} — attendance report ${from} to ${to}`
    return () => {
      document.title = 'Flax HR'
    }
  }, [row, from, to])

  const loading = periodQ.isLoading || regsQ.isLoading || cardsQ.isLoading
  const t = row?.totals

  return (
    <div className="min-h-screen bg-zinc-100 py-6 text-zinc-900 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 12mm }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-end justify-between gap-3 px-4 print:hidden">
        <Link to={`/admin/employees/${id}/snapshot`} className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> Back to snapshot
        </Link>
        <div className="flex flex-wrap items-end gap-2 text-xs text-zinc-600">
          <label className="flex flex-col gap-1">
            From
            <input type="date" className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900" value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            To
            <input type="date" className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </label>
          <button
            type="button"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-50"
            onClick={() => setParams({ from: draft.from, to: draft.to })}
          >
            Apply
          </button>
          <button
            type="button"
            disabled={loading || !row}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {loading ? (
          <p className="text-sm text-zinc-500">Building report…</p>
        ) : !row || !t ? (
          <p className="text-sm text-red-600">Couldn't load this employee.</p>
        ) : (
          <>
            <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Attendance &amp; discipline report</p>
                <h1 className="mt-1 text-2xl font-bold">{row.employee.full_name}</h1>
                <p className="mt-1 text-sm text-zinc-600">
                  {row.employee.employee_code}
                  {row.employee.designation_name ? ` · ${row.employee.designation_name}` : ''}
                  {row.employee.outlet_name ? ` · ${row.employee.outlet_name}` : ''}
                  {row.employee.hired_on ? ` · Joined ${format(parseISO(row.employee.hired_on), 'd MMM yyyy')}` : ''}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Period: <b>{format(parseISO(from), 'd MMM yyyy')} – {format(parseISO(to), 'd MMM yyyy')}</b>
                </p>
              </div>
              <img src="/flax-logo.png" alt="Flax" className="h-10 w-auto" />
            </header>

            <Section title="Summary">
              <div className="grid grid-cols-4 gap-2">
                <Kpi label="Attendance score" value={t.score == null ? '—' : `${t.score}%`} tone={tone(t.score)} hint={`${t.present + t.late + t.noOut} of ${t.workingDays} working days`} />
                <Kpi label="Punctuality" value={t.punctuality == null ? '—' : `${t.punctuality}%`} tone={tone(t.punctuality)} hint="punched-in days on time" />
                <Kpi label="Hours worked" value={hm(t.workedMin)} hint={`avg ${hm((t.present + t.late) ? t.workedMin / (t.present + t.late) : 0)} / day`} />
                <Kpi label="Overtime" value={hm(t.overtimeMin)} />
                <Kpi label="Late days" value={t.late} tone={t.late ? 'warn' : undefined} hint={t.late ? `${hm(t.lateMin)} in total` : undefined} />
                <Kpi label="Absent" value={t.absent} tone={t.absent ? 'bad' : undefined} />
                <Kpi label="No punch-out" value={t.noOut} tone={t.noOut ? 'warn' : undefined} />
                <Kpi label="Double taps" value={t.short} tone={t.short ? 'warn' : undefined} hint="in & out < 30 min" />
                <Kpi label="Week offs" value={t.weekOff} />
                <Kpi label="Leave" value={t.leave} />
                <Kpi label="Regularisations" value={regsQ.data?.length ?? 0} />
                <Kpi label="Cards" value={cardsQ.data?.length ?? 0} tone={cardsQ.data?.some((c) => c.colour === 'red') ? 'bad' : cardsQ.data?.length ? 'warn' : undefined} />
              </div>
            </Section>

            <Section title="Shift times">
              {shifts.length ? (
                <Table head={['Shift', 'Timing', 'Outlet', 'Effective']}>
                  {shifts.map((s) => (
                    <tr key={`${s.shift_id}-${s.effective_from}`}>
                      <Td>{s.shift_name}</Td>
                      <Td>{fmtClock(s.start_time)} – {fmtClock(s.end_time)}</Td>
                      <Td>{s.outlet_name ?? '—'}</Td>
                      <Td>
                        {format(parseISO(s.effective_from), 'd MMM yyyy')} – {s.effective_to ? format(parseISO(s.effective_to), 'd MMM yyyy') : 'now'}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No shift assigned — late arrival and early departure can't be measured. Assign one under Shifts.</Empty>
              )}
              {outlets.length ? (
                <p className="mt-2 text-xs text-zinc-600">
                  Punched in at: {outlets.map(([n, c]) => `${n} (${c} day${c === 1 ? '' : 's'})`).join(', ')}
                </p>
              ) : null}
            </Section>

            <Section title={`Late punches (${lates.length})`}>
              {lates.length ? (
                <Table head={['Date', 'Punch in', 'Scheduled', 'Late by', 'Outlet']}>
                  {lates.map((d) => (
                    <tr key={d.date}>
                      <Td>{fmtDate(d.date)}</Td>
                      <Td>{clock(d.firstIn)}</Td>
                      <Td>{clock(d.schedStart)}</Td>
                      <Td className="font-medium text-amber-700">{hm(d.lateMin)}</Td>
                      <Td>{d.inOutlet ?? '—'}</Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No late punches in this period.</Empty>
              )}
            </Section>

            <Section title={`Absences & missing punches (${absentDays.length + problems.length})`}>
              {absentDays.length ? (
                <p className="mb-2 text-[11px]">
                  <span className="font-medium text-red-700">Absent {absentDays.length} day{absentDays.length === 1 ? '' : 's'}:</span>{' '}
                  {dateRuns(absentDays.map((d) => d.date))}
                  <span className="text-zinc-500"> — no punch, leave or week off.</span>
                </p>
              ) : null}
              {problems.length ? (
                <Table head={['Date', 'Issue', 'Details']}>
                  {problems.map((d) => (
                    <tr key={d.date}>
                      <Td>{fmtDate(d.date)}</Td>
                      <Td className="text-amber-700">{STATUS_TEXT[d.status]}</Td>
                      <Td>
                        {d.status === 'no_out'
                          ? `In ${clock(d.firstIn)} at ${d.inOutlet ?? '—'}, never punched out`
                          : `In and out at ${clock(d.firstIn)} — likely a double tap`}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : null}
              {!absentDays.length && !problems.length ? <Empty>None.</Empty> : null}
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
                        {r.decision_note ? <span className="block text-[10px] text-zinc-500">{r.decision_note}</span> : null}
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
                        <span className={`inline-block h-2.5 w-2.5 rounded-full align-middle ${c.colour === 'red' ? 'bg-red-500' : c.colour === 'green' ? 'bg-green-500' : 'bg-amber-400'}`} />{' '}
                        <span className="capitalize">{c.colour}</span>
                        {c.source === 'auto' ? <span className="text-zinc-500"> (auto)</span> : null}
                      </Td>
                      <Td>
                        {c.reason_title ?? '—'}
                        {c.reason_category ? <span className="block text-[10px] text-zinc-500">{c.reason_category}</span> : null}
                      </Td>
                      <Td className="max-w-[60mm]">{c.notes ?? '—'}</Td>
                      <Td className="capitalize">{c.status}</Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No cards or complaints in this period.</Empty>
              )}
            </Section>

            <Section title="Day by day" breakBefore>
              <Table head={['Date', 'Status', 'In', 'Out', 'Hours', 'Outlet', 'Notes']}>
                {days.map((d) => (
                  <tr key={d.date}>
                    <Td className="whitespace-nowrap">{fmtDate(d.date)}</Td>
                    <Td className={statusColor(d)}>{d.status === 'leave' && d.leaveName ? `Leave (${d.leaveName})` : STATUS_TEXT[d.status]}</Td>
                    <Td className="whitespace-nowrap">{clock(d.firstIn)}</Td>
                    <Td className="whitespace-nowrap">{clock(d.lastOut)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{d.workedMin ? hm(d.workedMin) : '—'}</Td>
                    <Td>{[d.inOutlet, d.outOutlet].filter((x, i, a) => x && a.indexOf(x) === i).join(' → ') || '—'}</Td>
                    <Td className="text-[10px] text-zinc-600">{d.notes.join(' · ')}</Td>
                  </tr>
                ))}
              </Table>
            </Section>

            <footer className="mt-6 border-t border-zinc-200 pt-2 text-[10px] text-zinc-500">
              Generated {format(new Date(), 'd MMM yyyy, h:mm a')} from Flax HR. Attendance score = days punched in ÷
              working days (week offs and approved leave excluded). Double taps (in and out under 30 min) count as
              working days not attended.
            </footer>
          </>
        )}
      </article>
    </div>
  )
}

function Section({ title, children, breakBefore }: { title: string; children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section className={`mt-5 ${breakBefore ? 'print:break-before-page' : 'break-inside-avoid'}`}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-700">{title}</h2>
      {children}
    </section>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'warn' | 'bad' | 'good' }) {
  const color = tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-green-700' : 'text-zinc-900'
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

function tone(pct: number | null): 'good' | 'warn' | 'bad' | undefined {
  if (pct == null) return undefined
  return pct >= 90 ? 'good' : pct >= 75 ? 'warn' : 'bad'
}

function statusColor(d: PeriodDay): string {
  if (d.status === 'absent') return 'text-red-700'
  if (d.status === 'late' || d.status === 'no_out' || d.status === 'short') return 'text-amber-700'
  if (d.status === 'leave' || d.status === 'week_off') return 'text-blue-700'
  return ''
}

// ['2026-09-02','2026-09-03','2026-09-04','2026-09-08'] → "2–4, 8 Sep"
function dateRuns(dates: string[]): string {
  const out: string[] = []
  let i = 0
  while (i < dates.length) {
    let j = i
    while (j + 1 < dates.length && differenceInCalendarDays(parseISO(dates[j + 1]), parseISO(dates[j])) === 1) j++
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
