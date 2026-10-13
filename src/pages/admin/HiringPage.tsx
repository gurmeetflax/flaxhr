import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import {
  CalendarPlus,
  Check,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Pencil,
  RefreshCw,
  Upload,
  UserPlus,
  Video,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  cvUrl,
  downloadIcs,
  scoreCandidate,
  sendInterviewInvite,
  STATUS_LABEL,
  useCandidates,
  useHiringRoles,
  useUpdateCandidate,
  useUpdateRole,
  useUploadCvs,
  type Candidate,
  type CandidateStatus,
  type Department,
  type HiringRole,
  type Requirements,
} from '@/lib/hiring'

const IST = 'Asia/Kolkata'
const DEPTS: { key: Department; label: string }[] = [
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'service', label: 'Service' },
  { key: 'management', label: 'Management' },
  { key: 'office', label: 'Office' },
]
const STATUSES: CandidateStatus[] = ['new', 'shortlisted', 'interview', 'selected', 'rejected']

export default function HiringPage() {
  const { data: roles = [], isLoading } = useHiringRoles()
  const [dept, setDept] = useState<Department>('kitchen')
  const [roleId, setRoleId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | ''>('')
  const [pickedId, setPickedId] = useState<string | null>(null)

  const deptRoles = roles.filter((r) => r.department === dept)
  // Selected role in this department, else its first role.
  const role = deptRoles.find((r) => r.id === roleId) ?? deptRoles[0] ?? null

  const { data: candidates = [] } = useCandidates(role?.id ?? null)
  const shown = candidates.filter((c) => !statusFilter || c.status === statusFilter)
  const picked = candidates.find((c) => c.id === pickedId) ?? null

  return (
    <>
      <PageHeader title="Hiring" description="Upload CVs, get them scored against Flax's requirements, and schedule interviews." />

      <div className="mb-4 flex flex-wrap gap-2">
        {DEPTS.map((d) => (
          <Button key={d.key} size="sm" variant={dept === d.key ? 'primary' : 'outline'} onClick={() => setDept(d.key)}>
            {d.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="h-fit">
            <CardContent className="p-2">
              <ul className="flex flex-col">
                {deptRoles.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRoleId(r.id)
                        setPickedId(null)
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${
                        r.id === role?.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                      }`}
                    >
                      <span className={r.is_open ? '' : 'text-muted-foreground line-through'}>{r.title}</span>
                      <span className="flex gap-1 text-[11px]">
                        {r.new_candidates ? (
                          <span className="rounded-full bg-amber-500/15 px-1.5 text-amber-700">{r.new_candidates} new</span>
                        ) : null}
                        {r.candidates ? <span className="text-muted-foreground">{r.candidates}</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {role ? (
            <div className="flex min-w-0 flex-col gap-4">
              <RoleCard role={role} />
              <UploadCard role={role} />

              <Card>
                <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>Candidates ({candidates.length})</CardTitle>
                    <select
                      className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as CandidateStatus | '')}
                    >
                      <option value="">All stages</option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {shown.length ? (
                    <ul className="flex flex-col divide-y divide-border">
                      {shown.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setPickedId(c.id === pickedId ? null : c.id)}
                            className={`flex w-full items-center gap-3 px-1 py-2.5 text-left ${c.id === pickedId ? 'bg-muted/60' : 'hover:bg-muted/30'}`}
                          >
                            <ScoreBadge c={c} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{c.full_name || c.cv_filename || 'Unnamed'}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {[c.score_detail?.current_role, c.score_detail ? `${c.score_detail.years_experience} yrs` : null, c.city]
                                  .filter(Boolean)
                                  .join(' · ') || (c.score_error ? c.score_error : 'Reading CV…')}
                              </span>
                            </span>
                            <StatusChip s={c.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <CardDescription>No candidates yet — upload CVs above.</CardDescription>
                  )}
                </CardContent>
              </Card>

              {picked ? <CandidateCard key={picked.id} c={picked} onClose={() => setPickedId(null)} /> : null}
            </div>
          ) : (
            <Card>
              <CardContent className="p-6">
                <CardDescription>No roles in this department.</CardDescription>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function RoleCard({ role }: { role: HiringRole }) {
  const update = useUpdateRole()
  const [editing, setEditing] = useState(false)
  const r = role.requirements

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{role.title}</CardTitle>
            <CardDescription className="mt-1">{r.summary}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => update.mutate({ id: role.id, is_open: !role.is_open })}
              loading={update.isPending}
            >
              {role.is_open ? 'Close role' : 'Reopen role'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
              <Pencil className="h-4 w-4" /> {editing ? 'Cancel' : 'Edit requirements'}
            </Button>
          </div>
        </div>
        {editing ? (
          <RequirementsEditor
            value={r}
            saving={update.isPending}
            onSave={async (req) => {
              try {
                await update.mutateAsync({ id: role.id, requirements: req })
                toast.success('Requirements saved — re-score CVs to apply them')
                setEditing(false)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed')
              }
            }}
          />
        ) : (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <ReqList title="Must have" items={r.must_have} />
            <ReqList title="Nice to have" items={r.nice_to_have} />
            <ReqList title="Red flags" items={r.red_flags} />
            <div className="text-xs text-muted-foreground">
              <div>Min. experience: {r.min_experience_years ?? 0} yrs</div>
              {r.languages?.length ? <div>Languages: {r.languages.join(', ')}</div> : null}
              {r.location ? <div>Location: {r.location}</div> : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReqList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="list-disc space-y-0.5 pl-4">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

function RequirementsEditor({
  value,
  saving,
  onSave,
}: {
  value: Requirements
  saving: boolean
  onSave: (r: Requirements) => void
}) {
  const lines = (a?: string[]) => (a ?? []).join('\n')
  const [summary, setSummary] = useState(value.summary ?? '')
  const [must, setMust] = useState(lines(value.must_have))
  const [nice, setNice] = useState(lines(value.nice_to_have))
  const [flags, setFlags] = useState(lines(value.red_flags))
  const [minYears, setMinYears] = useState(String(value.min_experience_years ?? 0))
  const [languages, setLanguages] = useState((value.languages ?? []).join(', '))
  const [location, setLocation] = useState(value.location ?? '')
  const split = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

  return (
    <div className="grid gap-3 text-sm">
      <Field label="Summary">
        <textarea className={TA} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Must have (one per line)">
          <textarea className={TA} rows={6} value={must} onChange={(e) => setMust(e.target.value)} />
        </Field>
        <Field label="Nice to have (one per line)">
          <textarea className={TA} rows={6} value={nice} onChange={(e) => setNice(e.target.value)} />
        </Field>
        <Field label="Red flags (one per line)">
          <textarea className={TA} rows={6} value={flags} onChange={(e) => setFlags(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Min. experience (years)">
          <Input type="number" min={0} value={minYears} onChange={(e) => setMinYears(e.target.value)} />
        </Field>
        <Field label="Languages (comma separated)">
          <Input value={languages} onChange={(e) => setLanguages(e.target.value)} />
        </Field>
        <Field label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button
          loading={saving}
          onClick={() =>
            onSave({
              summary: summary.trim(),
              must_have: split(must),
              nice_to_have: split(nice),
              red_flags: split(flags),
              min_experience_years: Number(minYears) || 0,
              languages: languages.split(',').map((x) => x.trim()).filter(Boolean),
              location: location.trim(),
            })
          }
        >
          <Check className="h-4 w-4" /> Save requirements
        </Button>
      </div>
    </div>
  )
}

function UploadCard({ role }: { role: HiringRole }) {
  const upload = useUploadCvs()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    try {
      const n = await upload.mutateAsync({ roleId: role.id, files })
      toast.success(`${n} CV${n === 1 ? '' : 's'} uploaded — scoring now`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        void onFiles(e.dataTransfer.files)
      }}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm ${
        drag ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <Upload className="h-6 w-6 text-muted-foreground" />
      <div>
        Drop CVs here for <b>{role.title}</b>, or
      </div>
      <Button size="sm" onClick={() => input.current?.click()} loading={upload.isPending} disabled={!role.is_open}>
        Choose files
      </Button>
      <div className="text-xs text-muted-foreground">PDF, Word (.docx) or a photo of a paper CV · several at once</div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
    </div>
  )
}

function CandidateCard({ c, onClose }: { c: Candidate; onClose: () => void }) {
  const navigate = useNavigate()
  const update = useUpdateCandidate()
  const [contact, setContact] = useState({
    full_name: c.full_name ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    city: c.city ?? '',
  })
  const [when, setWhen] = useState(c.interview_at ? formatInTimeZone(c.interview_at, IST, "yyyy-MM-dd'T'HH:mm") : '')
  const [minutes, setMinutes] = useState(c.interview_minutes || 30)
  const [meet, setMeet] = useState(c.meet_link ?? '')
  const [notes, setNotes] = useState(c.interview_notes ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const d = c.score_detail

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  const saveInterview = () =>
    run(
      'interview',
      async () => {
        if (!when) throw new Error('Pick the interview date and time.')
        await update.mutateAsync({
          id: c.id,
          // datetime-local is IST wall-clock time.
          interview_at: new Date(`${when}:00+05:30`).toISOString(),
          interview_minutes: minutes,
          meet_link: meet.trim() || null,
          interview_notes: notes.trim() || null,
          status: c.status === 'new' || c.status === 'shortlisted' ? 'interview' : c.status,
        })
      },
      'Interview saved',
    )

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ScoreBadge c={c} large />
            <div>
              <CardTitle>{c.full_name || c.cv_filename}</CardTitle>
              <CardDescription>
                {c.role_title}
                {d ? ` · ${d.years_experience} yrs · ${d.current_role || 'no current role listed'}` : ''}
              </CardDescription>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => run('cv', async () => void window.open(await cvUrl(c.cv_path), '_blank'))}>
            <FileText className="h-4 w-4" /> View CV
          </Button>
          <Button size="sm" variant="outline" loading={busy === 'score'} onClick={() => run('score', () => scoreCandidate(c.id), 'Re-scored')}>
            <RefreshCw className="h-4 w-4" /> Re-score
          </Button>
        </div>

        {c.score_error ? <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{c.score_error}</p> : null}

        {d ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <RecChip r={d.recommendation} /> {d.summary}
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Requirement</th>
                    <th className="py-1 pr-2 font-medium">Result</th>
                    <th className="py-1 font-medium">Evidence from CV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.criteria.map((k, i) => (
                    <tr key={i} className="align-top">
                      <td className="py-1.5 pr-2">
                        {k.requirement}
                        <span className="block text-[10px] text-muted-foreground">
                          {k.kind === 'must_have' ? 'Must have' : k.kind === 'nice_to_have' ? 'Nice to have' : 'Red flag'}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Verdict k={k.kind} v={k.verdict} />
                      </td>
                      <td className="py-1.5 text-muted-foreground">{k.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ReqList title="Strengths" items={d.strengths} />
              <ReqList title="Concerns" items={d.concerns} />
            </div>
          </div>
        ) : !c.score_error ? (
          <p className="text-sm text-muted-foreground">Reading and scoring the CV… this takes about a minute.</p>
        ) : null}

        <Section title="Contact">
          <div className="grid gap-2 sm:grid-cols-4">
            <Input placeholder="Name" value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} />
            <Input placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            <Input placeholder="Email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <Input placeholder="City" value={contact.city} onChange={(e) => setContact({ ...contact, city: e.target.value })} />
          </div>
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'contact'}
              onClick={() => run('contact', () => update.mutateAsync({ id: c.id, ...contact }), 'Saved')}
            >
              Save contact
            </Button>
          </div>
        </Section>

        <Section title="Stage">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={c.status === s ? 'primary' : 'outline'}
                onClick={() => run('status', () => update.mutateAsync({ id: c.id, status: s }))}
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
        </Section>

        <Section title="Interview with Gurmeet">
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <select
              className="h-10 rounded-lg border border-border bg-surface px-2 text-sm"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex gap-2">
            <Input placeholder="Google Meet link (paste here)" value={meet} onChange={(e) => setMeet(e.target.value)} />
            <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button size="sm" variant="outline" className="h-10">
                <Video className="h-4 w-4" /> New Meet <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          </div>
          <textarea
            className={`${TA} mt-2`}
            rows={2}
            placeholder="Interview notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" loading={busy === 'interview'} onClick={saveInterview}>
              <CalendarPlus className="h-4 w-4" /> Save interview
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!c.interview_at}
              loading={busy === 'invite'}
              onClick={() => run('invite', () => sendInterviewInvite(c.id), 'Invite emailed to the candidate and Gurmeet')}
            >
              <Mail className="h-4 w-4" /> Email invite
            </Button>
            <Button size="sm" variant="outline" disabled={!c.interview_at} onClick={() => downloadIcs(c)}>
              <Download className="h-4 w-4" /> Download .ics
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {c.interview_at
              ? `Scheduled ${formatInTimeZone(c.interview_at, IST, 'EEE d MMM, h:mm a')}${c.invite_sent_at ? ` · invite sent ${format(new Date(c.invite_sent_at), 'd MMM, h:mm a')}` : ' · invite not sent yet'}`
              : 'Tap "New Meet" to create a Meet link in your Google account, paste it here, then save and email the invite.'}
          </p>
        </Section>

        {c.status === 'selected' ? (
          <Section title="Hire">
            {c.employee_id ? (
              <Button size="sm" variant="outline" onClick={() => navigate(`/admin/employees/${c.employee_id}`)}>
                Open employee record
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  const p = new URLSearchParams({
                    candidate: c.id,
                    name: contact.full_name,
                    phone: contact.phone,
                    email: contact.email,
                    designation: c.designation_code ?? '',
                  })
                  navigate(`/admin/employees/new?${p}`)
                }}
              >
                <UserPlus className="h-4 w-4" /> Create employee
              </Button>
            )}
          </Section>
        ) : null}
      </CardContent>
    </Card>
  )
}

const TA = 'w-full rounded-lg border border-border bg-surface p-2 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

function ScoreBadge({ c, large }: { c: Candidate; large?: boolean }) {
  const size = large ? 'h-12 w-12 text-lg' : 'h-9 w-9 text-sm'
  if (c.score == null) {
    return (
      <span className={`${size} grid shrink-0 place-items-center rounded-full bg-muted text-xs text-muted-foreground`}>
        {c.score_error ? '!' : '…'}
      </span>
    )
  }
  const cls = c.score >= 70 ? 'bg-primary/15 text-primary' : c.score >= 50 ? 'bg-amber-500/15 text-amber-700' : 'bg-destructive/10 text-destructive'
  return <span className={`${size} ${cls} grid shrink-0 place-items-center rounded-full font-semibold tabular-nums`}>{c.score}</span>
}

function StatusChip({ s }: { s: CandidateStatus }) {
  const cls =
    s === 'selected'
      ? 'bg-primary/10 text-primary'
      : s === 'rejected'
        ? 'bg-muted text-muted-foreground'
        : s === 'interview'
          ? 'bg-blue-500/10 text-blue-700'
          : s === 'shortlisted'
            ? 'bg-amber-500/10 text-amber-700'
            : 'bg-muted text-foreground'
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{STATUS_LABEL[s]}</span>
}

function RecChip({ r }: { r: 'interview' | 'maybe' | 'reject' }) {
  const m = { interview: ['Interview', 'bg-primary/10 text-primary'], maybe: ['Maybe', 'bg-amber-500/10 text-amber-700'], reject: ['Not a fit', 'bg-destructive/10 text-destructive'] }[r]
  return <span className={`mr-1 rounded-full px-2 py-0.5 text-xs font-medium ${m[1]}`}>{m[0]}</span>
}

function Verdict({ k, v }: { k: string; v: string }) {
  const good = k === 'red_flag' ? v === 'absent' : v === 'met'
  const bad = k === 'red_flag' ? v === 'present' : v === 'missing'
  const label = k === 'red_flag' ? (v === 'present' ? 'Found' : v === 'absent' ? 'Not found' : 'Unclear') : v[0].toUpperCase() + v.slice(1)
  return (
    <span className={`whitespace-nowrap font-medium ${good ? 'text-primary' : bad ? 'text-destructive' : 'text-amber-700'}`}>{label}</span>
  )
}
