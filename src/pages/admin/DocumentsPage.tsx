import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Check, Download, Eye, Pencil, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import {
  openSignedPdf,
  directorSignatureDataUrl,
  KIND_LABEL,
  loadDocContext,
  PLACEHOLDERS,
  renderForEmployee,
  uploadDirectorSignature,
  useCancelRequest,
  useEntities,
  usePositionTerms,
  useSaveEntity,
  useSaveTemplate,
  useSaveTerms,
  useSignRequests,
  useTemplates,
  type DocTemplate,
  type LegalEntity,
  type PositionTerms,
  type SignStatus,
} from '@/lib/documents'
import LetterPreview from './LetterPreview'
import RichTextEditor, { type RichTextEditorHandle } from './RichTextEditor'
import { EmployeeSelect } from '@/components/ui/EmployeeSelect'

type Tab = 'sent' | 'templates' | 'companies' | 'terms'

export default function DocumentsPage() {
  const [tab, setTab] = useState<Tab>('sent')
  return (
    <>
      <PageHeader
        title="Documents"
        description="Letters and policies employees sign — Aadhaar eSign or in the app"
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="terms">Position terms</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'sent' ? (
        <SentTab />
      ) : tab === 'templates' ? (
        <TemplatesTab />
      ) : tab === 'companies' ? (
        <CompaniesTab />
      ) : (
        <TermsTab />
      )}
    </>
  )
}

