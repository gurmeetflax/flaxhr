import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Clock4,
  MessageSquare,
  Plane,
  Send,
  XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAppSetting } from '@/lib/appSettings'
import { useMyEmployee } from '@/lib/auth'
import { useMyLeaveBalances } from '@/lib/leave'
import { useMyRoster } from '@/lib/roster'
import { useMyDashboardSummary } from '@/lib/dashboards'
import { useMySC } from '@/lib/serviceCharge'
import { PageHeader } from '@/components/layout/AppShell'
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default function MyDashboard() {
  const navigate = useNavigate()
  const { data: employee, isLoading } = useMyEmployee()
  const { data: summary } = useMyDashboardSummary()
  const { data: balances = [] } = useMyLeaveBalances()
  const { data: roster = [] } = useMyRoster()
  const { data: mySc = [] } = useMySC(1)
  const latestSc = mySc[0] ?? null

  const upcoming = roster.slice(0, 3)
  const totalPaidBalance =
    summary?.paid_leave_balance_total ??
    balances.filter((b) => b.is_paid).reduce((s, b) => s + Number(b.balance ?? 0), 0)

  return (
    <>
      <PageHeader
        title={
          employee?.full_name ? `Hi, ${employee.full_name.split(' ')[0]}` : 'My space'
        }
        description={
          employee?.employee_code
            ? `Employee code ${employee.employee_code}`
            : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TodayCard summary={summary ?? null} onPunch={() => navigate('/me')} />

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <div>
              <CardTitle>This month</CardTitle>
              <CardDescription>
                {format(new Date(), 'MMM yyyy')} · attendance summary
              </CardDescription>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Stat
                label="Present"
                value={summary?.month_present_days}
                icon={CheckCircle2}
                tone="ok"
              />
              <Stat
                label="Absent"
                value={summary?.month_absent_days}
                icon={XCircle}
                tone="bad"
              />
              <Stat
                label="Late"
                value={summary?.month_late_days}
                icon={Clock4}
                tone="warn"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => navigate('/me/history')}
            >
              See full history <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <div>
              <CardTitle>Leave</CardTitle>
              <CardDescription>
                {totalPaidBalance.toFixed(2)} paid days available
              </CardDescription>
            </div>
            {balances.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 text-xs">
                {balances.slice(0, 6).map((b) => (
                  <li
                    key={b.leave_type_id}
                    className="rounded-lg border border-border p-2"
                  >
                    <div className="text-[10px] uppercase text-muted-foreground">
                      {b.code}
                    </div>
                    <div className="text-base font-semibold">{b.balance}</div>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate('/me/leave?apply=1')}>
                <Plane className="h-4 w-4" /> Apply for leave
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/me/leave')}
              >
                My requests
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <div>
              <CardTitle>Upcoming roster</CardTitle>
              <CardDescription>Next 3 published shifts</CardDescription>
            </div>
            {upcoming.length === 0 ? (
              <CardDescription>Nothing scheduled yet.</CardDescription>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {upcoming.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {format(new Date(r.work_date), 'EEE, d MMM')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.shift_name ?? 'Shift'}
                        {r.start_time
                          ? ` · ${r.start_time.slice(0, 5)} – ${r.end_time?.slice(0, 5) ?? ''}`
                          : ''}
                      </span>
                    </div>
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => navigate('/me/roster')}
            >
              Full roster <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <CircleDollarSign className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <CardTitle>Service charge</CardTitle>
                <CardDescription className="mt-1">
                  {latestSc
                    ? `${format(new Date(latestSc.period_month), 'MMM yyyy')} · ${latestSc.outlet_name ?? latestSc.outlet_id}`
                    : 'No finalized run yet'}
                </CardDescription>
              </div>
            </div>
            {latestSc ? (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <SCStat label="Days" value={String(latestSc.days_present)} />
                <SCStat label="Points" value={String(latestSc.total_points)} />
                <SCStat
                  label="Payable"
                  value={`₹${Number(latestSc.sc_payable).toLocaleString('en-IN', {
                    maximumFractionDigits: 0,
                  })}`}
                  accent
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {isLoading ? null : employee ? null : (
        <Card className="mt-6">
          <CardContent className="p-6">
            <CardTitle>No employee profile yet</CardTitle>
            <CardDescription className="mt-1">
              Your login works but no employee record is linked. Ask an admin to
              complete your onboarding.
            </CardDescription>
          </CardContent>
        </Card>
      )}

      <FeedbackCard />
      <WhatsAppFab />
    </>
  )
}

function SCStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={
        'rounded-lg border p-2 ' +
        (accent ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20')
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  )
}

function TodayCard({
  summary,
  onPunch,
}: {
  summary: {
    today_shift_start: string | null
    today_shift_end: string | null
    last_punch_at: string | null
    last_punch_type: 'in' | 'out' | null
  } | null
  onPunch: () => void
}) {
  const shiftLabel =
    summary?.today_shift_start && summary?.today_shift_end
      ? `${summary.today_shift_start.slice(0, 5)} – ${summary.today_shift_end.slice(0, 5)}`
      : 'No shift today'
  const lastPunch = summary?.last_punch_at
    ? `${summary.last_punch_type?.toUpperCase()} at ${format(new Date(summary.last_punch_at), 'HH:mm')}`
    : 'No punch yet'

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div>
          <CardTitle>Today</CardTitle>
          <CardDescription>{format(new Date(), 'EEE, d MMM yyyy')}</CardDescription>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Shift</div>
            <div className="font-medium">{shiftLabel}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">
              Last punch
            </div>
            <div className="font-medium">{lastPunch}</div>
          </div>
        </div>
        <Button className="self-start" onClick={onPunch}>
          <Clock className="h-4 w-4" /> Punch in / out
        </Button>
      </CardContent>
    </Card>
  )
}

function FeedbackCard() {
  const [category, setCategory] = useState<'company' | 'hr' | 'operations'>('hr')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) {
      toast.error('Write a few words.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('submit_feedback', {
        p_category: category,
        p_message: message.trim(),
      })
      if (error) throw error
      toast.success('Thanks — feedback sent to HR.')
      setMessage('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Failed'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Feedback</CardTitle>
            <CardDescription className="mt-1">
              Anonymous to your manager — only HR sees it. Pick a category.
            </CardDescription>
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(['company', 'hr', 'operations'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ' +
                  (category === c
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-muted-foreground hover:border-primary/50')
                }
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            className="min-h-24 rounded-lg border border-border bg-surface p-3 text-base sm:text-sm"
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          <div>
            <Button type="submit" loading={busy} disabled={!message.trim()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function WhatsAppFab() {
  const { data: number = '' } = useAppSetting<string>('hr_whatsapp_number', '')
  const { data: prefill = 'Hi HR, ' } = useAppSetting<string>(
    'hr_whatsapp_default_message',
    'Hi HR, ',
  )
  const cleanNumber = (number ?? '').replace(/[^\d]/g, '')
  if (!cleanNumber) return null

  const href = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(prefill ?? 'Hi HR, ')}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with HR on WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105"
      style={{
        bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        right: 'max(1.5rem, env(safe-area-inset-right))',
      }}
    >
      <svg
        viewBox="0 0 32 32"
        className="h-7 w-7 fill-current"
        aria-hidden
      >
        <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.946 2.722.946.444 0 1.39-.16 1.776-.776.17-.374.245-.644.245-1.045 0-.473-2.005-1.247-2.508-1.247zm-2.95 7.668c-1.418 0-2.85-.388-4.082-1.117l-2.937.94.948-2.864a8.05 8.05 0 0 1-1.305-4.408c0-4.494 3.654-8.144 8.148-8.144 4.494 0 8.144 3.65 8.144 8.144 0 4.494-3.65 8.148-8.144 8.148zm0-17.85c-5.358 0-9.71 4.354-9.71 9.71 0 1.832.51 3.546 1.395 5.005L5 27.978l5.708-1.46a9.64 9.64 0 0 0 4.452 1.087c5.357 0 9.708-4.351 9.708-9.71 0-5.355-4.35-9.703-9.708-9.703z" />
      </svg>
    </a>
  )
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | undefined
  icon: React.ComponentType<{ className?: string }>
  tone: 'ok' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'ok'
      ? 'bg-primary/10 text-primary'
      : tone === 'warn'
        ? 'bg-amber-500/10 text-amber-600'
        : 'bg-destructive/10 text-destructive'
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`grid h-6 w-6 place-items-center rounded-md ${toneClass}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-semibold">{value ?? '—'}</div>
    </div>
  )
}
