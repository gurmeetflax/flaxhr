import { useState } from 'react'
import { Briefcase, LogIn, LogOut, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { formatInTimeZone } from 'date-fns-tz'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { mapsLink, useMeetingCheckIn, useMeetingCheckOut, useMyTodayVisits } from '@/lib/fieldVisits'

const IST = 'Asia/Kolkata'

// Meeting check-in / check-out for field staff (sales). Uses the same
// live GPS fix as the punch card.
export default function MeetingCard({
  employeeId,
  coords,
}: {
  employeeId: string
  coords: { lat: number; lng: number; accuracy: number } | null
}) {
  const visitsQ = useMyTodayVisits(employeeId)
  const checkIn = useMeetingCheckIn()
  const checkOut = useMeetingCheckOut()
  const [client, setClient] = useState('')
  const [purpose, setPurpose] = useState('')
  const [outcome, setOutcome] = useState('')

  const visits = visitsQ.data ?? []
  const open = visits.find((v) => !v.check_out_at) ?? null

  const onCheckIn = async () => {
    if (!coords) return toast.error('Waiting for your location.')
    if (!client.trim()) return toast.error('Enter who you are meeting.')
    try {
      await checkIn.mutateAsync({ client: client.trim(), purpose: purpose.trim(), coords })
      toast.success(`Checked in to meeting with ${client.trim()}`)
      setClient('')
      setPurpose('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check-in failed')
    }
  }

  const onCheckOut = async () => {
    if (!coords) return toast.error('Waiting for your location.')
    try {
      await checkOut.mutateAsync({ outcome: outcome.trim(), coords })
      toast.success('Checked out of meeting')
      setOutcome('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check-out failed')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <CardTitle>Meetings</CardTitle>
        </div>

        {open ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="font-medium">In meeting with {open.client_name}</div>
              <div className="text-xs text-muted-foreground">
                Since {formatInTimeZone(open.check_in_at, IST, 'h:mm a')}
                {open.purpose ? ` · ${open.purpose}` : ''}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              How did it go? (optional)
              <textarea
                className="min-h-[70px] rounded-lg border border-border bg-surface p-3 text-sm"
                placeholder="Outcome, next steps, order value…"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </label>
            <Button size="lg" variant="outline" onClick={onCheckOut} loading={checkOut.isPending} disabled={!coords}>
              <LogOut className="h-4 w-4" /> Check out of meeting
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input placeholder="Meeting with (client / company)" value={client} onChange={(e) => setClient(e.target.value)} />
            <Input placeholder="Purpose (optional)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            <Button size="lg" onClick={onCheckIn} loading={checkIn.isPending} disabled={!coords || !client.trim()}>
              <LogIn className="h-4 w-4" /> {coords ? 'Check in to meeting' : 'Waiting for location…'}
            </Button>
          </div>
        )}

        {visits.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {visits.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <div className="font-medium">{v.client_name}</div>
                  {v.outcome ? <div className="text-xs text-muted-foreground">{v.outcome}</div> : null}
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div>
                    {formatInTimeZone(v.check_in_at, IST, 'h:mm a')} –{' '}
                    {v.check_out_at ? formatInTimeZone(v.check_out_at, IST, 'h:mm a') : 'now'}
                  </div>
                  <a
                    href={mapsLink(v.check_in_lat, v.check_in_lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <MapPin className="h-3 w-3" /> Map
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <CardDescription>No meetings yet today.</CardDescription>
        )}
      </CardContent>
    </Card>
  )
}
