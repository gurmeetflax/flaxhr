import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Save, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import {
  useCreateEvaluation,
  useEvaluation,
  useEvaluationAnswers,
  useQuestionnaires,
  useQuestions,
  useSubmitEvaluation,
  useUpdateEvaluation,
  useUpsertAnswer,
  type Question,
  type QuestionKind,
} from '@/lib/evaluations'

interface EmployeeOption {
  id: string
  full_name: string
  employee_code: string
  outlet_name: string | null
}

// Combined route handler — `:id` of "new" means start a fresh evaluation.
export default function EvaluationRunPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  if (isNew) return <NewRun />
  return <ExistingRun id={id!} />
}

function NewRun() {
  const navigate = useNavigate()
  const create = useCreateEvaluation()
  const { data: questionnaires = [] } = useQuestionnaires({ activeOnly: true })

  const employeesQ = useQuery<EmployeeOption[]>({
    queryKey: ['eval-new-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, full_name, employee_code, outlet_name')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return (data as unknown as EmployeeOption[]) ?? []
    },
  })

  const [questionnaireId, setQuestionnaireId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [evaluatedAt, setEvaluatedAt] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!questionnaireId) return toast.error('Pick a questionnaire')
    if (!employeeId) return toast.error('Pick an employee')
    try {
      const newId = await create.mutateAsync({
        questionnaire_id: questionnaireId,
        employee_id: employeeId,
        evaluated_at: evaluatedAt,
        notes: notes.trim() || undefined,
      })
      toast.success('Evaluation created')
      if (newId) navigate(`/admin/evaluations/runs/${newId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create')
    }
  }

  return (
    <>
      <PageHeader
        title="New evaluation"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/evaluations')}>
            Back
          </Button>
        }
      />
      <Card>
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Questionnaire</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
                value={questionnaireId}
                onChange={(e) => setQuestionnaireId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {questionnaires.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} ({q.question_count} q · max {q.max_score})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Employee</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {(employeesQ.data ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} · {emp.employee_code}
                    {emp.outlet_name ? ` · ${emp.outlet_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Evaluated on</Label>
              <Input
                type="date"
                value={evaluatedAt}
                onChange={(e) => setEvaluatedAt(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notes (optional)</Label>
              <textarea
                className="min-h-[60px] w-full rounded-lg border border-border bg-surface p-3 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <Button type="submit" loading={create.isPending}>
                Start evaluation
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/admin/evaluations')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}

function ExistingRun({ id }: { id: string }) {
  const navigate = useNavigate()
  const evalQ = useEvaluation(id)
  const questionsQ = useQuestions(evalQ.data?.questionnaire_id)
  const answersQ = useEvaluationAnswers(id)
  const upsert = useUpsertAnswer()
  const submit = useSubmitEvaluation()
  const update = useUpdateEvaluation()

  const [notes, setNotes] = useState('')
  useEffect(() => {
    if (evalQ.data) setNotes(evalQ.data.notes ?? '')
  }, [evalQ.data])

  // Local draft of answers indexed by question_id — keeps UI snappy while
  // upserts run in the background.
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  useEffect(() => {
    const map: Record<string, unknown> = {}
    for (const a of answersQ.data ?? []) {
      map[a.question_id] = a.answer
    }
    setDraft(map)
  }, [answersQ.data])

  const ev = evalQ.data
  const questions = useMemo(
    () => (questionsQ.data ?? []).slice().sort((a, b) => a.position - b.position),
    [questionsQ.data],
  )
  const isLocked = ev?.status === 'submitted'

  async function saveAnswer(questionId: string, value: unknown) {
    setDraft((d) => ({ ...d, [questionId]: value }))
    try {
      await upsert.mutateAsync({ evaluation_id: id, question_id: questionId, answer: value })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save answer')
    }
  }

  async function saveNotes() {
    try {
      await update.mutateAsync({ id, notes })
      toast.success('Notes saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save notes')
    }
  }

  async function onSubmit() {
    if (!confirm('Submit this evaluation? It will be locked from further edits.')) return
    try {
      const result = await submit.mutateAsync(id)
      toast.success(
        result.score_pct != null
          ? `Submitted · ${result.total_score}/${result.max_score} (${result.score_pct}%)`
          : 'Submitted',
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit failed'
      if (msg.includes('MISSING_REQUIRED_ANSWER')) {
        toast.error('Some required questions are unanswered.')
      } else {
        toast.error(msg)
      }
    }
  }

  if (evalQ.isLoading || !ev) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    )
  }

  return (
    <>
      <PageHeader
        title={ev.questionnaire_title}
        description={
          <>
            <span className="font-medium">{ev.employee_name}</span>{' '}
            <span className="font-mono text-xs">({ev.employee_code})</span>
            {ev.outlet_name ? ` · ${ev.outlet_name}` : ''}
            {' · '}
            {ev.evaluated_at}
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/evaluations')}
          >
            Back
          </Button>
        }
      />

      {isLocked ? (
        <Card className="mb-4">
          <CardContent className="flex items-center justify-between gap-3 p-6">
            <div>
              <CardTitle>Submitted</CardTitle>
              <CardDescription>
                {ev.submitted_at ? `Locked at ${format(new Date(ev.submitted_at), 'PPp')}` : 'Locked'}
              </CardDescription>
            </div>
            {ev.score_pct != null ? (
              <div className="text-right">
                <div className="text-3xl font-semibold">{ev.score_pct}%</div>
                <div className="text-xs text-muted-foreground">
                  {ev.total_score} / {ev.max_score} pts
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          {questions.map((q, i) => (
            <QuestionField
              key={q.id}
              q={q}
              index={i + 1}
              value={draft[q.id]}
              onChange={(v) => saveAnswer(q.id, v)}
              disabled={isLocked}
              earnedScore={
                isLocked
                  ? answersQ.data?.find((a) => a.question_id === q.id)?.earned_score ?? null
                  : null
              }
            />
          ))}

          <div className="space-y-2 border-t border-border pt-4">
            <Label>Notes</Label>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-border bg-surface p-3 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLocked}
            />
            {!isLocked ? (
              <Button variant="secondary" size="sm" onClick={saveNotes} loading={update.isPending}>
                <Save className="h-4 w-4" /> Save notes
              </Button>
            ) : null}
          </div>

          {!isLocked ? (
            <div className="flex items-center gap-2 border-t border-border pt-4">
              <Button onClick={onSubmit} loading={submit.isPending}>
                <Send className="h-4 w-4" /> Submit evaluation
              </Button>
              <span className="text-xs text-muted-foreground">
                Auto-saves answers as you go. Submit locks the evaluation and
                computes the score.
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  )
}

function QuestionField({
  q,
  index,
  value,
  onChange,
  disabled,
  earnedScore,
}: {
  q: Question
  index: number
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
  earnedScore: number | null
}) {
  const headLine = (
    <div className="flex items-baseline justify-between gap-2">
      <div className="text-sm font-medium">
        {index}. {q.text}
        {q.required ? <span className="text-destructive"> *</span> : null}
      </div>
      <div className="text-xs text-muted-foreground">
        {earnedScore != null
          ? `${earnedScore} / ${q.weight} pts`
          : q.weight
            ? `${q.weight} pts`
            : null}
      </div>
    </div>
  )

  return (
    <div className="space-y-2">
      {headLine}
      <KindInput kind={q.kind} q={q} value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function KindInput({
  kind,
  q,
  value,
  onChange,
  disabled,
}: {
  kind: QuestionKind
  q: Question
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
}) {
  if (kind === 'rating') {
    const scale = q.options.scale ?? 5
    const current = typeof value === 'number' ? value : value ? Number(value) : null
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={
              'h-9 w-9 rounded-lg border text-sm font-medium transition-colors ' +
              (current === n
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface hover:bg-muted') +
              ' disabled:opacity-60'
            }
          >
            {n}
          </button>
        ))}
      </div>
    )
  }
  if (kind === 'yes_no') {
    const v = typeof value === 'boolean' ? value : null
    return (
      <div className="flex gap-2">
        <ChoiceButton selected={v === true} disabled={disabled} onClick={() => onChange(true)}>
          Yes
        </ChoiceButton>
        <ChoiceButton selected={v === false} disabled={disabled} onClick={() => onChange(false)}>
          No
        </ChoiceButton>
      </div>
    )
  }
  if (kind === 'short_text') {
    return (
      <Input
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    )
  }
  if (kind === 'long_text') {
    return (
      <textarea
        className="min-h-[80px] w-full rounded-lg border border-border bg-surface p-3 text-sm disabled:opacity-60"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    )
  }
  if (kind === 'single_choice') {
    return (
      <div className="flex flex-wrap gap-2">
        {(q.options.choices ?? []).map((opt) => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
    )
  }
  if (kind === 'multi_choice') {
    const arr = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="flex flex-wrap gap-2">
        {(q.options.choices ?? []).map((opt) => {
          const selected = arr.includes(opt.value)
          return (
            <ChoiceButton
              key={opt.value}
              selected={selected}
              disabled={disabled}
              onClick={() =>
                onChange(
                  selected ? arr.filter((v) => v !== opt.value) : [...arr, opt.value],
                )
              }
            >
              {opt.label}
            </ChoiceButton>
          )
        })}
      </div>
    )
  }
  return null
}

function ChoiceButton({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        'rounded-lg border px-3 py-1.5 text-sm transition-colors ' +
        (selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-surface hover:bg-muted') +
        ' disabled:opacity-60'
      }
    >
      {children}
    </button>
  )
}
