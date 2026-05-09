import { useMemo, useState } from 'react'
import { format, startOfMonth, subMonths } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useMyEmployee } from '@/lib/auth'
import { useEmployeeScore } from '@/lib/score'

export default function MyPerformancePage() {
  const { data: employee } = useMyEmployee()
  const [periodMonth, setPeriodMonth] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )
  const score = useEmployeeScore(employee?.id, periodMonth)

  const months = useMemo(() => {
    const arr: string[] = []
    for (let i = 5; i >= 0; i--) {
      arr.push(format(startOfMonth(subMonths(new Date(), i)), 'yyyy-MM-dd'))
    }
    return arr
  }, [])

  const trend = useQuery<{ period: string; total: number }[]>({
    queryKey: ['my-perf-trend', employee?.id, months.join(',')],
    enabled: !!employee?.id,
    queryFn: async () => {
      const out: { period: string; total: number }[] = []
      for (const m of months) {
        const { data } = await supabase.rpc('employee_score', {
          p_employee: employee!.id,
          p_period_month: m,
        })
        const row = Array.isArray(data) ? data[0] : data
        out.push({
          period: m,
          total: row ? Number((row as { total_score: number }).total_score) : 0,
        })
      }
      return out
    },
  })

  const v = score.data?.total_score ?? 0
  const color = v >= 80 ? 'text-primary' : v >= 60 ? 'text-warning' : 'text-destructive'

  return (
    <>
      <PageHeader title="My performance" description="Your composite score per month." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Label className="text-xs">Period</Label>
        <Input
          type="month"
          value={periodMonth.slice(0, 7)}
          onChange={(e) => setPeriodMonth(`${e.target.value}-01`)}
          className="w-40"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
            <CardTitle>Composite</CardTitle>
            <div className={`text-5xl font-bold ${color}`}>{Number(v).toFixed(0)}</div>
            <CardDescription>{periodMonth.slice(0, 7)}</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>Breakdown</CardTitle>
            {score.data ? (
              <div className="flex flex-col gap-2">
                <Bar label="Attendance" weight={score.data.weights.attendance ?? 0} score={score.data.attendance_score} />
                <Bar label="Leaves" weight={score.data.weights.leaves ?? 0} score={score.data.leaves_score} />
                <Bar label="Evaluations" weight={score.data.weights.evaluations ?? 0} score={score.data.evaluations_score} />
                <Bar label="Complaints" weight={score.data.weights.complaints ?? 0} score={score.data.complaints_score} />
                <Bar label="Knowledge" weight={score.data.weights.knowledge ?? 0} score={score.data.knowledge_score} />
              </div>
            ) : (
              <CardDescription>Loading…</CardDescription>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle>6-month trend</CardTitle>
          <Sparkline points={trend.data ?? []} />
        </CardContent>
      </Card>
    </>
  )
}

function Bar({ label, weight, score }: { label: string; weight: number; score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span>{label} <span className="text-muted-foreground">· w{weight}</span></span>
        <span className="font-mono">{Number(pct).toFixed(0)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Sparkline({ points }: { points: { period: string; total: number }[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">Loading…</p>
  const w = 600, h = 80, max = 100
  const stepX = w / Math.max(points.length - 1, 1)
  const path = points.map((p, i) => {
    const x = i * stepX
    const y = h - (p.total / max) * h
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
        <path d={path} stroke="var(--color-primary)" strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <circle key={p.period} cx={i * stepX} cy={h - (p.total / max) * h} r={3} fill="var(--color-primary)" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        {points.map((p) => <span key={p.period}>{p.period.slice(5, 7)}</span>)}
      </div>
    </div>
  )
}
