import { useState } from 'react'
import { toast } from 'sonner'
import { format, startOfMonth } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { humanErr } from '@/lib/humanErr'
import { useCreateRegularisation, useMyRegularisations, type Regularisation } from '@/lib/regularisations'

interface WeekOffRow {
  id: string
  off_date: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reason: string | null
  decision_note: string | null
  period_month: string
}

const IST = 'Asia/Kolkata'
const MAX_WEEK_OFFS_PER_MONTH = 4

export default function RegularisePage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState(format(new Date(), 'HH:mm'))
  const [type, setType] = useState<'in' | 'out'>('in')
  const [reason, setReason] = useState('')

  const create = useCreateRegularisation()
  const { data: list = [] } = useMyRegularisations()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const requested_for = new Date(`${date}T${time}`).toISOString()
      await create.mutateAsync({ requested_for, type, reason })
      toast.success('Regularisation submitted')
      setReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed')
    }
  }

  return (
    <>
      <PageHeader title="Regularise punch" description="Request a missed punch correction" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>New request</CardTitle>
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  Date
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Time
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                Type
                <select
                  className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as 'in' | 'out')}
                >
                  <option value="in">Punch in</option>
                  <option value="out">Punch out</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Reason
                <textarea
                  className="min-h-[80px] rounded-lg border border-border bg-surface p-3 text-sm"
                  placeholder="Why was the original punch missed?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </label>
              <Button type="submit" loading={create.isPending} disabled={!reason.trim()}>
                Submit request
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>My requests</CardTitle>
            {list.length === 0 ? (
              <CardDescription>No requests yet.</CardDescription>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {list.map((r) => (
                  <RegItem key={r.id} reg={r} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <WeekOffCard />
      </div>
    </>
  )
}

function WeekOffCard() {
  const qc = useQueryClient()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [reason, setReason] = useState('')

  const listQ = useQuery<WeekOffRow[]>({
    queryKey: ['my-week-offs'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_week_offs')
        .select('id, off_date, status, reason, decision_note, period_month')
        .order('off_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as WeekOffRow[]
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('submit_week_off', {
        p_date: date,
        p_reason: reason.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Week-off requested')
      setReason('')
      qc.invalidateQueries({ queryKey: ['my-week-offs'] })
    },
    onError: (err) => toast.error(humanErr(err, 'Submit failed')),
  })

  const monthKey = startOfMonth(new Date(date + 'T00:00:00')).toISOString().slice(0, 7)
  const monthRows = (listQ.data ?? []).filter(
    (r) => r.period_month.slice(0, 7) === monthKey && (r.status === 'pending' || r.status === 'approved'),
  )
  const used = monthRows.length
  const remaining = Math.max(0, MAX_WEEK_OFFS_PER_MONTH - used)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <CardTitle>Request a week off</CardTitle>
          <CardDescription>
            Paid day off. Max {MAX_WEEK_OFFS_PER_MONTH} per calendar month — approved by HR.
          </CardDescription>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit.mutate()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                Date
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <div className="flex flex-col gap-1 text-sm">
                <span>This month</span>
                <div className="flex h-10 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm tabular-nums">
                  <span className={remaining === 0 ? 'text-destructive font-medium' : ''}>
                    {used}/{MAX_WEEK_OFFS_PER_MONTH}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {remaining} remaining
                  </span>
                </div>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Reason (optional)
              <textarea
                className="min-h-[60px] rounded-lg border border-border bg-surface p-3 text-sm"
                placeholder="Family event, medical, etc."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button
              type="submit"
              loading={submit.isPending}
              disabled={remaining === 0}
            >
              {remaining === 0 ? 'Monthly cap reached' : 'Request week off'}
            </Button>
          </form>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              My week-offs
            </p>
            {listQ.data && listQ.data.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {listQ.data.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      {formatInTimeZone(new Date(r.off_date + 'T00:00:00'), IST, 'EEE, d MMM yyyy')}
                      {r.reason ? (
                        <span className="ml-2 text-xs text-muted-foreground">· {r.reason}</span>
                      ) : null}
                    </span>
                    <WeekOffPill status={r.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <CardDescription>No week-off requests yet.</CardDescription>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function WeekOffPill({ status }: { status: WeekOffRow['status'] }) {
  const cls =
    status === 'approved'
      ? 'bg-primary/10 text-primary'
      : status === 'rejected'
      ? 'bg-destructive/10 text-destructive'
      : status === 'cancelled'
      ? 'bg-muted text-muted-foreground'
      : 'bg-amber-500/10 text-amber-600'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>{status}</span>
}

function RegItem({ reg }: { reg: Regularisation }) {
  const tz = reg.outlet_timezone ?? 'Asia/Kolkata'
  return (
    <li className="flex items-start justify-between gap-3 py-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium capitalize">
          {reg.type} · {formatInTimeZone(reg.requested_for, tz, 'd MMM, h:mm a')}
        </span>
        <span className="text-xs text-muted-foreground">{reg.reason}</span>
        {reg.decision_note ? (
          <span className="text-xs text-muted-foreground">Note: {reg.decision_note}</span>
        ) : null}
      </div>
      <StatusPill status={reg.status} />
    </li>
  )
}

function StatusPill({ status }: { status: Regularisation['status'] }) {
  const cls =
    status === 'approved'
      ? 'bg-primary/10 text-primary'
      : status === 'rejected'
      ? 'bg-destructive/10 text-destructive'
      : status === 'cancelled'
      ? 'bg-muted text-muted-foreground'
      : 'bg-amber-500/10 text-amber-600'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>{status}</span>
}
