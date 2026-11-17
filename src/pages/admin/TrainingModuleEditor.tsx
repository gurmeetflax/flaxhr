import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import LessonView from '@/components/training/LessonView'
import {
  KIND_LABEL,
  LESSON_KIND_LABEL,
  useAdminModule,
  useSaveModule,
  type AdminQuestion,
  type Lesson,
  type LessonKind,
  type ModuleDoc,
  type ModuleKind,
} from '@/lib/training'

const EMPTY: ModuleDoc = {
  title: '',
  summary: '',
  kind: 'recipe',
  est_minutes: 10,
  pass_mark: 80,
  is_active: true,
  lessons: [],
  questions: [],
}

const textarea = 'min-h-[80px] rounded-lg border border-border bg-surface p-3 text-sm'
const select = 'h-10 rounded-lg border border-border bg-surface px-3 text-sm'

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const n = [...list]
  ;[n[i], n[j]] = [n[j], n[i]]
  return n
}

export default function TrainingModuleEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const q = useAdminModule(isNew ? undefined : id)
  const save = useSaveModule()
  const nav = useNavigate()
  const [doc, setDoc] = useState<ModuleDoc>(EMPTY)

  useEffect(() => {
    if (q.data) setDoc({ ...EMPTY, ...q.data })
  }, [q.data])

  const set = (patch: Partial<ModuleDoc>) => setDoc((d) => ({ ...d, ...patch }))
  const setLesson = (i: number, l: Lesson) => set({ lessons: doc.lessons.map((x, k) => (k === i ? l : x)) })
  const setQuestion = (i: number, qq: AdminQuestion) =>
    set({ questions: doc.questions.map((x, k) => (k === i ? qq : x)) })

  const onSave = async () => {
    if (!doc.title.trim()) return toast.error('Give the module a title')
    const bad = doc.questions.findIndex(
      (x) => !x.prompt.trim() || x.options.filter((o) => o.trim()).length < 2 || !x.correct.length,
    )
    if (bad >= 0) return toast.error(`Question ${bad + 1} needs a prompt, 2+ options and a right answer`)
    try {
      const newId = await save.mutateAsync(doc)
      toast.success('Saved')
      if (isNew) nav(`/admin/training/modules/${newId}`, { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  if (!isNew && q.isLoading) return <CardDescription>Loading…</CardDescription>

  return (
    <>
      <PageHeader
        title={isNew ? 'New training module' : 'Edit module'}
        description={
          <Link to="/admin/training" className="inline-flex items-center gap-1 underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Training
          </Link>
        }
        actions={
          <div className="flex gap-2">
            {!isNew ? (
              <Link to={`/me/training/${id}`}>
                <Button size="sm" variant="outline">
                  <Eye className="h-4 w-4" /> Preview
                </Button>
              </Link>
            ) : null}
            <Button size="sm" onClick={onSave} loading={save.isPending}>
              Save
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Title
              <Input value={doc.title} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Summary (shown on the training list)
              <Input value={doc.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Type
              <select
                className={select}
                value={doc.kind}
                onChange={(e) => set({ kind: e.target.value as ModuleKind })}
              >
                {(Object.keys(KIND_LABEL) as ModuleKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Minutes
                <Input
                  type="number"
                  min={1}
                  value={doc.est_minutes}
                  onChange={(e) => set({ est_minutes: Number(e.target.value) || 10 })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Pass mark %
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={doc.pass_mark}
                  onChange={(e) =>
                    set({ pass_mark: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })
                  }
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Recipe card key in Command{' '}
              <span className="text-xs text-muted-foreground">(e.g. mexican-bowl)</span>
              <Input
                value={doc.recipe_card_key ?? ''}
                onChange={(e) => set({ recipe_card_key: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Link to the card or SOP in Command
              <Input
                placeholder="https://command.flaxfoods.in/…"
                value={doc.source_url ?? ''}
                onChange={(e) => set({ source_url: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={doc.is_active}
                onChange={(e) => set({ is_active: e.target.checked })}
              />
              Active (untick to archive: it disappears for staff, scores are kept)
            </label>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Lessons ({doc.lessons.length})</CardTitle>
          <AddLesson onAdd={(k) => set({ lessons: [...doc.lessons, newLesson(k)] })} />
        </div>
        {doc.lessons.map((l, i) => (
          <LessonEditor
            key={l.id ?? `n${i}`}
            n={i + 1}
            lesson={l}
            onChange={(x) => setLesson(i, x)}
            onUp={() => set({ lessons: move(doc.lessons, i, -1) })}
            onDown={() => set({ lessons: move(doc.lessons, i, 1) })}
            onDelete={() => set({ lessons: doc.lessons.filter((_, k) => k !== i) })}
          />
        ))}

        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Quiz ({doc.questions.length} questions)</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                questions: [...doc.questions, { prompt: '', kind: 'single', options: ['', ''], correct: [] }],
              })
            }
          >
            <Plus className="h-4 w-4" /> Question
          </Button>
        </div>
        {doc.questions.map((qq, i) => (
          <QuestionEditor
            key={qq.id ?? `q${i}`}
            n={i + 1}
            q={qq}
            onChange={(x) => setQuestion(i, x)}
            onUp={() => set({ questions: move(doc.questions, i, -1) })}
            onDown={() => set({ questions: move(doc.questions, i, 1) })}
            onDelete={() => set({ questions: doc.questions.filter((_, k) => k !== i) })}
          />
        ))}

        <div className="flex justify-end">
          <Button onClick={onSave} loading={save.isPending}>
            Save module
          </Button>
        </div>
      </div>
    </>
  )
}

function newLesson(kind: LessonKind): Lesson {
  if (kind === 'slide') return { kind, data: { eyebrow: '', headline: '', body: '' } }
  if (kind === 'steps') return { kind, title: '', body: '', data: { steps: [{ title: '', body: '' }] } }
  if (kind === 'recipe')
    return {
      kind,
      title: '',
      body: '',
      data: { ingredients: [{ name: '', qty_s: '', qty_l: '' }], plating: '' },
    }
  return { kind, title: '', body: '', data: {} }
}

function AddLesson({ onAdd }: { onAdd: (k: LessonKind) => void }) {
  const [k, setK] = useState<LessonKind>('text')
  return (
    <div className="flex gap-2">
      <select
        className={`${select} h-8 text-xs`}
        value={k}
        onChange={(e) => setK(e.target.value as LessonKind)}
      >
        {(Object.keys(LESSON_KIND_LABEL) as LessonKind[]).map((x) => (
          <option key={x} value={x}>
            {LESSON_KIND_LABEL[x]}
          </option>
        ))}
      </select>
      <Button size="sm" variant="outline" onClick={() => onAdd(k)}>
        <Plus className="h-4 w-4" /> Lesson
      </Button>
    </div>
  )
}

function RowTools({
  onUp,
  onDown,
  onDelete,
}: {
  onUp: () => void
  onDown: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={onUp} aria-label="Move up">
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onDown} aria-label="Move down">
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function LessonEditor({
  n,
  lesson,
  onChange,
  onUp,
  onDown,
  onDelete,
}: {
  n: number
  lesson: Lesson
  onChange: (l: Lesson) => void
  onUp: () => void
  onDown: () => void
  onDelete: () => void
}) {
  const [preview, setPreview] = useState(false)
  const d = lesson.data
  const setData = (patch: Partial<Lesson['data']>) => onChange({ ...lesson, data: { ...d, ...patch } })
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {n}. {LESSON_KIND_LABEL[lesson.kind]}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
              {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <RowTools onUp={onUp} onDown={onDown} onDelete={onDelete} />
          </div>
        </div>

        {preview ? (
          <LessonView lesson={lesson} />
        ) : lesson.kind === 'slide' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Label (e.g. WELCOME)
              <Input value={d.eyebrow ?? ''} onChange={(e) => setData({ eyebrow: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Heading
              <Input value={d.headline ?? ''} onChange={(e) => setData({ headline: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Text (blank line = new paragraph)
              <textarea
                className={textarea}
                value={d.body ?? ''}
                onChange={(e) => setData({ body: e.target.value })}
              />
            </label>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Title
              <Input
                value={lesson.title ?? ''}
                onChange={(e) => onChange({ ...lesson, title: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Text (blank line = new paragraph)
              <textarea
                className={textarea}
                value={lesson.body ?? ''}
                onChange={(e) => onChange({ ...lesson, body: e.target.value })}
              />
            </label>
            {['video', 'image', 'pdf', 'recipe'].includes(lesson.kind) ? (
              <label className="flex flex-col gap-1 text-sm">
                {lesson.kind === 'video'
                  ? 'Video link (YouTube or a video file)'
                  : lesson.kind === 'pdf'
                    ? 'PDF link'
                    : 'Photo link'}
                <Input
                  placeholder="https://…"
                  value={lesson.media_url ?? ''}
                  onChange={(e) => onChange({ ...lesson, media_url: e.target.value })}
                />
              </label>
            ) : null}
            {lesson.kind === 'steps' ? (
              <div className="flex flex-col gap-2">
                {(d.steps ?? []).map((s, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <Input
                      placeholder={`Step ${i + 1} title`}
                      value={s.title}
                      onChange={(e) =>
                        setData({
                          steps: d.steps!.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)),
                        })
                      }
                    />
                    <Input
                      placeholder="Target (e.g. 1 to 5 °C)"
                      value={s.target ?? ''}
                      onChange={(e) =>
                        setData({
                          steps: d.steps!.map((x, k) => (k === i ? { ...x, target: e.target.value } : x)),
                        })
                      }
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={!!s.ccp}
                          onChange={(e) =>
                            setData({
                              steps: d.steps!.map((x, k) => (k === i ? { ...x, ccp: e.target.checked } : x)),
                            })
                          }
                        />
                        Critical
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setData({ steps: d.steps!.filter((_, k) => k !== i) })}
                        aria-label="Remove step"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <textarea
                      className={`${textarea} min-h-[56px] sm:col-span-3`}
                      placeholder="What to do"
                      value={s.body ?? ''}
                      onChange={(e) =>
                        setData({
                          steps: d.steps!.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)),
                        })
                      }
                    />
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setData({ steps: [...(d.steps ?? []), { title: '', body: '' }] })}
                >
                  <Plus className="h-4 w-4" /> Step
                </Button>
              </div>
            ) : null}
            {lesson.kind === 'recipe' ? (
              <div className="flex flex-col gap-2">
                <div className="text-xs text-muted-foreground">
                  Ingredients: name, small portion, large portion
                </div>
                {(d.ingredients ?? []).map((g, i) => (
                  <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
                    <Input
                      placeholder="Ingredient"
                      value={g.name}
                      onChange={(e) =>
                        setData({
                          ingredients: d.ingredients!.map((x, k) =>
                            k === i ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Input
                      placeholder="Small"
                      value={g.qty_s ?? ''}
                      onChange={(e) =>
                        setData({
                          ingredients: d.ingredients!.map((x, k) =>
                            k === i ? { ...x, qty_s: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Input
                      placeholder="Large"
                      value={g.qty_l ?? ''}
                      onChange={(e) =>
                        setData({
                          ingredients: d.ingredients!.map((x, k) =>
                            k === i ? { ...x, qty_l: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setData({ ingredients: d.ingredients!.filter((_, k) => k !== i) })}
                      aria-label="Remove ingredient"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setData({ ingredients: [...(d.ingredients ?? []), { name: '', qty_s: '', qty_l: '' }] })
                  }
                >
                  <Plus className="h-4 w-4" /> Ingredient
                </Button>
                <label className="flex flex-col gap-1 text-sm">
                  Plating notes
                  <textarea
                    className={textarea}
                    value={d.plating ?? ''}
                    onChange={(e) => setData({ plating: e.target.value })}
                  />
                </label>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function QuestionEditor({
  n,
  q,
  onChange,
  onUp,
  onDown,
  onDelete,
}: {
  n: number
  q: AdminQuestion
  onChange: (q: AdminQuestion) => void
  onUp: () => void
  onDown: () => void
  onDelete: () => void
}) {
  const multi = q.kind === 'multi'
  const toggle = (i: number) =>
    onChange({
      ...q,
      correct: multi ? (q.correct.includes(i) ? q.correct.filter((x) => x !== i) : [...q.correct, i]) : [i],
    })
  const removeOption = (i: number) =>
    onChange({
      ...q,
      options: q.options.filter((_, k) => k !== i),
      correct: q.correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)),
    })
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Question {n}</div>
          <RowTools onUp={onUp} onDown={onDown} onDelete={onDelete} />
        </div>
        <Input
          placeholder="Question"
          value={q.prompt}
          onChange={(e) => onChange({ ...q, prompt: e.target.value })}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={multi}
            onChange={(e) =>
              onChange({
                ...q,
                kind: e.target.checked ? 'multi' : 'single',
                correct: q.correct.slice(0, e.target.checked ? undefined : 1),
              })
            }
          />
          More than one right answer
        </label>
        <div className="flex flex-col gap-2">
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={`q${n}`}
                checked={q.correct.includes(i)}
                onChange={() => toggle(i)}
                aria-label="Right answer"
              />
              <Input
                placeholder={`Option ${i + 1}`}
                value={o}
                onChange={(e) =>
                  onChange({ ...q, options: q.options.map((x, k) => (k === i ? e.target.value : x)) })
                }
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeOption(i)}
                disabled={q.options.length <= 2}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Tick the right answer{multi ? 's' : ''}.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onChange({ ...q, options: [...q.options, ''] })}
            >
              <Plus className="h-4 w-4" /> Option
            </Button>
          </div>
        </div>
        <Input
          placeholder="Explanation shown after passing (optional)"
          value={q.explanation ?? ''}
          onChange={(e) => onChange({ ...q, explanation: e.target.value })}
        />
      </CardContent>
    </Card>
  )
}
