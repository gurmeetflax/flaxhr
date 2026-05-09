import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useEmployeeScore, useUpsertKnowledgeScore } from '@/lib/score'

interface Emp {
  id: string
  full_name: string
  employee_code: string
  outlet_name: string | null
}

export default function EmployeeSnapshotPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [periodMonth, setPeriodMonth] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  )

  const empQ = useQuery<Emp | null>({
    queryKey: ['employee-snapshot-meta', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, full_name, employee_code, outlet_name')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return (data as Emp | null) ?? null
    },
  })

  const scoreQ = useEmployeeScore(id, periodMonth)
  const knowledge = useUpsertKnowledgeScore()

  // Sparkline: last 6 months totals
  const months = useMemo(() => {
    const arr: string[] = []
    for (let i = 5; i >= 0; i--) {
      arr.push(format(startOfMonth(subMonths(new Date(), i)), 'yyyy-MM-dd'))
    }
    return arr
  }, [])

  const trendQ = useQuery<{ period: string; total: number }[]>({
    queryKey: ['employee-snapshot-trend', id, months.join(',')],
    enabled: !!id,
    queryFn: async () => {
      const out: { period: string; total: number }[] = []
      for (const m of months) {
        const { data } = await supabase.rpc('employee_score', {
          p_employee: id!,
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

  const [knowledgeInput, setKnowledgeInput] = useState('')

  async function saveKnowledge() {
    const n = Number(knowledgeInput)
    if (Number.isNaN(n) || n < 0 || n > 100) {
      toast.error('Score must be 0–100')
      return
    }
    try {
      await knowledge.mutateAsync({
        employee_id: id!,
        period_month: periodMonth,
        score: n,
      })
      toast.success('Knowledge score saved')
      setKnowledgeInput('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  if (!id) return null

  return (
    <>
      <PageHeader
        title={empQ.data?.full_name ?? 'Snapshot'}
        description={
          empQ.data ? `${empQ.data.employee_code} · ${empQ.data.outlet_name ?? '—'}` : 'Loading…'
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/employees')}>
            Back
          </Button>
        }
      />

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
            <Gauge value={scoreQ.data?.total_score ?? 0} />
            <CardDescription>
              {scoreQ.data
                ? `${scoreQ.data.period_month?.slice(0, 7)}`
                : 'Compute…'}
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <CardTitle>Breakdown</CardTitle>
            {scoreQ.data ? (
              <div className="flex flex-col gap-2">
                <Bar
                  label="Attendance"
                  weight={scoreQ.data.weights.attendance ?? 0}
                  score={scoreQ.data.attendance_score}
                />
                <Bar
                  label="Leaves"
                  weight={scoreQ.data.weights.leaves ?? 0}
                  score={scoreQ.data.leaves_score}
                />
                <Bar
                  label="Evaluations"
                  weight={scoreQ.data.weights.evaluations ?? 0}
                  score={scoreQ.data.evaluations_score}
                />
                <Bar
                  label="Complaints"
                  weight={scoreQ.data.weights.complaints ?? 0}
                  score={scoreQ.data.complaints_score}
                />
                <Bar
                  label="Knowledge"
                  weight={scoreQ.data.weights.knowledge ?? 0}
                  score={scoreQ.data.knowledge_score}
                />
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
          <Sparkline points={trendQ.data ?? []} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 p-6">
          <CardTitle>Set knowledge score</CardTitle>
          <CardDescription>
            HR-graded knowledge for{' '}
            <span className="font-mono">{periodMonth.slice(0, 7)}</span>. 0–100.
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={knowledgeInput}
              onChange={(e) => setKnowledgeInput(e.target.value)}
              placeholder="e.g. 85"
              className="w-32"
            />
            <Button onClick={saveKnowledge} loading={knowledge.isPending}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const color =
    v >= 80
      ? 'text-primary'
      : v >= 60
        ? 'text-warning'
        : 'text-destructive'
  return (
    <div className={`text-5xl font-bold ${color}`}>{Number(v).toFixed(0)}</div>
  )
}

function Bar({ label, weight, score }: { label: string; weight: number; score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span>
          {label} <span className="text-muted-foreground">· w{weight}</span>
        </span>
        <span className="font-mono">{Number(pct).toFixed(0)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Sparkline({ points }: { points: { period: string; total: number }[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">Loading…</p>
  const w = 600
  const h = 80
  const max = 100
  const stepX = w / Math.max(points.length - 1, 1)
  const path = points
    .map((p, i) => {
      const x = i * stepX
      const y = h - (p.total / max) * h
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
        <path d={path} stroke="var(--color-primary)" strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <circle key={p.period} cx={i * stepX} cy={h - (p.total / max) * h} r={3} fill="var(--color-primary)" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        {points.map((p) => (
          <span key={p.period}>{p.period.slice(5, 7)}</span>
        ))}
      </div>
    </div>
  )
}
