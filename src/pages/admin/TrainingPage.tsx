import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Award, Eye, ImageUp, Pencil, Plus, Store, Trash2, Trophy, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { supabase } from '@/lib/supabase'
import { useDesignations } from '@/lib/designations'
import {
  KIND_LABEL,
  STATUS_LABEL,
  TONE_CLASS,
  scoreTone,
  useAdminModules,
  useAdminPaths,
  useAssign,
  useAwards,
  useDeletePath,
  useEmployeeTraining,
  useOutletScores,
  useSaveOutletMedia,
  useTrainingOutlets,
  uploadTrainingImage,
  useSavePath,
  useTrainingOverview,
  useUnassign,
  type AdminModuleRow,
  type OverviewRow,
  type PathRow,
} from '@/lib/training'

type Tab = 'scores' | 'outlets' | 'modules' | 'paths'

interface Outlet {
  id: string
  display_name: string | null
}
interface Emp {
  id: string
  full_name: string
  employee_code: string
  outlet_id: string | null
  designation_code: string | null
}

const ROSTER_GROUPS = ['kitchen', 'service', 'barista', 'management', 'office', 'support']

function useOutlets() {
  return useQuery<Outlet[]>({
    queryKey: ['outlets-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flax_outlets')
        .select('id, display_name')
        .eq('active', true)
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
  })
}

function useActiveEmployees() {
  return useQuery<Emp[]>({
    queryKey: ['training', 'employees-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('employees')
        .select('id, full_name, employee_code, outlet_id, designation_code')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as Emp[]
    },
  })
}

export function ScorePill({ score }: { score: number | null | undefined }) {
  return (
    <span
      className={`inline-flex min-w-[3rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[scoreTone(score)]}`}
    >
      {score == null ? '—' : `${Math.round(score)}`}
    </span>
  )
}

export default function TrainingPage() {
  const [tab, setTab] = useState<Tab>('scores')
  return (
    <>
      <PageHeader
        title="Training"
        description="Brand introduction, onboarding, recipes and SOPs. Scores, outlet ranking and awards."
        actions={
          <Link to="/admin/training/modules/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> New module
            </Button>
          </Link>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="scores">Employee scores</TabsTrigger>
          <TabsTrigger value="outlets">Outlets & awards</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="paths">Paths</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'scores' ? <ScoresTab /> : null}
      {tab === 'outlets' ? <OutletsTab /> : null}
      {tab === 'modules' ? <ModulesTab /> : null}
      {tab === 'paths' ? <PathsTab /> : null}
    </>
  )
}

// ------------------------------------------------------------- scores

function ScoresTab() {
  const q = useTrainingOverview()
  const outlets = useOutlets()
  const [search, setSearch] = useState('')
  const [outlet, setOutlet] = useState('')
  const [open, setOpen] = useState<OverviewRow | null>(null)

  const rows = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean)
    return (q.data ?? []).filter(
      (r) =>
        (!outlet || r.outlet_id === outlet) &&
        words.every((w) => `${r.name} ${r.employee_code} ${r.designation ?? ''}`.toLowerCase().includes(w)),
    )
  }, [q.data, search, outlet])

  const flagged = (q.data ?? []).filter((r) => r.overdue > 0 || (r.score != null && r.score < 60)).length

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          value={outlet}
          onChange={(e) => setOutlet(e.target.value)}
        >
          <option value="">All outlets</option>
          {outlets.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.display_name ?? o.id}
            </option>
          ))}
        </select>
        <div className="flex items-center text-sm text-muted-foreground">
          {flagged ? `${flagged} need attention (overdue or under 60)` : 'Nobody flagged'}
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Score = average best quiz score over modules that are passed, attempted or past due (an overdue module
        not attempted counts as 0). First try = average first-attempt score. Worst first.
      </p>
      {q.isLoading ? (
        <CardDescription>Loading…</CardDescription>
      ) : q.error ? (
        <CardDescription>{q.error instanceof Error ? q.error.message : 'Could not load'}</CardDescription>
      ) : !rows.length ? (
        <Card>
          <CardContent className="p-6">
            <CardDescription>
              No training assigned yet. Turn on a path in the Paths tab, or assign a module from the Modules
              tab.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Outlet</th>
                <th className="px-3 py-2 font-medium">Done</th>
                <th className="px-3 py-2 font-medium">Overdue</th>
                <th className="px-3 py-2 font-medium">First try</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.employee_id}
                  className="cursor-pointer border-t border-border hover:bg-muted/40"
                  onClick={() => setOpen(r)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.employee_code}
                      {r.designation ? ` · ${r.designation}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.outlet ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.passed}/{r.assigned}
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${r.overdue ? 'font-semibold text-destructive' : ''}`}
                  >
                    {r.overdue}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.avg_first == null ? '—' : Math.round(r.avg_first)}
                  </td>
                  <td className="px-3 py-2">
                    <ScorePill score={r.score} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.last_activity ? format(parseISO(r.last_activity), 'd MMM') : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open ? <EmployeePanel row={open} onClose={() => setOpen(null)} /> : null}
    </>
  )
}

