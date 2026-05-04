import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, FileText, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useQuestionnaires, useEvaluations } from '@/lib/evaluations'

type Tab = 'questionnaires' | 'runs'

export default function EvaluationsPage() {
  const [tab, setTab] = useState<Tab>('runs')
  return (
    <>
      <PageHeader
        title="Evaluations"
        description="Build questionnaires and run them per employee. Submitted runs feed the auditor app."
        actions={
          <div className="flex gap-2">
            {tab === 'runs' ? (
              <Link to="/admin/evaluations/runs/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> New evaluation
                </Button>
              </Link>
            ) : (
              <Link to="/admin/evaluations/questionnaires/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> New questionnaire
                </Button>
              </Link>
            )}
          </div>
        }
      />
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
        <TabButton active={tab === 'runs'} onClick={() => setTab('runs')}>
          <ClipboardList className="h-4 w-4" /> Runs
        </TabButton>
        <TabButton
          active={tab === 'questionnaires'}
          onClick={() => setTab('questionnaires')}
        >
          <FileText className="h-4 w-4" /> Questionnaires
        </TabButton>
      </div>
      {tab === 'runs' ? <RunsList /> : <QuestionnairesList />}
    </>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 transition-colors ' +
        (active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-muted')
      }
    >
      {children}
    </button>
  )
}

function QuestionnairesList() {
  const { data: questionnaires = [], isLoading } = useQuestionnaires()
  if (isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
  if (questionnaires.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <CardTitle>No questionnaires yet</CardTitle>
          <CardDescription className="mt-1">
            Create one to start running evaluations.
          </CardDescription>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {questionnaires.map((q) => (
            <li key={q.id}>
              <Link
                to={`/admin/evaluations/questionnaires/${q.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30"
              >
                <div className="flex-1">
                  <div className="font-medium">{q.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {q.question_count} {q.question_count === 1 ? 'question' : 'questions'} · max {q.max_score} pts ·{' '}
                    <span className="font-mono">{q.code}</span>
                  </div>
                </div>
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (q.is_active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground')
                  }
                >
                  {q.is_active ? 'Active' : 'Inactive'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RunsList() {
  const { data: evaluations = [], isLoading } = useEvaluations()
  if (isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
  if (evaluations.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <CardTitle>No evaluations yet</CardTitle>
          <CardDescription className="mt-1">
            Create a new evaluation against any employee.
          </CardDescription>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Questionnaire</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Score</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {evaluations.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs">{e.evaluated_at}</td>
                  <td className="px-4 py-2 font-medium">
                    {e.employee_name}
                    <div className="font-mono text-xs text-muted-foreground">
                      {e.employee_code}
                    </div>
                  </td>
                  <td className="px-4 py-2">{e.questionnaire_title}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs font-medium capitalize ' +
                        (e.status === 'submitted'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-amber-500/10 text-amber-600')
                      }
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {e.status === 'submitted' && e.score_pct != null
                      ? `${e.score_pct}%`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/admin/evaluations/runs/${e.id}`}>
                      <Button variant="ghost" size="sm">
                        Open
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
