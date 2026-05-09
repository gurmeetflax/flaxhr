import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import {
  GRIEVANCE_CATEGORIES,
  useMyGrievances,
  useSubmitGrievance,
  type GrievanceCategory,
  type GrievanceSeverity,
} from '@/lib/grievances'

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

export default function MyGrievancesPage() {
  const submit = useSubmitGrievance()
  const { data = [], isLoading } = useMyGrievances()

  const [category, setCategory] = useState<GrievanceCategory>('harassment')
  const [severity, setSeverity] = useState<GrievanceSeverity>('medium')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [anonymous, setAnonymous] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) {
      toast.error('Subject and description are required.')
      return
    }
    try {
      await submit.mutateAsync({ category, severity, subject, description, anonymous })
      toast.success('Submitted. HR has been notified.')
      setSubject('')
      setDescription('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Failed'
      toast.error(msg)
    }
  }

  return (
    <>
      <PageHeader
        title="Grievances"
        description="Sensitive concerns. Only HR sees your submission — your manager does not."
      />
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Raise a grievance</CardTitle>
                <CardDescription className="mt-1">
                  Pick the closest category. You can submit anonymously — but
                  HR can't follow up with you if you do.
                </CardDescription>
              </div>
            </div>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div>
                <Label className="mb-1 block text-xs">Category</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as GrievanceCategory)}
                  className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-base sm:text-sm"
                >
                  {GRIEVANCE_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Severity</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(['low', 'medium', 'high'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(s)}
                      className={
                        'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ' +
                        (severity === s
                          ? s === 'high'
                            ? 'border-destructive bg-destructive/10 text-destructive'
                            : s === 'medium'
                              ? 'border-warning bg-warning/10 text-warning'
                              : 'border-border bg-muted text-muted-foreground'
                          : 'border-border bg-surface text-muted-foreground hover:border-primary/50')
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="One-line summary"
                  required
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Description</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  required
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-base sm:text-sm"
                  placeholder="What happened? Who was involved? When and where? Be as specific as you can."
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary"
                />
                Submit anonymously (HR won't know who submitted; can't follow up with you)
              </label>
              <div>
                <Button type="submit" loading={submit.isPending}>
                  Submit grievance
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>My grievances</CardTitle>
            {isLoading ? (
              <CardDescription>Loading…</CardDescription>
            ) : data.length === 0 ? (
              <CardDescription>You haven't raised any grievances.</CardDescription>
            ) : (
              <ul className="divide-y divide-border">
                {data.map((g) => (
                  <li key={g.id} className="py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{g.subject}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(g.created_at), 'd MMM yyyy')}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-muted px-2 py-0.5 capitalize text-muted-foreground">
                        {g.category.replace('_', ' ')}
                      </span>
                      <span className="rounded bg-muted px-2 py-0.5 capitalize text-muted-foreground">
                        {g.severity}
                      </span>
                      <span className={
                        'rounded px-2 py-0.5 font-medium ' +
                        (g.status === 'resolved' ? 'bg-primary/10 text-primary' :
                         g.status === 'dismissed' ? 'bg-muted text-muted-foreground' :
                         g.status === 'under_review' ? 'bg-warning/10 text-warning' :
                         'bg-destructive/10 text-destructive')
                      }>
                        {STATUS_LABEL[g.status]}
                      </span>
                    </div>
                    {g.resolution ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Resolution: {g.resolution}
                      </p>
                    ) : null}
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
