import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useDecideLeave, useLeaveRequests, type LeaveStatus } from '@/lib/leave'

export default function LeaveApprovalsPage() {
  const [status, setStatus] = useState<LeaveStatus | ''>('pending')
  const { data: list = [], isLoading } = useLeaveRequests({ status: status || null })
  const decide = useDecideLeave()

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
      <PageHeader title="Leave approvals" description={isLoading ? 'Loading…' : `${list.length} requests`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {(['pending', 'approved', 'rejected', 'cancelled', ''] as const).map((s) => (
          <Button key={s || 'all'} size="sm" variant={status === s ? 'primary' : 'outline'} onClick={() => setStatus(s)}>
            {s === '' ? 'All' : s}
          </Button>
        ))}
      </div>
      {list.length === 0 ? (
        <Card><CardContent className="p-6"><CardTitle>Nothing to review</CardTitle><CardDescription className="mt-1">No leave requests in this filter.</CardDescription></CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {list.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{r.employee_name} · {r.employee_code}</span>
                  <span className="text-sm text-muted-foreground">
                    {r.leave_name} · {r.start_date}
                    {r.start_date !== r.end_date ? ` → ${r.end_date}` : ''}
                    {' '}({r.days}d){r.outlet_name ? ` · ${r.outlet_name}` : ''}
                  </span>
                  {r.reason ? <span className="text-sm">{r.reason}</span> : null}
                </div>
                {r.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => act(r.id, 'rejected')} loading={decide.isPending}>Reject</Button>
                    <Button size="sm" onClick={() => act(r.id, 'approved')} loading={decide.isPending}>Approve</Button>
                  </div>
                ) : (
                  <span className="text-xs capitalize text-muted-foreground">{r.status}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
