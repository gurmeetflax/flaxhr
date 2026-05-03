import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useCreateRegularisation, useMyRegularisations, type Regularisation } from '@/lib/regularisations'

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
    </>
  )
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