// ── Sent ──────────────────────────────────────────────────────────────
function SentTab() {
  const [status, setStatus] = useState<SignStatus | ''>('')
  const [search, setSearch] = useState('')
  const { data: all = [], isLoading } = useSignRequests({ status })
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = words.length
    ? all.filter((r) => {
        const hay = `${r.employee_name} ${r.employee_code} ${r.title}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
    : all
  const cancel = useCancelRequest()
  const counts = rows.reduce<Record<string, number>>(
    (m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m),
    {},
  )
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardDescription>
            Send documents from an employee's profile (Employees → Edit → Documents to sign).
          </CardDescription>
          <Input
            className="h-9 w-56"
            placeholder="Search name, code or document"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as SignStatus | '')}
          >
            <option value="">All statuses</option>
            {(['sent', 'viewed', 'signed', 'declined', 'cancelled'] as SignStatus[]).map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)} {counts[s] ? `(${counts[s]})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">How</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.employee_name}</div>
                    <div className="text-xs text-muted-foreground">{r.employee_code}</div>
                  </td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.sign_method === 'aadhaar' ? 'Aadhaar eSign' : 'In-app'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {format(new Date(r.sent_at), 'd MMM yyyy')}
                  </td>
                  <td className="px-3 py-2 capitalize">
                    {r.status}
                    {r.signed_at ? (
                      <span className="block text-xs text-muted-foreground">
                        {format(new Date(r.signed_at), 'd MMM, h:mm a')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.signed_pdf_path ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openSignedPdf(r.signed_pdf_path!).catch((e) => toast.error(e.message))}
                      >
                        <Download className="h-4 w-4" /> PDF
                      </Button>
                    ) : null}
                    {r.status === 'sent' || r.status === 'viewed' ? (
                      <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}>
                        Cancel
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {isLoading ? 'Loading…' : 'Nothing sent yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Templates ─────────────────────────────────────────────────────────
function TemplatesTab() {
  const { data: templates = [] } = useTemplates()
  const [kind, setKind] = useState<string>('')
  const tpl = templates.find((t) => t.kind === kind) ?? templates[0]
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit">
        <CardContent className="p-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setKind(t.kind)}
              className={`flex w-full flex-col rounded-md px-3 py-2 text-left text-sm ${t.id === tpl?.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            >
              <span className={`font-medium ${t.is_active ? '' : 'line-through opacity-60'}`}>{t.title}</span>
              <span className="text-xs text-muted-foreground">
                {t.sign_method === 'aadhaar' ? 'Aadhaar eSign' : 'In-app'} · v{t.version}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
      {tpl ? <TemplateEditor key={`${tpl.id}-${tpl.version}`} tpl={tpl} /> : null}
    </div>
  )
}

function TemplateEditor({ tpl }: { tpl: DocTemplate }) {
  const save = useSaveTemplate()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(tpl.title)
  const [body, setBody] = useState(tpl.body)
  const [method, setMethod] = useState(tpl.sign_method)
  const [active, setActive] = useState(tpl.is_active)
  const [previewFor, setPreviewFor] = useState('')
  const [draftPreview, setDraftPreview] = useState<{ html: string; missing: string[] } | null>(null)
  const editor = useRef<RichTextEditorHandle>(null)

  const emps = useQuery<{ id: string; full_name: string; employee_code: string }[]>({
    queryKey: ['doc-preview-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employees')
        .select('id, full_name, employee_code')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return data ?? []
    },
  })
  const previewId = previewFor || emps.data?.[0]?.id

  const render = async (t: Pick<DocTemplate, 'title' | 'body'>) => {
    const ctx = await loadDocContext(previewId!)
    const sig = await directorSignatureDataUrl(ctx.entity)
    return renderForEmployee({ ...tpl, ...t }, ctx, sig)
  }

  // The saved letter, filled in for the chosen employee.
  const saved = useQuery({
    queryKey: ['template-preview', tpl.id, tpl.version, previewId],
    enabled: !!previewId && !editing,
    queryFn: () => render(tpl),
  })

  const shown = editing ? draftPreview : saved.data

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        {editing ? (
          <>
            <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Title
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Signed with
                <select
                  className="h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as DocTemplate['sign_method'])}
                >
                  <option value="aadhaar">Aadhaar eSign</option>
                  <option value="in_app">In-app signature</option>
                </select>
              </label>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In
                use
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Click to insert employee details where the cursor is — they fill in automatically for each
                person:
              </span>
              <div className="flex flex-wrap gap-1">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={`Inserts {{${p.key}}}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.current?.insertText(`{{${p.key}}}`)}
                    className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs hover:border-primary"
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
            </div>
            <RichTextEditor ref={editor} initialHtml={tpl.body} onChange={setBody} />
            <p className="text-xs text-muted-foreground">
              The letterhead, date, your signature and the employee's signature block are added automatically.
              Documents already sent keep the wording they were sent with.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                loading={save.isPending}
                onClick={async () => {
                  try {
                    await save.mutateAsync({
                      id: tpl.id,
                      title,
                      body,
                      sign_method: method,
                      is_active: active,
                      version: tpl.version,
                    })
                    toast.success(`Saved as version ${tpl.version + 1}`)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Save failed')
                  }
                }}
              >
                <Check className="h-4 w-4" /> Save
              </Button>
              <Button
                variant="outline"
                disabled={!previewId}
                onClick={() =>
                  render({ title, body })
                    .then(setDraftPreview)
                    .catch((e) => toast.error(e instanceof Error ? e.message : 'Preview failed'))
                }
              >
                <Eye className="h-4 w-4" /> Preview changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  setTitle(tpl.title)
                  setBody(tpl.body)
                  setMethod(tpl.sign_method)
                  setActive(tpl.is_active)
                  setDraftPreview(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{tpl.title}</CardTitle>
              <CardDescription>
                {tpl.sign_method === 'aadhaar' ? 'Aadhaar eSign' : 'In-app signature'} · version {tpl.version}
                {tpl.is_active ? '' : ' · not in use'}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit wording
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Showing it as
          <EmployeeSelect
            className="w-64"
            options={emps.data ?? []}
            value={previewFor}
            onChange={(id) => {
              setPreviewFor(id)
              setDraftPreview(null)
            }}
            placeholder={emps.data?.[0] ? `${emps.data[0].full_name} (search)` : 'Search employee'}
          />
          would see it
        </div>
        {shown?.missing.length ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Not on this employee's record yet: {shown.missing.join(', ')}. Fill these in on their profile
            before sending.
          </p>
        ) : null}
        {shown ? (
          <LetterPreview html={shown.html} />
        ) : !editing && saved.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading letter…</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {KIND_LABEL[tpl.kind]} · starter wording — have it reviewed by your lawyer before relying on it.
        </p>
      </CardContent>
    </Card>
  )
}

// ── Companies ─────────────────────────────────────────────────────────
function CompaniesTab() {
  const { data: entities = [], refetch } = useEntities()
  const [sigUrl, setSigUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const sigPath = entities.find((e) => e.signature_path)?.signature_path ?? null

  useEffect(() => {
    let cancelled = false
    const ent = entities.find((e) => e.signature_path) ?? null
    void directorSignatureDataUrl(ent).then((u) => {
      if (!cancelled) setSigUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [entities, sigPath])

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
          <CardTitle>Authorised signatory</CardTitle>
          <CardDescription>
            Your signature is printed on every letter as the company's authorised signatory. Use a clear photo
            or scan of your signature on white paper (PNG with a transparent or white background works best).
          </CardDescription>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-20 w-56 place-items-center rounded-lg border border-dashed border-border bg-white">
              {sigUrl ? (
                <img src={sigUrl} alt="Signature" className="max-h-16" />
              ) : (
                <span className="text-xs text-muted-foreground">No signature yet</span>
              )}
            </div>
            <Button variant="outline" loading={uploading} onClick={() => input.current?.click()}>
              <Upload className="h-4 w-4" /> {sigUrl ? 'Replace signature' : 'Upload signature'}
            </Button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setUploading(true)
                try {
                  await uploadDirectorSignature(
                    entities.map((x) => x.id),
                    f,
                  )
                  toast.success('Signature saved')
                  void refetch()
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Upload failed')
                } finally {
                  setUploading(false)
                  e.target.value = ''
                }
              }}
            />
          </div>
        </CardContent>
      </Card>
      {entities.map((e) => (
        <EntityCard key={e.id} e={e} />
      ))}
    </div>
  )
}

function EntityCard({ e }: { e: LegalEntity }) {
  const save = useSaveEntity()
  const [f, setF] = useState({
    legal_name: e.legal_name,
    address: e.address ?? '',
    gstin: e.gstin ?? '',
    signatory_name: e.signatory_name,
    signatory_title: e.signatory_title,
  })
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <CardTitle>
            {e.state}{' '}
            <span className="text-sm font-normal text-muted-foreground">· {e.cities.join(', ')}</span>
          </CardTitle>
          {e.is_pending ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
              Details pending
            </span>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Legal name"
            value={f.legal_name}
            onChange={(x) => setF({ ...f, legal_name: x.target.value })}
          />
          <Input
            placeholder="GSTIN"
            value={f.gstin}
            onChange={(x) => setF({ ...f, gstin: x.target.value })}
          />
          <Input
            className="sm:col-span-2"
            placeholder="Registered address"
            value={f.address}
            onChange={(x) => setF({ ...f, address: x.target.value })}
          />
          <Input
            placeholder="Signatory name"
            value={f.signatory_name}
            onChange={(x) => setF({ ...f, signatory_name: x.target.value })}
          />
          <Input
            placeholder="Signatory title"
            value={f.signatory_title}
            onChange={(x) => setF({ ...f, signatory_title: x.target.value })}
          />
        </div>
        <div>
          <Button
            size="sm"
            loading={save.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync({
                  id: e.id,
                  ...f,
                  address: f.address.trim() || null,
                  gstin: f.gstin.trim() || null,
                  is_pending: !(f.address.trim() && f.gstin.trim()),
                })
                toast.success('Saved')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Save failed')
              }
            }}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Position terms ────────────────────────────────────────────────────
function TermsTab() {
  const { data: rows = [], isLoading } = usePositionTerms()
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <CardDescription>
          Probation, notice, hours and week offs per position. These fill the offer and appointment letters.
        </CardDescription>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Position</th>
                <th className="px-2 py-2">Probation (mo)</th>
                <th className="px-2 py-2">Notice in probation (d)</th>
                <th className="px-2 py-2">Notice after (d)</th>
                <th className="px-2 py-2">Shift hrs</th>
                <th className="px-2 py-2">Week offs</th>
                <th className="px-2 py-2">Duties</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <TermsRow key={r.designation_code} r={r} />
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    {isLoading ? 'Loading…' : 'No positions.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function TermsRow({ r }: { r: PositionTerms & { designation_name: string } }) {
  const save = useSaveTerms()
  const [t, setT] = useState<PositionTerms>(r)
  const dirty =
    t.probation_months !== r.probation_months ||
    t.notice_days_probation !== r.notice_days_probation ||
    t.notice_days_confirmed !== r.notice_days_confirmed ||
    t.shift_hours !== r.shift_hours ||
    t.week_offs_per_month !== r.week_offs_per_month ||
    (t.duties ?? '') !== (r.duties ?? '')
  const num = (k: keyof PositionTerms) => (
    <Input
      type="number"
      min={0}
      className="h-8 w-20"
      value={String(t[k] ?? '')}
      onChange={(e) => setT({ ...t, [k]: Number(e.target.value) })}
    />
  )
  return (
    <tr>
      <td className="px-2 py-1.5 font-medium">{r.designation_name}</td>
      <td className="px-2 py-1.5">{num('probation_months')}</td>
      <td className="px-2 py-1.5">{num('notice_days_probation')}</td>
      <td className="px-2 py-1.5">{num('notice_days_confirmed')}</td>
      <td className="px-2 py-1.5">{num('shift_hours')}</td>
      <td className="px-2 py-1.5">{num('week_offs_per_month')}</td>
      <td className="px-2 py-1.5">
        <Input
          className="h-8 min-w-48"
          placeholder="e.g. running the cold station"
          value={t.duties ?? ''}
          onChange={(e) => setT({ ...t, duties: e.target.value || null })}
        />
      </td>
      <td className="px-2 py-1.5">
        {dirty ? (
          <Button
            size="sm"
            loading={save.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync({
                  designation_code: t.designation_code,
                  probation_months: t.probation_months,
                  notice_days_probation: t.notice_days_probation,
                  notice_days_confirmed: t.notice_days_confirmed,
                  shift_hours: t.shift_hours,
                  week_offs_per_month: t.week_offs_per_month,
                  duties: t.duties,
                })
                toast.success(`${r.designation_name} saved`)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Save failed')
              }
            }}
          >
            Save
          </Button>
        ) : null}
      </td>
    </tr>
  )
}
