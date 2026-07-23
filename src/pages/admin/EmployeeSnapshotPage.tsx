import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, subMonths } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { toast } from 'sonner'
import {
  AlertTriangle,
  BadgeCheck,
  Cake,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Home,
  MailWarning,
  Phone,
  Shirt,
  TrendingDown,
  UserRound,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useEmployeeScore, useUpsertKnowledgeScore } from '@/lib/score'
import { useEmployeeSnapshot, useSignedUrl } from '@/lib/employeeSnapshot'

const IST = 'Asia/Kolkata'

export default function EmployeeSnapshotPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [periodMonth, setPeriodMonth] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )

  const snapQ = useEmployeeSnapshot(id)
  const scoreQ = useEmployeeScore(id, periodMonth)
  const knowledge = useUpsertKnowledgeScore()
  const selfieUrlQ = useSignedUrl(snapQ.data?.latest_selfie_path ?? null)

  const [knowledgeInput, setKnowledgeInput] = useState('')

  // 6-month trend — parallel, so one hang doesn't stall the whole page.
  const months = useMemo(() => {
    const arr: string[] = []
    for (let i = 5; i >= 0; i--) {
      arr.push(format(startOfMonth(subMonths(new Date(), i)), 'yyyy-MM-dd'))
    }
    return arr
  }, [])
  const trendQ = useQuery<{ period: string; total: number }[]>({
    queryKey: ['employee-snapshot-trend', id, months.join(',')],
    enabled: !!id,
    queryFn: async () => {
      const results = await Promise.all(
        months.map(async (m) => {
          try {
            const { data } = await supabase.rpc('employee_score', {
              p_employee: id!,
              p_period_month: m,
            })
            const row = Array.isArray(data) ? data[0] : data
            return {
              period: m,
              total: row ? Number((row as { total_score: number }).total_score) : 0,
            }
          } catch {
            return { period: m, total: 0 }
          }
        }),
      )
      return results
    },
  })

  async function saveKnowledge() {
    const n = Number(knowledgeInput)
    if (Number.isNaN(n) || n < 0 || n > 100) {
      toast.error('Score must be 0–100')
      return
    }
    try {
      await knowledge.mutateAsync({
        employee_id: id!,
        period_month: periodMonth,
        score: n,
      })
      toast.success('Knowledge score saved')
      setKnowledgeInput('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  if (!id) return null

  const s = snapQ.data
  const tenureYears = s?.tenure_days != null ? (s.tenure_days / 365).toFixed(1) : null

  return (
    <>
      <PageHeader
        title={s?.employee_name ?? 'Snapshot'}
        description={
          s ? `${s.employee_code} · ${s.outlet_name ?? 'No outlet'} · ${s.designation_name ?? '—'}` : 'Loading…'
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/employees')}>
            Back
          </Button>
        }
      />

      {/* Identity card */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar url={selfieUrlQ.data ?? null} name={s?.employee_name ?? '?'} />
          <div className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <KV icon={UserRound} label="Employee code" value={s?.employee_code ?? '—'} />
            <KV icon={BadgeCheck} label="Designation" value={s?.designation_name ?? '—'} />
            <KV
              icon={CalendarClock}
              label="Tenure"
              value={
                tenureYears
                  ? `${tenureYears}y (since ${formatDDMMYY(s?.hired_on ?? null)})`
                  : '—'
              }
            />
            <KV icon={Phone} label="Phone" value={s?.phone ?? '—'} />
            <KV
              icon={MailWarning}
              label="Email"
              value={s?.personal_email ?? '—'}
            />
            <KV
              icon={Cake}
              label="DOB"
              value={formatDDMMYY(s?.date_of_birth ?? null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Period picker */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Label className="text-xs">Period</Label>
        <Input
          type="month"
          value={periodMonth.slice(0, 7)}
          onChange={(e) => setPeriodMonth(`${e.target.value}-01`)}
          className="w-40"
        />
      </div>

      {/* Composite + Breakdown */}
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
            <CardTitle>Composite</CardTitle>
            {scoreQ.isPending ? (
              <div className="text-muted-foreground text-sm">Loading…</div>
            ) : scoreQ.isError ? (
              <div className="text-destructive text-sm">Failed to load</div>
            ) : (
              <>
                <Gauge value={scoreQ.data?.total_score ?? 0} />
                <CardDescription>
                  {scoreQ.data ? `${scoreQ.data.period_month?.slice(0, 7)}` : '—'}
                </CardDescription>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>Breakdown</CardTitle>
            {scoreQ.isPending ? (
              <CardDescription>Loading…</CardDescription>
            ) : scoreQ.isError ? (
              <CardDescription className="text-destructive">
                {scoreQ.error instanceof Error ? scoreQ.error.message : 'Failed to load'}
              </CardDescription>
            ) : scoreQ.data ? (
              <div className="flex flex-col gap-2">
                <Bar label="Attendance"  weight={scoreQ.data.weights.attendance ?? 0}  score={scoreQ.data.attendance_score} />
                <Bar label="Leaves"      weight={scoreQ.data.weights.leaves ?? 0}      score={scoreQ.data.leaves_score} />
                <Bar label="Evaluations" weight={scoreQ.data.weights.evaluations ?? 0} score={scoreQ.data.evaluations_score} />
                <Bar label="Complaints"  weight={scoreQ.data.weights.complaints ?? 0}  score={scoreQ.data.complaints_score} />
                <Bar label="Knowledge"   weight={scoreQ.data.weights.knowledge ?? 0}   score={scoreQ.data.knowledge_score} />
              </div>
            ) : (
              <CardDescription>No score yet for this period.</CardDescription>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick-stat cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Late (30d)"    value={s?.late_count_30d}    hint={s?.avg_late_minutes_30d ? `avg ${s.avg_late_minutes_30d}m` : undefined} tone={s?.late_count_30d && s.late_count_30d > 0 ? 'amber' : 'ok'} />
        <Stat label="Absent (30d)"  value={s?.absent_count_30d}  tone={s?.absent_count_30d && s.absent_count_30d > 0 ? 'bad' : 'ok'} />
        <Stat label="Present (30d)" value={s?.present_count_30d} tone="ok" />
        <Stat label="On leave (30d)" value={s?.on_leave_count_30d} tone="ok" />
        <Stat label="Leaves pending" value={s?.leaves_pending} tone={s?.leaves_pending && s.leaves_pending > 0 ? 'amber' : 'ok'} />
        <Stat label="Leaves used"    value={s?.leaves_used} tone="ok" />
        <Stat label="Warnings"       value={s?.warning_count} hint={s?.last_warning_at ? `last ${formatDDMMYY(s.last_warning_at)}` : undefined} tone={s?.warning_count && s.warning_count > 0 ? 'bad' : 'ok'} />
        <Stat label="Active PIPs"    value={s?.pip_open_count} hint={s?.pip_target_date ? `target ${formatDDMMYY(s.pip_target_date)}` : undefined} tone={s?.pip_open_count && s.pip_open_count > 0 ? 'bad' : 'ok'} />
      </div>

      {/* Docs / KYC / uniform / emergency */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-2 p-6">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Documents
            </CardTitle>
            <DocRow label="Offer letter"       have={!!s?.has_offer_letter} />
            <DocRow label="Appointment letter" have={!!s?.has_appointment_letter} />
            <DocRow label="Contract"           have={!!s?.has_contract} />
            <div className="text-xs text-muted-foreground">
              {s?.document_count ?? 0} document{(s?.document_count ?? 0) === 1 ? '' : 's'} on file
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2 p-6">
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" /> KYC
            </CardTitle>
            <div className="text-sm">
              Status:{' '}
              <span
                className={
                  'rounded-full px-2 py-0.5 text-xs font-medium ' +
                  (s?.kyc_status === 'verified'
                    ? 'bg-primary/10 text-primary'
                    : s?.kyc_status === 'rejected'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-amber-500/10 text-amber-600')
                }
              >
                {s?.kyc_status ?? 'unknown'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2 p-6">
            <CardTitle className="flex items-center gap-2">
              <Shirt className="h-4 w-4" /> Uniform
            </CardTitle>
            <div className="text-sm">
              {s?.uniform_active_qty ?? 0} item{s?.uniform_active_qty === 1 ? '' : 's'} allocated
              {' '}({s?.uniform_active_count ?? 0} entries)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2 p-6">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Emergency contact
            </CardTitle>
            <div className="text-sm">
              {s?.emergency_contact_name ?? '—'}
              {s?.emergency_contact_phone ? ` · ${s.emergency_contact_phone}` : ''}
            </div>
            <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
              <Home className="mt-0.5 h-3 w-3" />
              <span>{s?.address ?? 'No address on file'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 6-month trend */}
      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> 6-month composite trend
          </CardTitle>
          <Sparkline points={trendQ.data ?? []} />
        </CardContent>
      </Card>

      {/* Knowledge score */}
      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Set knowledge score
          </CardTitle>
          <CardDescription>
            HR-graded knowledge for{' '}
            <span className="font-mono">{periodMonth.slice(0, 7)}</span>. 0–100.
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={knowledgeInput}
              onChange={(e) => setKnowledgeInput(e.target.value)}
              placeholder="e.g. 85"
              className="w-32"
            />
            <Button onClick={saveKnowledge} loading={knowledge.isPending}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

/* --------------------------------- ui --------------------------------- */

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase()
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-20 w-20 shrink-0 rounded-full border border-border object-cover"
      />
    )
  }
  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-border bg-muted text-lg font-semibold text-muted-foreground">
      {initials || '?'}
    </div>
  )
}

function KV({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number | undefined | null
  hint?: string
  tone?: 'ok' | 'amber' | 'bad'
}) {
  const toneCls =
    tone === 'bad'
      ? 'text-destructive'
      : tone === 'amber'
      ? 'text-amber-600'
      : 'text-foreground'
  return (
    <Card>
      <CardContent className="flex flex-col p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${toneCls}`}>
          {value ?? 0}
        </div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

function DocRow({ label, have }: { label: string; have: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span
        className={
          'rounded-full px-2 py-0.5 text-xs font-medium ' +
          (have ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')
        }
      >
        {have ? 'On file' : 'Missing'}
      </span>
    </div>
  )
}

function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const color = v >= 80 ? 'text-primary' : v >= 60 ? 'text-amber-600' : 'text-destructive'
  return <div className={`text-5xl font-bold ${color}`}>{Number(v).toFixed(0)}</div>
}

function Bar({ label, weight, score }: { label: string; weight: number; score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span>
          {label} <span className="text-muted-foreground">· w{weight}</span>
        </span>
        <span className="font-mono">{Number(pct).toFixed(0)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Sparkline({ points }: { points: { period: string; total: number }[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">Loading…</p>
  const w = 600
  const h = 80
  const max = 100
  const stepX = w / Math.max(points.length - 1, 1)
  const path = points
    .map((p, i) => {
      const x = i * stepX
      const y = h - (p.total / max) * h
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
        <path d={path} stroke="currentColor" strokeWidth={2} fill="none" className="text-primary" />
        {points.map((p, i) => (
          <circle
            key={p.period}
            cx={i * stepX}
            cy={h - (p.total / max) * h}
            r={3}
            fill="currentColor"
            className="text-primary"
          />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        {points.map((p) => (
          <span key={p.period}>{p.period.slice(5, 7)}</span>
        ))}
      </div>
    </div>
  )
}

function formatDDMMYY(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.length > 10 ? new Date(iso) : new Date(iso + 'T00:00:00')
  return formatInTimeZone(d, IST, 'dd/MM/yy')
}
