import { useState } from 'react'
import { toast } from 'sonner'
import { formatInTimeZone } from 'date-fns-tz'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useDecideRegularisation, useRegularisations, type RegStatus } from '@/lib/regularisations'

export default function RegularisationsPage() {
  const [status, setStatus] = useState<RegStatus | ''>('pending')
  const { data: list = [], isLoading } = useRegularisations({ status: status || null })
  const decide = useDecideRegularisation()

  const act = async (id: string, action: 'approved' | 'rejected') => {
    const note = action === 'rejected' ? window.prompt('Rejection note (optional)') ?? undefined : undefined
    try {
      await decide.mutateAsync({ id, status: action, note })
      toast.success(action === 'approved' ? 'Approved' : 'Rejected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <>
      <PageHeader
        title="Regularisations"
        description={isLoading ? 'Loading…' : `${list.length} requests`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(['pending', 'approved', 'rejected', 'cancelled', ''] as const).map((s) => (
          <Button
            key={s || 'all'}
            size="sm"
            variant={status === s ? 'primary' : 'outline'}
            onClick={() => setStatus(s)}
          >
            {s === '' ? 'All' : s}
          </Button>
        ))}
      </div>
      {list.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <CardTitle>No requests</CardTitle>
            <CardDescription className="mt-1">Nothing to review.</CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((r) => {
            const tz = r.outlet_timezone ?? 'Asia/Kolkata'
            return (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {r.employee_name} · {r.employee_code}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {r.outlet_name ? `${r.outlet_name} · ` : ''}
                      {r.type} at {formatInTimeZone(r.requested_for, tz, 'd MMM, h:mm a')}
                    </span>
                    <span className="text-sm">{r.reason}</span>
                  </div>
                  {r.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act(r.id, 'rejected')}
                        loading={decide.isPending}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => act(r.id, 'approved')}
                        loading={decide.isPending}
                      >
                        Approve
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs capitalize text-muted-foreground">{r.status}</span>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
