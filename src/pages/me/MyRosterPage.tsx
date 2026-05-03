import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { useMyRoster } from '@/lib/roster'

export default function MyRosterPage() {
  const { data: rows = [], isLoading } = useMyRoster()
  return (
    <>
      <PageHeader title="My roster" description="Upcoming published shifts" />
      {isLoading ? (
        <Card><CardContent className="p-6"><CardDescription>Loading…</CardDescription></CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <CardTitle>No upcoming shifts</CardTitle>
            <CardDescription className="mt-1">Your manager hasn't published a roster yet.</CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{format(new Date(r.work_date), 'EEEE, d MMM')}</span>
                  <span className="text-sm text-muted-foreground">
                    {r.shift_name ?? 'Shift'} ·{' '}
                    {r.start_time?.slice(0, 5) ?? '—'}–{r.end_time?.slice(0, 5) ?? '—'}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.outlet_name ?? r.outlet_id}</span>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary capitalize">
                  {r.status}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
