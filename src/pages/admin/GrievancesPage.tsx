import { useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  GRIEVANCE_CATEGORIES,
  useGrievances,
  useUpdateGrievanceStatus,
  type AdminGrievance,
  type GrievanceStatus,
} from '@/lib/grievances'

const CAT_LABEL = Object.fromEntries(
  GRIEVANCE_CATEGORIES.map((c) => [c.code, c.label]),
) as Record<string, string>

const STATUS_LABEL: Record<GrievanceStatus, string> = {
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

export default function GrievancesPage() {
  const { data = [], isLoading } = useGrievances()
  const [filter, setFilter] = useState<'all' | GrievanceStatus>('open')
  const [active, setActive] = useState<AdminGrievance | null>(null)

  const filtered = useMemo(
    () => (filter === 'all' ? data : data.filter((g) => g.status === filter)),
    [data, filter],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length }
    for (const g of data) c[g.status] = (c[g.status] ?? 0) + 1
    return c
  }, [data])

  return (
    <>
      <PageHeader
        title="Grievances"
        description="Sensitive employee concerns. Visible only to admin/HR + auditors. Managers cannot see this list."
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', 'open', 'under_review', 'resolved', 'dismissed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
              (filter === s
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface text-muted-foreground hover:border-primary/50')
            }
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Subject</th>
                    <th className="px-4 py-2.5">From</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Severity</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No grievances.</td></tr>
                  ) : (
                    filtered.map((g) => (
                      <tr
                        key={g.id}
                        onClick={() => setActive(g)}
                        className={
                          'cursor-pointer border-t border-border hover:bg-muted/30 ' +
                          (active?.id === g.id ? 'bg-primary/5' : '')
                        }
                      >
                        <td className="px-4 py-3 font-medium">{g.subject}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {g.is_anonymous ? <span className="italic">Anonymous</span> : g.full_name}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                          {g.category.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={
                            'rounded px-2 py-0.5 text-xs font-medium capitalize ' +
                            (g.severity === 'high' ? 'bg-destructive/10 text-destructive' :
                             g.severity === 'medium' ? 'bg-warning/10 text-warning' :
                             'bg-muted text-muted-foreground')
                          }>
                            {g.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={
                            'rounded px-2 py-0.5 text-xs font-medium ' +
                            (g.status === 'resolved' ? 'bg-primary/10 text-primary' :
                             g.status === 'dismissed' ? 'bg-muted text-muted-foreground' :
                             g.status === 'under_review' ? 'bg-warning/10 text-warning' :
                             'bg-destructive/10 text-destructive')
                          }>
                            {STATUS_LABEL[g.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {format(new Date(g.created_at), 'd MMM, HH:mm')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {active ? <DetailCard g={active} onClose={() => setActive(null)} /> : (
          <Card>
            <CardContent className="flex flex-col gap-2 p-6 text-sm text-muted-foreground">
              <ShieldAlert className="h-5 w-5" />
              Select a row to investigate.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}

function DetailCard({ g, onClose }: { g: AdminGrievance; onClose: () => void }) {
  const update = useUpdateGrievanceStatus()
  const [hrNotes, setHrNotes] = useState(g.hr_notes ?? '')
  const [resolution, setResolution] = useState(g.resolution ?? '')

  async function setStatus(status: GrievanceStatus) {
    try {
      await update.mutateAsync({
        id: g.id,
        status,
        hr_notes: hrNotes || undefined,
        resolution: resolution || undefined,
      })
      toast.success('Updated')
      if (status === 'resolved' || status === 'dismissed') onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{g.subject}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {CAT_LABEL[g.category]} · {g.severity}
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:underline"
          >
            Close
          </button>
        </div>
        <p className="rounded border border-border bg-muted/30 p-3 whitespace-pre-wrap text-sm">
          {g.description}
        </p>
        <div className="text-xs text-muted-foreground">
          From: {g.is_anonymous ? <span className="italic">Anonymous</span> : `${g.full_name} (${g.employee_code})`}
          {g.outlet_name ? ` · ${g.outlet_name}` : ''}
          {' · '}
          {format(new Date(g.created_at), 'd MMM yyyy, HH:mm')}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Internal notes (HR only)</label>
          <textarea
            value={hrNotes}
            onChange={(e) => setHrNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            placeholder="Investigation notes, witnesses, timeline…"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Resolution (visible to employee)</label>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            placeholder="What was done. Shown to the employee."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {g.status === 'open' ? (
            <Button size="sm" variant="outline" onClick={() => setStatus('under_review')}>
              Start review
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setStatus('resolved')} loading={update.isPending}>
            Mark resolved
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStatus('dismissed')}
            className="text-destructive hover:text-destructive"
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
