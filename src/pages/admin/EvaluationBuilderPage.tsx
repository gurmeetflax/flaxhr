import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { GripVertical, Plus, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import {
  QUESTION_KIND_LABEL,
  useDeleteQuestion,
  useDeleteQuestionnaire,
  useQuestionnaire,
  useQuestions,
  useUpsertQuestion,
  useUpsertQuestionnaire,
  type Question,
  type QuestionKind,
  type QuestionOptions,
  type ChoiceOption,
} from '@/lib/evaluations'

export default function EvaluationBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const questionnaireQ = useQuestionnaire(isNew ? undefined : id)
  const questionsQ = useQuestions(isNew ? undefined : id)
  const upsertQuestionnaire = useUpsertQuestionnaire()
  const deleteQuestionnaire = useDeleteQuestionnaire()

  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (questionnaireQ.data) {
      setCode(questionnaireQ.data.code)
      setTitle(questionnaireQ.data.title)
      setDescription(questionnaireQ.data.description ?? '')
      setIsActive(questionnaireQ.data.is_active)
    }
  }, [questionnaireQ.data])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    const cleanCode = code.trim().toLowerCase()
    if (!/^[a-z0-9_-]+$/.test(cleanCode)) {
      setErr('Code can only contain lowercase letters, digits, _ and -.')
      return
    }
    if (!title.trim()) {
      setErr('Title is required.')
      return
    }
    try {
      const newId = await upsertQuestionnaire.mutateAsync({
        ...(isNew ? {} : { id }),
        code: cleanCode,
        title: title.trim(),
        description: description.trim() || null,
        is_active: isActive,
      })
      toast.success(isNew ? 'Questionnaire created' : 'Saved')
      if (isNew && newId) {
        navigate(`/admin/evaluations/questionnaires/${newId}`, { replace: true })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save'
      setErr(msg)
      toast.error(msg)
    }
  }

  async function onDelete() {
    if (!id || isNew) return
    if (!confirm('Delete this questionnaire and all its questions? Already-submitted evaluations using it remain intact.')) return
    try {
      await deleteQuestionnaire.mutateAsync(id)
      toast.success('Deleted')
      navigate('/admin/evaluations')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <>
      <PageHeader
        title={isNew ? 'New questionnaire' : (questionnaireQ.data?.title ?? 'Questionnaire')}
        description={
          questionnaireQ.data
            ? `${questionnaireQ.data.question_count} questions · max ${questionnaireQ.data.max_score} pts`
            : undefined
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/evaluations')}>
            Back
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-6">
          <form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="quarterly-review"
                disabled={!isNew}
              />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Quarterly review"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <textarea
                className="min-h-[60px] w-full rounded-lg border border-border bg-surface p-3 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about how/when to use this form"
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary"
              />
              Active (shown when starting a new evaluation)
            </label>
            {err ? <p className="sm:col-span-2 text-sm text-destructive">{err}</p> : null}
            <div className="sm:col-span-2 flex items-center justify-between gap-2">
              <Button type="submit" loading={upsertQuestionnaire.isPending}>
                <Save className="h-4 w-4" /> {isNew ? 'Create' : 'Save'}
              </Button>
              {!isNew ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {!isNew ? (
        <QuestionsBuilder
          questionnaireId={id!}
          questions={questionsQ.data ?? []}
        />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Save the questionnaire above to start adding questions.
          </CardContent>
        </Card>
      )}
    </>
  )
}

// ===========================================================================
// Questions builder
// ===========================================================================

function QuestionsBuilder({
  questionnaireId,
  questions,
}: {
  questionnaireId: string
  questions: Question[]
}) {
  const upsert = useUpsertQuestion()
  const remove = useDeleteQuestion()
  const [editing, setEditing] = useState<Question | 'new' | null>(null)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Questions</CardTitle>
            <CardDescription>
              Each question has a weight (points). Submitted evaluations score
              automatically: rating gives partial credit, yes/no &amp; choice
              award full weight when matching the correct answer, free text is
              informational (0 weight).
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add question
          </Button>
        </div>

        {questions.length === 0 ? (
          <CardDescription>No questions yet.</CardDescription>
        ) : (
          <ul className="flex flex-col gap-2">
            {questions.map((q, i) => (
              <li
                key={q.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3"
              >
                <GripVertical className="mt-1 h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">
                    {i + 1}. {q.text}
                    {q.required ? <span className="text-destructive"> *</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {QUESTION_KIND_LABEL[q.kind]}
                    </span>
                    <span>weight {q.weight}</span>
                    <KindSummary q={q} />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(q)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={async () => {
                    if (!confirm(`Delete "${q.text}"?`)) return
                    try {
                      await remove.mutateAsync({ id: q.id, questionnaire_id: questionnaireId })
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Delete failed')
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {editing ? (
          <QuestionForm
            initial={editing === 'new' ? null : editing}
            questionnaireId={questionnaireId}
            nextPosition={Math.max(0, ...questions.map((q) => q.position)) + 10}
            onCancel={() => setEditing(null)}
            onSave={async (q) => {
              try {
                await upsert.mutateAsync(q)
                toast.success('Question saved')
                setEditing(null)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Could not save')
              }
            }}
            saving={upsert.isPending}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function KindSummary({ q }: { q: Question }) {
  if (q.kind === 'rating') return <span>scale 1–{q.options.scale ?? 5}</span>
  if (q.kind === 'yes_no')
    return (
      <span>
        correct: {q.correct_answer === true || q.correct_answer === 'true' ? 'Yes' : q.correct_answer === false || q.correct_answer === 'false' ? 'No' : '—'}
      </span>
    )
  if (q.kind === 'single_choice' || q.kind === 'multi_choice')
    return <span>{q.options.choices?.length ?? 0} options</span>
  return null
}

function QuestionForm({
  initial,
  questionnaireId,
  nextPosition,
  onCancel,
  onSave,
  saving,
}: {
  initial: Question | null
  questionnaireId: string
  nextPosition: number
  onCancel: () => void
  onSave: (q: Partial<Question> & { questionnaire_id: string; text: string; kind: QuestionKind }) => void
  saving: boolean
}) {
  const [text, setText] = useState(initial?.text ?? '')
  const [kind, setKind] = useState<QuestionKind>(initial?.kind ?? 'rating')
  const [weight, setWeight] = useState(String(initial?.weight ?? 1))
  const [required, setRequired] = useState(initial?.required ?? false)
  const [options, setOptions] = useState<QuestionOptions>(initial?.options ?? {})
  const [correct, setCorrect] = useState<unknown>(initial?.correct_answer ?? null)

  function handleSave() {
    if (!text.trim()) {
      toast.error('Question text is required')
      return
    }
    const w = Number(weight)
    if (Number.isNaN(w) || w < 0) {
      toast.error('Weight must be 0 or more')
      return
    }
    onSave({
      ...(initial?.id ? { id: initial.id } : {}),
      questionnaire_id: questionnaireId,
      text: text.trim(),
      kind,
      options,
      correct_answer: correct,
      required,
      weight: w,
      position: initial?.position ?? nextPosition,
    })
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_120px_auto]">
        <div className="space-y-1">
          <Label className="text-xs">Question text</Label>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Did the employee follow the opening checklist?"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as QuestionKind
              setKind(next)
              setOptions({})
              setCorrect(null)
            }}
            className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
          >
            {Object.entries(QUESTION_KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Weight</Label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary"
          />
          Required
        </label>
      </div>

      {/* Kind-specific config */}
      <div className="mt-3">
        {kind === 'rating' ? (
          <div className="flex items-center gap-2 text-sm">
            <Label>Scale 1 –</Label>
            <Input
              type="number"
              min={2}
              max={10}
              className="w-20"
              value={String(options.scale ?? 5)}
              onChange={(e) =>
                setOptions((o) => ({ ...o, scale: Number(e.target.value) || 5 }))
              }
            />
          </div>
        ) : null}

        {kind === 'yes_no' ? (
          <div className="flex items-center gap-3 text-sm">
            <span>Correct answer for full weight:</span>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={correct === true}
                onChange={() => setCorrect(true)}
              />
              Yes
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={correct === false}
                onChange={() => setCorrect(false)}
              />
              No
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={correct == null}
                onChange={() => setCorrect(null)}
              />
              Either (informational)
            </label>
          </div>
        ) : null}

        {kind === 'single_choice' || kind === 'multi_choice' ? (
          <ChoiceEditor
            options={options.choices ?? []}
            onChange={(choices) => setOptions((o) => ({ ...o, choices }))}
            correct={correct}
            setCorrect={setCorrect}
            multi={kind === 'multi_choice'}
          />
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={handleSave} loading={saving}>
          Save question
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ChoiceEditor({
  options,
  onChange,
  correct,
  setCorrect,
  multi,
}: {
  options: ChoiceOption[]
  onChange: (next: ChoiceOption[]) => void
  correct: unknown
  setCorrect: (next: unknown) => void
  multi: boolean
}) {
  const [draftLabel, setDraftLabel] = useState('')

  function add() {
    const label = draftLabel.trim()
    if (!label) return
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (options.find((o) => o.value === value)) {
      toast.error('Duplicate option')
      return
    }
    onChange([...options, { value, label }])
    setDraftLabel('')
  }
  function remove(value: string) {
    onChange(options.filter((o) => o.value !== value))
    // also drop from correct
    if (multi && Array.isArray(correct)) {
      setCorrect((correct as string[]).filter((v) => v !== value))
    } else if (correct === value) {
      setCorrect(null)
    }
  }
  function toggleCorrect(value: string) {
    if (multi) {
      const arr = Array.isArray(correct) ? (correct as string[]) : []
      setCorrect(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value])
    } else {
      setCorrect(correct === value ? null : value)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Option label"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">No options yet. Add at least two.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {options.map((o) => {
            const isCorrect = multi
              ? Array.isArray(correct) && (correct as string[]).includes(o.value)
              : correct === o.value
            return (
              <li
                key={o.value}
                className="flex items-center gap-2 rounded border border-border bg-muted/30 px-2 py-1"
              >
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  checked={!!isCorrect}
                  onChange={() => toggleCorrect(o.value)}
                />
                <span className="flex-1">{o.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{o.value}</span>
                <button
                  type="button"
                  onClick={() => remove(o.value)}
                  className="text-destructive"
                  aria-label={`Remove ${o.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {multi
          ? 'Tick options that count as correct. Full weight requires the answer to match exactly.'
          : 'Pick the correct option. Full weight when the answer matches.'}
      </p>
    </div>
  )
}
