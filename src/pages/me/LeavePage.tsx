import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useLeaveRequests, useLeaveTypes, useMyLeaveBalances, useSubmitLeave } from '@/lib/leave'

export default function LeavePage() {
  const { data: types = [] } = useLeaveTypes()
  const { data: balances = [] } = useMyLeaveBalances()
  const { data: requests = [] } = useLeaveRequests()
  const submit = useSubmitLeave()

  const [typeId, setTypeId] = useState('')
  const [start, setStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [halfDay, setHalfDay] = useState<'none' | 'first' | 'second'>('none')
  const [reason, setReason] = useState('')

  const [params] = useSearchParams()
  const formRef = useRef<HTMLFormElement | null>(null)
  useEffect(() => {
    if (params.get('apply') === '1' && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const select = formRef.current.querySelector('select') as HTMLSelectElement | null
      select?.focus()
    }
  }, [params])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!typeId) return
    if (!start || !end) {
      toast.error('Pick a start and end date.')
      return
    }
    if (end < start) {
      toast.error('End date must be on or after the start date.')
      return
    }
    try {
      await submit.mutateAsync({
        leave_type_id: typeId,
        start_date: start,
        end_date: end,
        half_day: halfDay,
        reason,
      })
      toast.success('Request submitted')
      setReason('')
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? JSON.stringify(err)
      toast.error(humanise(msg))
    }
  }

  return (
    <>
      <PageHeader title="Leave" description="Balances and requests" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>My balances</CardTitle>
            {balances.length === 0 ? (
              <CardDescription>No leave types configured.</CardDescription>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {balances.map((b) => (
                  <li key={b.leave_type_id} className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">{b.code}</div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-2xl font-semibold">{b.balance}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.is_paid ? 'Paid' : 'Unpaid'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>Request leave</CardTitle>
            <form ref={formRef} className="flex flex-col gap-3" onSubmit={onSubmit}>
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                required
              >
                <option value="">— Select leave type —</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}){t.min_notice_days ? ` · ${t.min_notice_days}d notice` : ''}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Start
                  <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  End
                  <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
                </label>
              </div>
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                value={halfDay}
                onChange={(e) => setHalfDay(e.target.value as 'none' | 'first' | 'second')}
              >
                <option value="none">Full day(s)</option>
                <option value="first">Half — first half (single day)</option>
                <option value="second">Half — second half (single day)</option>
              </select>
              <textarea
                className="min-h-[60px] rounded-lg border border-border bg-surface p-3 text-sm"
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button type="submit" loading={submit.isPending} disabled={!typeId}>Submit request</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>My requests</CardTitle>
            {requests.length === 0 ? (
              <CardDescription>No requests yet.</CardDescription>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {requests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {r.leave_name} · {r.start_date}
                        {r.start_date !== r.end_date ? ` → ${r.end_date}` : ''}
                        {' '}({r.days}d)
                      </span>
                      {r.reason ? <span className="text-xs text-muted-foreground">{r.reason}</span> : null}
                      {r.decision_note ? (
                        <span className="text-xs text-muted-foreground">Note: {r.decision_note}</span>
                      ) : null}
                    </div>
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs font-medium capitalize ' +
                        (r.status === 'approved'
                          ? 'bg-primary/10 text-primary'
                          : r.status === 'rejected'
                          ? 'bg-destructive/10 text-destructive'
                          : r.status === 'cancelled'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-amber-500/10 text-amber-600')
                      }
                    >
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function humanise(msg: string): string {
  if (msg.includes('NOTICE_PERIOD_NOT_MET')) return 'Notice period not met for this leave type.'
  if (msg.includes('INSUFFICIENT_BALANCE')) return 'Insufficient balance for this leave type.'
  if (msg.includes('INVALID_LEAVE_TYPE')) return 'That leave type is no longer available.'
  if (msg.includes('leave_requests_check')) return 'End date must be on or after the start date.'
  return msg
}