function EmployeePanel({ row, onClose }: { row: OverviewRow; onClose: () => void }) {
  const q = useEmployeeTraining(row.employee_id)
  const unassign = useUnassign()
  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Remove "${title}" from ${row.name}? Their attempts for it are deleted too.`)) return
    try {
      await unassign.mutateAsync(id)
      toast.success('Removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">{row.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.employee_code} · {row.designation ?? '—'} · {row.outlet ?? '—'}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border p-2">
            <div className="text-xs text-muted-foreground">Score</div>
            <ScorePill score={row.score} />
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-xs text-muted-foreground">Done</div>
            <div className="font-semibold">
              {row.passed}/{row.assigned}
            </div>
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-xs text-muted-foreground">Overdue</div>
            <div className={`font-semibold ${row.overdue ? 'text-destructive' : ''}`}>{row.overdue}</div>
          </div>
        </div>
        {q.isLoading ? (
          <CardDescription>Loading…</CardDescription>
        ) : (
          <ul className="flex flex-col gap-2">
            {q.data?.assignments.map((a) => (
              <li key={a.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {KIND_LABEL[a.kind]} · {STATUS_LABEL[a.status]}
                      {a.due_on ? ` · due ${format(parseISO(a.due_on), 'd MMM')}` : ''} · lessons read{' '}
                      {a.viewed}/{a.lessons} · {a.source === 'path' ? 'from a path' : 'assigned by hand'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <ScorePill score={a.best_score} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(a.id, a.title)}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {a.history.length ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Attempts:{' '}
                    {a.history
                      .map(
                        (h) =>
                          `${format(parseISO(h.at), 'd MMM')} ${Math.round(h.score)}%${h.passed ? ' ✓' : ''}`,
                      )
                      .join(' · ')}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------- outlets & awards

function OutletsTab() {
  const q = useOutletScores()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const aw = useAwards(month)
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" /> Awards
              </CardTitle>
              <CardDescription className="mt-1">
                Best-trained outlet: highest outlet score with at least 80% completion. Top learners: modules
                passed in the month, ranked by first-try score.
              </CardDescription>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Month
              <Input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Best-trained outlet (now)
              </div>
              {aw.data?.best_outlet ? (
                <div className="mt-2 flex items-center gap-3">
                  <Trophy className="h-8 w-8 text-amber-500" />
                  <div>
                    <div className="text-lg font-semibold">
                      {aw.data.best_outlet.outlet ?? aw.data.best_outlet.outlet_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Score {Math.round(aw.data.best_outlet.score)} · completion{' '}
                      {Math.round(aw.data.best_outlet.completion)}%
                    </div>
                  </div>
                </div>
              ) : (
                <CardDescription className="mt-2">No outlet has 80% completion yet.</CardDescription>
              )}
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Top learners</div>
              {aw.data?.top_learners.length ? (
                <ol className="mt-2 flex flex-col gap-1 text-sm">
                  {aw.data.top_learners.map((l) => (
                    <li key={l.employee_id} className="flex items-center justify-between gap-2">
                      <span>
                        {l.rk}. {l.name}{' '}
                        <span className="text-xs text-muted-foreground">{l.outlet ?? ''}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {l.modules_passed} passed · first try {Math.round(l.first_try_score)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <CardDescription className="mt-2">Nobody passed a module this month yet.</CardDescription>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="mb-2 text-sm font-medium">Outlet ranking</div>
        <p className="mb-2 text-xs text-muted-foreground">
          Outlet score = average training score of its staff. Completion = modules passed out of modules due.
          Sent to Command every night as the people-pillar KPIs training_score, training_completion and
          training_overdue.
        </p>
        {q.isLoading ? (
          <CardDescription>Loading…</CardDescription>
        ) : !q.data?.length ? (
          <CardDescription>No outlet has training assigned yet.</CardDescription>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Outlet</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Completion</th>
                  <th className="px-3 py-2 font-medium">Fully trained staff</th>
                  <th className="px-3 py-2 font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((o, i) => (
                  <tr key={o.outlet_id} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{o.outlet ?? o.outlet_id}</td>
                    <td className="px-3 py-2">
                      <ScorePill score={o.score} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {o.completion == null ? '—' : `${Math.round(o.completion)}%`}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {o.trained_staff}/{o.staff}
                    </td>
                    <td
                      className={`px-3 py-2 tabular-nums ${o.overdue ? 'font-semibold text-destructive' : ''}`}
                    >
                      {o.overdue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <OutletPhotos />
    </div>
  )
}

function OutletPhotos() {
  const q = useTrainingOutlets()
  const save = useSaveOutletMedia()
  const [busy, setBusy] = useState<string | null>(null)
  const onFile = async (outlet: string, note: string | null, f: File | undefined) => {
    if (!f) return
    setBusy(outlet)
    try {
      const url = await uploadTrainingImage(f)
      await save.mutateAsync({ outlet, photo_url: url, note })
      toast.success('Photo saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div>
      <div className="mb-1 text-sm font-medium">Outlet photos</div>
      <p className="mb-2 text-xs text-muted-foreground">
        Shown to staff in the "Our outlets" lesson. A clear photo of the storefront works best.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((o) => (
          <li key={o.id} className="overflow-hidden rounded-lg border border-border bg-surface">
            {o.photo_url ? (
              <img src={o.photo_url} alt={o.name} className="h-28 w-full object-cover" />
            ) : (
              <div className="flex h-28 items-center justify-center bg-muted/50 text-muted-foreground">
                <Store className="h-7 w-7" />
              </div>
            )}
            <div className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="truncate font-medium">{o.name}</span>
              <label className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-muted">
                <ImageUp className="h-3.5 w-3.5" />{' '}
                {busy === o.id ? 'Uploading…' : o.photo_url ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={busy === o.id}
                  onChange={(e) => onFile(o.id, o.note, e.target.files?.[0])}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------- modules

function ModulesTab() {
  const q = useAdminModules()
  const [assigning, setAssigning] = useState<AdminModuleRow | null>(null)
  if (q.isLoading) return <CardDescription>Loading…</CardDescription>
  if (q.error)
    return <CardDescription>{q.error instanceof Error ? q.error.message : 'Could not load'}</CardDescription>
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {q.data?.map((m) => (
          <Card key={m.id} className={m.is_active ? '' : 'opacity-60'}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {KIND_LABEL[m.kind]}
                  {m.is_active ? '' : ' · archived'}
                </div>
                <CardTitle className="mt-0.5 text-base">{m.title}</CardTitle>
                {m.summary ? <CardDescription className="mt-1">{m.summary}</CardDescription> : null}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{m.lessons} lessons</span>
                <span>{m.questions} questions</span>
                <span>pass {m.pass_mark}%</span>
                <span>
                  {m.passed}/{m.assigned} passed
                </span>
                {m.avg_score != null ? <span>avg {Math.round(m.avg_score)}</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/admin/training/modules/${m.id}`}>
                  <Button size="sm" variant="outline">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </Link>
                <Link to={`/me/training/${m.id}`}>
                  <Button size="sm" variant="outline">
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => setAssigning(m)} disabled={!m.is_active}>
                  <UserPlus className="h-3.5 w-3.5" /> Assign
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {assigning ? <AssignDialog module={assigning} onClose={() => setAssigning(null)} /> : null}
    </>
  )
}

