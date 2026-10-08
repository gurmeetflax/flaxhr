import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, MessageCircle, Phone } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface UsageRow {
  employee_id: string
  employee_code: string
  full_name: string
  phone: string | null
  outlet_id: string | null
  outlet_name: string | null
  city: string | null
  has_login: boolean
  last_punch_at: string | null
  punches_since: number
  days_since: number
  on_leave_today: boolean
}

type Show = 'not' | 'yes' | 'all'

const PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Last 3 days', days: 2 },
  { label: 'Last 7 days', days: 6 },
  { label: 'Last 30 days', days: 29 },
]

export default function AppUsagePanel({
  outlets,
}: {
  outlets: { id: string; display_name: string | null }[]
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [since, setSince] = useState(today)
  const [show, setShow] = useState<Show>('not')
  const [outletId, setOutletId] = useState('')
  const [search, setSearch] = useState('')
  const [hideLeave, setHideLeave] = useState(true)

  const q = useQuery<UsageRow[]>({
    queryKey: ['attendance-app-usage', since],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('attendance_app_usage', {
        p_since: since,
      })
      if (error) throw error
      return (data ?? []) as UsageRow[]
    },
  })

  const rows = useMemo(() => q.data ?? [], [q.data])
  const scoped = rows.filter((r) => !outletId || r.outlet_id === outletId)
  const punched = scoped.filter((r) => r.punches_since > 0).length
  const never = scoped.filter((r) => !r.last_punch_at).length

  const needle = search.trim().toLowerCase()
  const filtered = scoped.filter((r) => {
    if (show === 'not' && r.punches_since > 0) return false
    if (show === 'yes' && r.punches_since === 0) return false
    if (hideLeave && show !== 'yes' && r.on_leave_today && r.punches_since === 0) return false
    if (
      needle &&
      !r.full_name.toLowerCase().includes(needle) &&
      !r.employee_code.toLowerCase().includes(needle)
    )
      return false
    return true
  })

  const sinceLabel = since === today ? 'today' : `since ${format(parseISO(since), 'd MMM')}`

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const v = format(subDays(new Date(), p.days), 'yyyy-MM-dd')
          return (
            <Button
              key={p.label}
              size="sm"
              variant={since === v ? 'primary' : 'outline'}
              onClick={() => setSince(v)}
            >
              {p.label}
            </Button>
          )
        })}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Since</span>
          <Input
            type="date"
            className="w-auto"
            value={since}
            max={today}
            onChange={(e) => e.target.value && setSince(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
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
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={show}
          onChange={(e) => setShow(e.target.value as Show)}
        >
          <option value="not">Not punched {sinceLabel}</option>
          <option value="yes">Punched {sinceLabel}</option>
          <option value="all">Everyone</option>
        </select>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={hideLeave} onChange={(e) => setHideLeave(e.target.checked)} />
          Hide people on leave today
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`Punched ${sinceLabel}`} value={`${punched} / ${scoped.length}`} />
        <Stat label={`Not punched ${sinceLabel}`} value={scoped.length - punched} tone="bad" />
        <Stat label="Never used the app" value={never} tone="bad" />
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadCsv(filtered, since)}
            disabled={!filtered.length}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Last punch</th>
                  <th className="px-4 py-3">Days punched</th>
                  <th className="px-4 py-3">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.employee_id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.employee_code}
                        {r.on_leave_today ? (
                          <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600">
                            On leave
                          </span>
                        ) : null}
                        {!r.has_login ? (
                          <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600">
                            No login
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{r.outlet_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <LastPunch at={r.last_punch_at} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.days_since}</td>
                    <td className="px-4 py-3">
                      {r.phone ? (
                        <span className="flex items-center gap-3">
                          <a
                            href={`tel:${r.phone}`}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Call ${r.full_name}`}
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                          <a
                            href={whatsappHref(r)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`WhatsApp ${r.full_name}`}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                          <span className="text-xs text-muted-foreground">{r.phone}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && !q.isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      {q.error ? "Couldn't load the list." : 'Nobody matches these filters.'}
                    </td>
                  </tr>
                ) : null}
                {q.isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">
        Only the employee's own punches count. Regularised punches don't.
      </p>
    </>
  )
}

function LastPunch({ at }: { at: string | null }) {
  if (!at) return <span className="text-destructive">Never</span>
  const days = differenceInCalendarDays(new Date(), new Date(at))
  const ago = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
  return (
    <div>
      <div className={days >= 7 ? 'text-destructive' : undefined}>{ago}</div>
      <div className="text-xs text-muted-foreground">
        {formatInTimeZone(at, 'Asia/Kolkata', 'd MMM, h:mm a')}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div
        className={`text-lg font-semibold tabular-nums ${tone === 'bad' && value ? 'text-destructive' : ''}`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function whatsappHref(r: UsageRow): string {
  const digits = (r.phone ?? '').replace(/\D/g, '')
  const num = digits.length === 10 ? `91${digits}` : digits
  const text = `Hi ${r.full_name.split(' ')[0]}, please remember to punch in and out on the Flax HR app (hr.flaxfoods.in) every shift.`
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
}

function downloadCsv(rows: UsageRow[], since: string) {
  const header = [
    'employee_code',
    'employee_name',
    'outlet',
    'phone',
    'last_punch',
    'days_punched_since',
    'on_leave_today',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csv(r.employee_code),
        csv(r.full_name),
        csv(r.outlet_name ?? ''),
        csv(r.phone ?? ''),
        r.last_punch_at ? formatInTimeZone(r.last_punch_at, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm') : 'never',
        r.days_since,
        r.on_leave_today ? 'yes' : '',
      ].join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `app-usage-since-${since}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function csv(s: string): string {
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
