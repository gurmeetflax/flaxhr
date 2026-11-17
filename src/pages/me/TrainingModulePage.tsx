import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import LessonView from '@/components/training/LessonView'
import Celebration, { type CelebrationData } from '@/components/training/Celebration'
import {
  useMyProgress,
  usePlayerModule,
  usePracticeGrade,
  useSubmitQuiz,
  useViewLesson,
  type PublicQuestion,
  type SubmitResult,
} from '@/lib/training'

// Lessons one at a time, then the quiz, then the result.
export default function TrainingModulePage() {
  const { id } = useParams()
  const q = usePlayerModule(id)
  const view = useViewLesson()
  const submit = useSubmitQuiz()
  const practice = usePracticeGrade()
  const prog = useMyProgress()
  const [celebrate, setCelebrate] = useState<CelebrationData | null>(null)
  const [step, setStep] = useState(0)
  const [visited, setVisited] = useState<string[]>([])
  const [answers, setAnswers] = useState<Record<string, number[]>>({})
  const [result, setResult] = useState<SubmitResult | null>(null)
  const top = useRef<HTMLDivElement>(null)

  const m = q.data
  const lessons = useMemo(() => m?.lessons ?? [], [m])
  const quizStep = lessons.length
  const hasQuiz = (m?.questions.length ?? 0) > 0
  const preview = !!m && !m.assignment

  // A lesson counts as read once it has been on screen: read on the server
  // before, opened this visit, or showing now.
  const lesson = lessons[step]
  const seen = useMemo(
    () => new Set([...(m?.viewed ?? []), ...visited, ...(lesson ? [lesson.id] : [])]),
    [m, visited, lesson],
  )

  // Record each lesson on the server as it is opened.
  const recorded = useRef(new Set<string>())
  useEffect(() => {
    if (!m?.assignment || !lesson || m.viewed.includes(lesson.id) || recorded.current.has(lesson.id)) return
    recorded.current.add(lesson.id)
    view.mutate({ module: m.id, lesson: lesson.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id, lesson?.id])

  const goTo = (i: number) => {
    if (lesson) setVisited((v) => (v.includes(lesson.id) ? v : [...v, lesson.id]))
    setResult(null)
    setStep(i)
  }

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' })
  }, [step, result])

  if (q.isLoading) return <CardDescription>Loading…</CardDescription>
  if (q.error || !m) {
    return (
      <CardDescription>
        {q.error instanceof Error ? q.error.message : 'Could not load this module.'}
      </CardDescription>
    )
  }

  const allSeen = lessons.every((l) => seen.has(l.id))
  const total = lessons.length + (hasQuiz ? 1 : 0)
  const passedAlready = m.assignment?.status === 'passed'

  const onSubmit = async () => {
    const missing = m.questions.filter((x) => !(answers[x.id]?.length ?? 0))
    if (missing.length) {
      toast.error(`Answer every question first (${missing.length} left).`)
      return
    }
    try {
      if (preview) {
        setResult(await practice.mutateAsync({ module: m.id, answers }))
        return
      }
      const before = prog.data
      const res = await submit.mutateAsync({ module: m.id, answers })
      setResult(res)
      if (res.passed && m.assignment) {
        const after = (await prog.refetch()).data
        if (after) {
          setCelebrate({
            score: res.score,
            points: after.points - (before?.points ?? 0),
            level: after.level,
            levelUp: !!before && before.level !== after.level,
            badges: after.badges.filter(
              (b) => b.earned && !before?.badges.find((x) => x.key === b.key && x.earned),
            ),
          })
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit')
    }
  }

  const retry = () => {
    setResult(null)
    setAnswers({})
  }

  return (
    <div ref={top} className="mx-auto flex max-w-3xl scroll-mt-20 flex-col gap-4">
      {celebrate ? <Celebration data={celebrate} onClose={() => setCelebrate(null)} /> : null}
      <div className="flex items-center justify-between gap-2">
        <Link to="/me/training" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Training
        </Link>
        <span className="text-xs text-muted-foreground">
          {result ? 'Result' : step < quizStep ? `Lesson ${step + 1} of ${lessons.length}` : 'Quiz'}
        </span>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{m.title}</h1>
        {preview ? (
          <p className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
            Preview: this module is not assigned to you. You can take the quiz as practice; nothing is saved.
          </p>
        ) : null}
      </div>

      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={i < quizStep ? `Lesson ${i + 1}` : 'Quiz'}
            onClick={() => (i < quizStep || allSeen ? goTo(i) : undefined)}
            className={`h-1.5 flex-1 rounded-full ${
              i === step
                ? 'bg-primary'
                : i < quizStep && seen.has(lessons[i].id)
                  ? 'bg-primary/40'
                  : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {result ? (
        <ResultCard
          result={result}
          questions={m.questions}
          onRetry={retry}
          onBack={() => {
            setResult(null)
            setStep(0)
          }}
        />
      ) : step < quizStep && lesson ? (
        <>
          <LessonView lesson={lesson} />
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step + 1 < quizStep ? (
              <Button onClick={() => goTo(step + 1)}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : hasQuiz ? (
              <Button onClick={() => goTo(quizStep)}>
                {passedAlready ? 'Retake the quiz' : 'Take the quiz'} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Link to="/me/training">
                <Button>Done</Button>
              </Link>
            )}
          </div>
        </>
      ) : hasQuiz ? (
        <Card>
          <CardContent className="flex flex-col gap-5 p-5">
            <div>
              <CardTitle>Quiz</CardTitle>
              <CardDescription className="mt-1">
                {m.questions.length} questions. You need {m.pass_mark}% to pass. You can try again if you
                don't pass.
              </CardDescription>
            </div>
            {!allSeen ? (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                Read every lesson before the quiz.
              </p>
            ) : null}
            {m.questions.map((qq, i) => (
              <QuestionBlock
                key={qq.id}
                n={i + 1}
                q={qq}
                value={answers[qq.id] ?? []}
                onChange={(v) => setAnswers((a) => ({ ...a, [qq.id]: v }))}
              />
            ))}
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => goTo(Math.max(0, quizStep - 1))}>
                <ArrowLeft className="h-4 w-4" /> Lessons
              </Button>
              <Button onClick={onSubmit} loading={submit.isPending || practice.isPending} disabled={!allSeen}>
                {preview ? 'Check answers (practice)' : 'Submit answers'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function QuestionBlock({
  n,
  q,
  value,
  onChange,
}: {
  n: number
  q: PublicQuestion
  value: number[]
  onChange: (v: number[]) => void
}) {
  const multi = q.kind === 'multi'
  const toggle = (i: number) =>
    multi ? onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i]) : onChange([i])
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        {n}. {q.prompt}
        {multi ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">(pick all that apply)</span>
        ) : null}
      </legend>
      {q.options.map((o, i) => {
        const on = value.includes(i)
        return (
          <label
            key={i}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
              on ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={q.id}
              checked={on}
              onChange={() => toggle(i)}
              className="h-4 w-4"
            />
            {o}
          </label>
        )
      })}
    </fieldset>
  )
}

function ResultCard({
  result,
  questions,
  onRetry,
  onBack,
}: {
  result: SubmitResult
  questions: PublicQuestion[]
  onRetry: () => void
  onBack: () => void
}) {
  const byId = new Map(result.results.map((r) => [r.question_id, r]))
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          {result.passed ? (
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          ) : (
            <XCircle className="h-8 w-8 text-destructive" />
          )}
          <div>
            <CardTitle>
              {result.passed ? 'Passed' : 'Not passed yet'}
              {result.practice ? ' (practice, not saved)' : ''}
            </CardTitle>
            <CardDescription>
              {Math.round(result.score)}% ({result.correct} of {result.total} right). Pass mark{' '}
              {result.pass_mark}%.
            </CardDescription>
          </div>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          {questions.map((q, i) => {
            const r = byId.get(q.id)
            return (
              <li key={q.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start gap-2">
                  {r?.correct ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div>
                    <div>
                      {i + 1}. {q.prompt}
                    </div>
                    {r?.answer ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Answer: {r.answer.map((a) => q.options[a]).join(', ')}
                      </div>
                    ) : null}
                    {r?.explanation && (result.passed || r.correct) ? (
                      <div className="mt-1 text-xs text-muted-foreground">{r.explanation}</div>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        {!result.passed ? (
          <p className="text-sm text-muted-foreground">
            Go back over the lessons for the ones you missed, then try again.
          </p>
        ) : null}
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={onBack}>
            Back to lessons
          </Button>
          {result.passed ? (
            <Link to="/me/training">
              <Button>Back to training</Button>
            </Link>
          ) : (
            <Button onClick={onRetry}>
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