function AssignDialog({ module, onClose }: { module: AdminModuleRow; onClose: () => void }) {
  const emps = useActiveEmployees()
  const outlets = useOutlets()
  const assign = useAssign()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [outlet, setOutlet] = useState('')
  const [due, setDue] = useState(() => format(new Date(Date.now() + 7 * 864e5), 'yyyy-MM-dd'))

  const list = (emps.data ?? []).filter(
    (e) =>
      (!outlet || e.outlet_id === outlet) &&
      `${e.full_name} ${e.employee_code}`.toLowerCase().includes(search.toLowerCase()),
  )
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const save = async () => {
    try {
      const n = await assign.mutateAsync({ module: module.id, employees: [...picked], due })
      toast.success(`Assigned to ${n} ${n === 1 ? 'person' : 'people'}`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col" onClick={(e) => e.stopPropagation()}>
        <CardContent className="flex min-h-0 flex-col gap-3 p-5">
          <CardTitle>Assign "{module.title}"</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              value={outlet}
              onChange={(e) => setOutlet(e.target.value)}
            >
              <option value="">All outlets</option>
              {outlets.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name ?? o.id}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{picked.size} selected</span>
            <button
              type="button"
              className="underline"
              onClick={() => setPicked(new Set(list.map((e) => e.id)))}
            >
              Select all shown ({list.length})
            </button>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {list.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
                  <span>
                    {e.full_name} <span className="text-xs text-muted-foreground">{e.employee_code}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1 text-sm">
            Due by
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={assign.isPending} disabled={!picked.size}>
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// --------------------------------------------------------------- paths

function PathsTab() {
  const q = useAdminPaths()
  const [editing, setEditing] = useState<PathRow | null>(null)
  if (q.isLoading) return <CardDescription>Loading…</CardDescription>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A path gives its modules automatically to every active employee who matches it (roster group,
        designation, outlet), including new joiners the day they are added. Turning a path off stops new
        assignments; nothing already assigned is removed.
      </p>
      <div>
        <Button
          size="sm"
          onClick={() =>
            setEditing({
              name: '',
              description: '',
              roster_groups: null,
              designation_codes: null,
              outlet_ids: null,
              due_days: 7,
              is_active: false,
              module_ids: [],
            })
          }
        >
          <Plus className="h-4 w-4" /> New path
        </Button>
      </div>
      {editing ? <PathEditor path={editing} onClose={() => setEditing(null)} /> : null}
      {q.data?.map((p) => (
        <Card key={p.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    p.is_active ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {p.is_active ? 'On' : 'Off'}
                </span>
              </div>
              {p.description ? <CardDescription className="mt-1">{p.description}</CardDescription> : null}
              <div className="mt-2 text-xs text-muted-foreground">
                {p.module_ids.length} modules · due in {p.due_days} days · roster groups:{' '}
                {p.roster_groups?.join(', ') ?? 'all'}
                {p.designation_codes ? ` · designations: ${p.designation_codes.join(', ')}` : ''}
                {p.outlet_ids ? ` · outlets: ${p.outlet_ids.join(', ')}` : ''}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string[] | null
  onChange: (v: string[] | null) => void
}) {
  const set = new Set(value ?? [])
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = set.has(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              const n = new Set(set)
              if (on) n.delete(o.value)
              else n.add(o.value)
              onChange(n.size ? [...n] : null)
            }}
            className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function PathEditor({ path, onClose }: { path: PathRow; onClose: () => void }) {
  const [p, setP] = useState<PathRow>(path)
  const modules = useAdminModules()
  const designations = useDesignations({ activeOnly: true })
  const outlets = useOutlets()
  const save = useSavePath()
  const del = useDeletePath()

  const onSave = async () => {
    if (!p.name.trim()) return toast.error('Give the path a name')
    if (!p.module_ids.length) return toast.error('Pick at least one module')
    try {
      await save.mutateAsync(p)
      toast.success(p.is_active ? 'Saved. Modules assigned to everyone who matches.' : 'Saved')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }
  const onDelete = async () => {
    if (!p.id || !window.confirm('Delete this path? Modules already assigned stay assigned.')) return
    await del.mutateAsync(p.id)
    onClose()
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-col gap-4 p-5">
        <CardTitle className="text-base">{p.id ? 'Edit path' : 'New path'}</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Due within (days of joining, or of the path being turned on)
            <Input
              type="number"
              min={1}
              max={365}
              value={p.due_days}
              onChange={(e) => setP({ ...p, due_days: Number(e.target.value) || 7 })}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Description
          <Input value={p.description ?? ''} onChange={(e) => setP({ ...p, description: e.target.value })} />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          Roster groups <span className="text-xs text-muted-foreground">(none picked = everyone)</span>
          <Chips
            options={ROSTER_GROUPS.map((g) => ({ value: g, label: g }))}
            value={p.roster_groups}
            onChange={(v) => setP({ ...p, roster_groups: v })}
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          Designations <span className="text-xs text-muted-foreground">(optional, narrows further)</span>
          <Chips
            options={(designations.data ?? []).map((d) => ({ value: d.code, label: d.name }))}
            value={p.designation_codes}
            onChange={(v) => setP({ ...p, designation_codes: v })}
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          Outlets <span className="text-xs text-muted-foreground">(optional)</span>
          <Chips
            options={(outlets.data ?? []).map((o) => ({ value: o.id, label: o.display_name ?? o.id }))}
            value={p.outlet_ids}
            onChange={(v) => setP({ ...p, outlet_ids: v })}
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          Modules, in order
          <Chips
            options={(modules.data ?? [])
              .filter((m) => m.is_active)
              .map((m) => ({ value: m.id, label: m.title }))}
            value={p.module_ids}
            onChange={(v) => setP({ ...p, module_ids: v ?? [] })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={p.is_active}
            onChange={(e) => setP({ ...p, is_active: e.target.checked })}
          />
          Path is on (assigns its modules now and to every new joiner who matches)
        </label>
        <div className="flex flex-wrap justify-between gap-2">
          {p.id ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={save.isPending}>
              Save path
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
