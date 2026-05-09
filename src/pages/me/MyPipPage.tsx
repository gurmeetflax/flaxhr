import { TrendingDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { useMyPip } from '@/lib/pip'

export default function MyPipPage() {
  const { data: pip, isLoading } = useMyPip()

  return (
    <>
      <PageHeader title="Performance plan" />
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          {isLoading ? (
            <CardDescription>Loading…</CardDescription>
          ) : !pip ? (
            <div className="text-sm text-muted-foreground">
              You don't have an active Performance Improvement Plan.
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-warning/10 text-warning">
                  <TrendingDown className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle>Open PIP</CardTitle>
                  <CardDescription className="mt-1">
                    Started {pip.started_on} · target {pip.target_date}
                  </CardDescription>
                </div>
              </div>
              <p className="text-sm">
                Triggered when consecutive evaluations scored below{' '}
                <span className="font-mono">
                  {pip.threshold_pct_at_trigger != null
                    ? `${Number(pip.threshold_pct_at_trigger).toFixed(0)}%`
                    : '—'}
                </span>
                . Most recent score:{' '}
                <span className="font-mono">
                  {pip.score_pct_at_trigger != null
                    ? `${Number(pip.score_pct_at_trigger).toFixed(0)}%`
                    : '—'}
                </span>
                .
              </p>
              {pip.notes ? (
                <p className="rounded border border-border bg-muted/30 p-3 text-sm">
                  {pip.notes}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Talk to your manager and HR. Improvement is measured on the next evaluation.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
