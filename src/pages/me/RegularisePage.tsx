import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  REG_CATEGORY_LABEL,
  regWhen,
  useCreateRegularisation,
  useMyRegularisations,
  type RegCategory,
  type Regularisation,
} from '@/lib/regularisations'

const HINT: Record<RegCategory, string> = {
  missed_punch: 'Forgot to punch in or out? Add the time you actually came in or left.',
  week_off: 'Your weekly off. One a week (Monday to Sunday), up to 4 a month. Paid once approved.',
  sick_leave: 'Off sick for the whole day. Paid leave once approved.',
  casual_leave: 'A personal day off. Unpaid leave once approved.',
}

const PLACEHOLDER: Record<RegCategory, string> = {
  missed_punch: 'Why was the original punch missed?',
  week_off: 'Optional note, e.g. swapped with a colleague',
  sick_leave: 'What happened? e.g. fever',
  casual_leave: 'Why do you need the day off?',
}

export default function RegularisePage() {
  const [category, setCategory] = useState<RegCategory>('missed_punch')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState(format(new Date(), 'HH:mm'))
  const [type, setType] = useState<'in' | 'out'>('in')
  const [reason, setReason] = useState('')

  const create = useCreateRegularisation()
  const { data: list = [] } = useMyRegularisations()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const punch = category === 'missed_punch'
    try {
      // A day request only needs the date (sent as midday IST so the date
      // can't shift with the phone's time zone).
      const requested_for = punch
        ? new Date(`${date}T${time}`).toISOString()
        : new Date(`${date}T12:00:00+05:30`).toISOString()
      if (punch ? new Date(requested_for).getTime() > Date.now() : date > format(new Date(), 'yyyy-MM-dd')) {
        toast.error(
          punch
            ? 'That time is in the future. Pick the date and time of the punch you missed.'
            : 'That date is in the future. Regularise a day off after it has happened.',
        )
        return
      }
      await create.mutateAsync({
        requested_for,
        type: punch ? type : 'in',
        category,
        reason: reason.trim() || REG_CATEGORY_LABEL[category],
      })
      toast.success('Regularisation submitted')
      setReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed')
    }
  }

  return (
    <>
      <PageHeader
        title="Regularise"
        description="Fix a missed punch, or record a week off, sick leave or casual leave"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>New request</CardTitle>
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <label className="flex flex-col gap-1 text-sm">
                Category
                <select
                  className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as RegCategory)}
                >
                  {(Object.keys(REG_CATEGORY_LABEL) as RegCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {REG_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">{HINT[category]}</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  Date
                  <Input
                    type="date"
                    value={date}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </label>
                {category === 'missed_punch' ? (
                  <label className="flex flex-col gap-1 text-sm">
                    Time
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
                  </label>
                ) : null}
              </div>
              {category === 'missed_punch' ? (
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
              ) : null}
              <label className="flex flex-col gap-1 text-sm">
                {category === 'week_off' ? 'Note (optional)' : 'Reason'}
                <textarea
                  className="min-h-[80px] rounded-lg border border-border bg-surface p-3 text-sm"
                  placeholder={PLACEHOLDER[category]}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required={category !== 'week_off'}
                />
              </label>
              <Button
                type="submit"
                loading={create.isPending}
                disabled={category !== 'week_off' && !reason.trim()}
              >
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
        <span className="font-medium">{regWhen(reg, tz)}</span>
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
