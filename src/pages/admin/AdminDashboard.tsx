import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInDays, format, startOfMonth } from 'date-fns'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock4,
  Globe2,
  Plane,
  Sparkles,
  TrendingDown,
  Users,
  XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  useAdminDashboardSummary,
  useRosterVsAttendance,
  type RosterAttendanceFlag,
  type RosterAttendanceRow,
} from '@/lib/dashboards'

interface OutletOption {
  id: string
  display_name: string | null
}

const ALL_OUTLETS = '__all' as const

export default function AdminDashboard() {
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const [periodMonth, setPeriodMonth] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )
  const [outletFilter, setOutletFilter] = useState<string>(ALL_OUTLETS)

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

  const outletId = outletFilter === ALL_OUTLETS ? null : outletFilter
  const summary = useAdminDashboardSummary(periodMonth, outletId)
  const rosterCheck = useRosterVsAttendance(today, outletId)

  const periodLabel = format(new Date(periodMonth), 'MMM yyyy')

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description={`HR snapshot for ${periodLabel}`}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          <OutletPill
            label="All outlets"
            icon
            active={outletFilter === ALL_OUTLETS}
            onClick={() => setOutletFilter(ALL_OUTLETS)}
          />
          {outletsQ.data?.map((o) => (
            <OutletPill
              key={o.id}
              label={o.display_name ?? o.id}
              active={outletFilter === o.id}
              onClick={() => setOutletFilter(o.id)}
            />
          ))}
        </div>
        <input
          type="month"
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={periodMonth.slice(0, 7)}
          onChange={(e) => setPeriodMonth(`${e.target.value}-01`)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Headcount"
          value={summary.data?.headcount}
          icon={Users}
        />
        <Kpi
          label="Manpower cost"
          value={summary.data ? inr(summary.data.manpower_cost) : undefined}
          icon={Banknote}
        />
        <Kpi
          label="Sales"
          value={summary.data ? inr(summary.data.sales) : undefined}
          icon={Banknote}
        />
        <Kpi
          label="Manpower cost %"
          value={
            summary.data?.manpower_cost_pct == null
              ? '—'
              : `${summary.data.manpower_cost_pct}%`
          }
          icon={TrendingDown}
          hint={
            summary.data?.manpower_cost_pct == null
              ? 'Enter sales below to compute'
              : undefined
          }
        />
        <Kpi
          label="Attrition %"
          value={summary.data ? `${summary.data.attrition_pct}%` : undefined}
          icon={TrendingDown}
          hint={
            summary.data
              ? `${summary.data.leavers} leaver(s), ${summary.data.joiners} joiner(s)`
              : undefined
          }
        />
        <Kpi
          label="Present today"
          value={summary.data?.present_today}
          icon={CheckCircle2}
        />
        <Kpi label="Late today" value={summary.data?.late_today} icon={Clock4} />
        <Kpi label="On leave" value={summary.data?.on_leave_today} icon={Plane} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TeamCard outletId={outletId} />
        <RosterAttendanceCard
          rows={rosterCheck.data ?? []}
          loading={rosterCheck.isLoading}
        />
      </div>
    </>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string
  value: number | string | undefined
  icon: React.ComponentType<{ className?: string }>
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="truncate text-xl font-semibold">{value ?? '—'}</div>
          {hint ? (
            <div className="text-xs text-muted-foreground">{hint}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

interface TeamRow {
  id: string
  full_name: string
  employee_code: string
  outlet_id: string | null
  outlet_name: string | null
  designation_name: string | null
  hired_on: string | null
  is_active: boolean
}

const RECENT_DAYS = 60 // ~2 months — flagged with the "New" tag

function TeamCard({ outletId }: { outletId: string | null }) {
  const teamQ = useQuery<TeamRow[]>({
    queryKey: ['admin-dashboard-team', outletId],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('v_employees')
        .select(
          'id, full_name, employee_code, outlet_id, outlet_name, designation_name, hired_on, is_active',
        )
        .eq('is_active', true)
        .order('hired_on', { ascending: false, nullsFirst: false })
      if (outletId) q = q.eq('outlet_id', outletId)
      const { data, error } = await q
      if (error) throw error
      return (data as unknown as TeamRow[]) ?? []
    },
  })

  const team = teamQ.data ?? []
  const today = new Date()
  const recent = team.filter(
    (e) => e.hired_on && differenceInDays(today, new Date(e.hired_on)) <= RECENT_DAYS,
  )
  const others = team.filter(
    (e) => !e.hired_on || differenceInDays(today, new Date(e.hired_on)) > RECENT_DAYS,
  )

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Team</CardTitle>
            <CardDescription>
              {team.length} active{' '}
              {team.length === 1 ? 'employee' : 'employees'}
              {recent.length > 0 ? ` · ${recent.length} onboarded in the last ${RECENT_DAYS} days` : ''}
            </CardDescription>
          </div>
          <Link to="/admin/employees">
            <Button size="sm" variant="ghost">
              See all
            </Button>
          </Link>
        </div>

        {teamQ.isLoading ? (
          <CardDescription>Loading…</CardDescription>
        ) : team.length === 0 ? (
          <CardDescription>No employees yet.</CardDescription>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
            {recent.map((e) => (
              <TeamRowItem key={e.id} row={e} isNew />
            ))}
            {others.map((e) => (
              <TeamRowItem key={e.id} row={e} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TeamRowItem({ row, isNew }: { row: TeamRow; isNew?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <Link
        to={`/admin/employees/${row.id}`}
        className="flex flex-1 items-center gap-2 hover:underline"
      >
        <span className="font-medium">{row.full_name}</span>
        {isNew ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" /> New
          </span>
        ) : null}
      </Link>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {row.designation_name ?? '—'}
      </span>
      <span className="text-xs text-muted-foreground">
        {row.outlet_name ?? '—'}
      </span>
    </li>
  )
}

function RosterAttendanceCard({
  rows,
  loading,
}: {
  rows: RosterAttendanceRow[]
  loading: boolean
}) {
  const totals = rows.reduce(
    (acc, r) => {
      acc[r.flag] = (acc[r.flag] ?? 0) + 1
      return acc
    },
    {} as Record<RosterAttendanceFlag, number>,
  )

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Roster vs attendance — today</CardTitle>
            <CardDescription>
              Cross-check of published rosters against first in-punch.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Pill tone="ok">{totals.on_time ?? 0} on time</Pill>
            <Pill tone="warn">{totals.late ?? 0} late</Pill>
            <Pill tone="bad">{totals.missed ?? 0} missed</Pill>
          </div>
        </div>
        {loading ? (
          <CardDescription>Loading…</CardDescription>
        ) : rows.length === 0 ? (
          <CardDescription>No published roster for today.</CardDescription>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Employee</th>
                  <th className="py-2 pr-3">Outlet</th>
                  <th className="py-2 pr-3">Shift</th>
                  <th className="py-2 pr-3">Planned</th>
                  <th className="py-2 pr-3">In</th>
                  <th className="py-2 pr-3">Δ</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr
                    key={r.employee_id}
                    className={cn(
                      r.flag === 'missed' && 'bg-destructive/5',
                      r.flag === 'late' && 'bg-amber-500/5',
                    )}
                  >
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.employee_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.employee_code}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.outlet_name ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.shift_name ?? '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.planned_start ? r.planned_start.slice(0, 5) : '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.actual_in
                        ? format(new Date(r.actual_in), 'HH:mm')
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.delta_minutes == null
                        ? '—'
                        : `${r.delta_minutes > 0 ? '+' : ''}${r.delta_minutes}m`}
                    </td>
                    <td className="py-2">
                      <FlagBadge flag={r.flag} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FlagBadge({ flag }: { flag: RosterAttendanceFlag }) {
  if (flag === 'missed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <XCircle className="h-3 w-3" /> Missed
      </span>
    )
  }
  if (flag === 'late') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
        <AlertTriangle className="h-3 w-3" /> Late
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <CheckCircle2 className="h-3 w-3" /> On time
    </span>
  )
}

function Pill({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'bad'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
        tone === 'ok' && 'bg-primary/10 text-primary',
        tone === 'warn' && 'bg-amber-500/10 text-amber-600',
        tone === 'bad' && 'bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </span>
  )
}

function OutletPill({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon?: boolean
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-surface text-muted-foreground hover:bg-muted',
      )}
    >
      {icon ? <Globe2 className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  )
}

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
function inr(n: number | null | undefined): string {
  if (n == null) return '—'
  return inrFmt.format(Number(n))
}
