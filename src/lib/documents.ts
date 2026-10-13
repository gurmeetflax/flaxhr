import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'

// Documents employees sign: templates, the employing company per state,
// terms per position, the salary breakdown and the send step.

export type DocKind =
  | 'offer_letter'
  | 'appointment_letter'
  | 'attendance_policy'
  | 'conduct_policy'
  | 'nda'
  | 'deduction_consent'
export type SignMethod = 'in_app' | 'aadhaar'
export type SignStatus = 'sent' | 'viewed' | 'signed' | 'declined' | 'cancelled'

export interface DocTemplate {
  id: string
  kind: DocKind
  title: string
  body: string
  sign_method: SignMethod
  audience: 'all' | 'new_joiner' | 'uniform'
  is_active: boolean
  version: number
}

export interface LegalEntity {
  id: string
  state: string
  cities: string[]
  legal_name: string
  trade_name: string
  address: string | null
  gstin: string | null
  signatory_name: string
  signatory_title: string
  signature_path: string | null
  is_pending: boolean
}

export interface PositionTerms {
  designation_code: string
  probation_months: number
  notice_days_probation: number
  notice_days_confirmed: number
  shift_hours: number
  week_offs_per_month: number
  duties: string | null
}

export interface SignRequestRow {
  id: string
  employee_id: string
  kind: DocKind
  title: string
  sign_method: SignMethod
  status: SignStatus
  sent_at: string
  viewed_at: string | null
  signed_at: string | null
  signed_via: SignMethod | null
  signed_pdf_path: string | null
  declined_reason: string | null
  employee_code: string
  employee_name: string
  outlet_name: string | null
}

export interface DocEmployee {
  id: string
  employee_code: string
  full_name: string
  designation_code: string | null
  designation_name: string | null
  outlet_city: string | null
  hired_on: string | null
  monthly_salary: number | null
  pf_enabled: boolean
  pt_enabled: boolean
  esic_enabled: boolean
}

export const KIND_LABEL: Record<DocKind, string> = {
  offer_letter: 'Offer letter',
  appointment_letter: 'Appointment letter',
  attendance_policy: 'Attendance policy',
  conduct_policy: 'Leave & conduct policy',
  nda: 'Confidentiality / NDA',
  deduction_consent: 'Deduction consent',
}

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'name', label: 'Full name' },
  { key: 'first_name', label: 'First name' },
  { key: 'employee_code', label: 'Employee code' },
  { key: 'designation', label: 'Designation' },
  { key: 'city', label: 'City' },
  { key: 'joining_date', label: 'Joining date' },
  { key: 'gross_monthly', label: 'Gross monthly salary' },
  { key: 'ctc_annual', label: 'Annual CTC' },
  { key: 'salary_table', label: 'Salary breakdown table' },
  { key: 'probation_months', label: 'Probation (months)' },
  { key: 'notice_probation', label: 'Notice in probation (days)' },
  { key: 'notice_confirmed', label: 'Notice after confirmation (days)' },
  { key: 'shift_hours', label: 'Shift hours' },
  { key: 'week_offs', label: 'Week offs / month' },
  { key: 'duties_sentence', label: 'Position duties' },
  { key: 'company_name', label: 'Company legal name' },
  { key: 'offer_valid_till', label: 'Offer valid till' },
  { key: 'uniform_amount', label: 'Uniform amount' },
  { key: 'uniform_months', label: 'Uniform months' },
  { key: 'uniform_monthly', label: 'Uniform monthly' },
]

// ── Queries ────────────────────────────────────────────────────────────

export function useTemplates() {
  return useQuery<DocTemplate[]>({
    queryKey: ['doc-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.schema('core').from('doc_templates').select('*').order('kind')
      if (error) throw error
      return (data ?? []) as DocTemplate[]
    },
  })
}

export function useSaveTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: Pick<DocTemplate, 'id' | 'title' | 'body' | 'sign_method' | 'is_active' | 'version'>) => {
      const { error } = await supabase
        .schema('core')
        .from('doc_templates')
        .update({
          title: t.title,
          body: t.body,
          sign_method: t.sign_method,
          is_active: t.is_active,
          version: t.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-templates'] }),
  })
}

export function useEntities() {
  return useQuery<LegalEntity[]>({
    queryKey: ['legal-entities'],
    queryFn: async () => {
      const { data, error } = await supabase.schema('core').from('legal_entities').select('*').order('state')
      if (error) throw error
      return (data ?? []) as LegalEntity[]
    },
  })
}

export function useSaveEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: Partial<LegalEntity> & { id: string }) => {
      const { id, ...patch } = e
      const { error } = await supabase
        .schema('core')
        .from('legal_entities')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['legal-entities'] }),
  })
}

export async function uploadDirectorSignature(entityIds: string[], file: File): Promise<void> {
  const path = `director/${crypto.randomUUID()}.png`
  const { error } = await supabase.storage.from('signatures').upload(path, file, { contentType: file.type || 'image/png' })
  if (error) throw error
  const { error: uErr } = await supabase
    .schema('core')
    .from('legal_entities')
    .update({ signature_path: path, updated_at: new Date().toISOString() })
    .in('id', entityIds)
  if (uErr) throw uErr
}

export function usePositionTerms() {
  return useQuery<(PositionTerms & { designation_name: string })[]>({
    queryKey: ['position-terms'],
    queryFn: async () => {
      const [{ data: terms, error }, { data: des, error: dErr }] = await Promise.all([
        supabase.schema('core').from('position_terms').select('*'),
        supabase.schema('core').from('designations').select('code, name'),
      ])
      if (error) throw error
      if (dErr) throw dErr
      const names = new Map((des ?? []).map((d) => [d.code as string, d.name as string]))
      return ((terms ?? []) as PositionTerms[])
        .map((t) => ({ ...t, designation_name: names.get(t.designation_code) ?? t.designation_code }))
        .sort((a, b) => a.designation_name.localeCompare(b.designation_name))
    },
  })
}

export function useSaveTerms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: PositionTerms) => {
      const { error } = await supabase
        .schema('core')
        .from('position_terms')
        .update({ ...t, updated_at: new Date().toISOString() })
        .eq('designation_code', t.designation_code)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['position-terms'] }),
  })
}

export function useSignRequests(filter: { employeeId?: string; status?: SignStatus | '' } = {}) {
  return useQuery<SignRequestRow[]>({
    queryKey: ['sign-requests', filter],
    queryFn: async () => {
      let q = supabase.from('v_sign_requests').select('*').order('sent_at', { ascending: false }).limit(1000)
      if (filter.employeeId) q = q.eq('employee_id', filter.employeeId)
      if (filter.status) q = q.eq('status', filter.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as SignRequestRow[]
    },
  })
}

export function useCancelRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.schema('core').from('sign_requests').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign-requests'] }),
  })
}

// ── Salary breakdown ───────────────────────────────────────────────────

export interface Rates {
  pf_rate_pct: number
  esic_rate_pct: number
  esic_employer_pct: number
  esic_max_gross: number
  pt_amount: number
  basic_pct: number
  hra_pct: number
}

export const DEFAULT_RATES: Rates = {
  pf_rate_pct: 12,
  esic_rate_pct: 0.75,
  esic_employer_pct: 3.25,
  esic_max_gross: 21000,
  pt_amount: 200,
  basic_pct: 50,
  hra_pct: 20,
}

export interface Breakdown {
  basic: number
  hra: number
  special: number
  gross: number
  pf_employee: number
  esic_employee: number
  pt: number
  net: number
  pf_employer: number
  esic_employer: number
  ctc_monthly: number
  ctc_annual: number
}

const PF_WAGE_CEILING = 15000

export function salaryBreakdown(
  gross: number,
  flags: { pf: boolean; esic: boolean; pt: boolean },
  r: Rates = DEFAULT_RATES,
): Breakdown {
  const round = (n: number) => Math.round(n)
  const basic = round((gross * r.basic_pct) / 100)
  const hra = round((gross * r.hra_pct) / 100)
  const special = gross - basic - hra
  const pfWage = Math.min(basic, PF_WAGE_CEILING)
  const pf_employee = flags.pf ? round((pfWage * r.pf_rate_pct) / 100) : 0
  const pf_employer = pf_employee
  const esicApplies = flags.esic && gross <= r.esic_max_gross
  const esic_employee = esicApplies ? Math.ceil((gross * r.esic_rate_pct) / 100) : 0
  const esic_employer = esicApplies ? Math.ceil((gross * r.esic_employer_pct) / 100) : 0
  const pt = flags.pt ? r.pt_amount : 0
  const ctc_monthly = gross + pf_employer + esic_employer
  return {
    basic,
    hra,
    special,
    gross,
    pf_employee,
    esic_employee,
    pt,
    net: gross - pf_employee - esic_employee - pt,
    pf_employer,
    esic_employer,
    ctc_monthly,
    ctc_annual: ctc_monthly * 12,
  }
}

export function inr(n: number): string {
  return n.toLocaleString('en-IN')
}

function salaryTableHtml(b: Breakdown): string {
  const row = (label: string, amount: number, strong = false) =>
    `<tr><td>${strong ? `<b>${label}</b>` : label}</td><td class="amt">${strong ? `<b>₹${inr(amount)}</b>` : `₹${inr(amount)}`}</td><td class="amt">₹${inr(amount * 12)}</td></tr>`
  const deductions = [
    b.pf_employee ? row('Less: Employee PF', b.pf_employee) : '',
    b.esic_employee ? row('Less: Employee ESIC', b.esic_employee) : '',
    b.pt ? row('Less: Professional tax', b.pt) : '',
  ].join('')
  const employer = [
    b.pf_employer ? row('Employer PF contribution', b.pf_employer) : '',
    b.esic_employer ? row('Employer ESIC contribution', b.esic_employer) : '',
  ].join('')
  return `<table class="salary"><thead><tr><th>Component</th><th class="amt">Monthly</th><th class="amt">Annual</th></tr></thead><tbody>
${row('Basic', b.basic)}${row('House rent allowance', b.hra)}${row('Special allowance', b.special)}
${row('Gross salary', b.gross, true)}
${deductions}${deductions ? row('Net take-home (approx.)', b.net, true) : ''}
${employer}${row('Cost to company (CTC)', b.ctc_monthly, true)}
</tbody></table>`
}

// ── Merge data + rendering ─────────────────────────────────────────────

export interface MergeContext {
  employee: DocEmployee
  entity: LegalEntity | null
  terms: PositionTerms | null
  rates: Rates
  uniform: { total_amount: number; months_total: number; monthly_amount: number } | null
  joiningDate?: string // override (offer letters)
}

export function entityForCity(entities: LegalEntity[], city: string | null): LegalEntity | null {
  const c = (city ?? '').toLowerCase()
  return entities.find((e) => e.cities.includes(c)) ?? entities.find((e) => e.state === 'Maharashtra') ?? null
}

export function mergeData(ctx: MergeContext): Record<string, string> {
  const e = ctx.employee
  const gross = Number(e.monthly_salary ?? 0)
  const b = salaryBreakdown(gross, { pf: e.pf_enabled, esic: e.esic_enabled, pt: e.pt_enabled }, ctx.rates)
  const t = ctx.terms
  const joining = ctx.joiningDate ?? e.hired_on
  const city = e.outlet_city ? e.outlet_city[0].toUpperCase() + e.outlet_city.slice(1) : ''
  return {
    name: e.full_name,
    first_name: e.full_name.split(' ')[0],
    employee_code: e.employee_code,
    designation: e.designation_name ?? '',
    city,
    joining_date: joining ? format(parseISO(joining), 'd MMMM yyyy') : '',
    date: format(new Date(), 'd MMMM yyyy'),
    gross_monthly: inr(gross),
    ctc_annual: inr(b.ctc_annual),
    salary_table: salaryTableHtml(b),
    probation_months: String(t?.probation_months ?? 3),
    notice_probation: String(t?.notice_days_probation ?? 7),
    notice_confirmed: String(t?.notice_days_confirmed ?? 15),
    shift_hours: String(t?.shift_hours ?? 9),
    week_offs: String(t?.week_offs_per_month ?? 4),
    duties_sentence: t?.duties ? `, including: ${t.duties}` : '',
    company_name: ctx.entity?.legal_name ?? '',
    offer_valid_till: format(addDays(new Date(), 7), 'd MMMM yyyy'),
    uniform_amount: ctx.uniform ? inr(ctx.uniform.total_amount) : '',
    uniform_months: ctx.uniform ? String(ctx.uniform.months_total) : '',
    uniform_monthly: ctx.uniform ? inr(ctx.uniform.monthly_amount) : '',
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Fills {{placeholders}}. Blank values are flagged so HR spots them in preview.
export function fillTemplate(body: string, data: Record<string, string>): { html: string; missing: string[] } {
  const missing = new Set<string>()
  const html = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = data[key]
    if (key === 'salary_table' || key === 'duties_sentence') return v ?? ''
    if (v == null || v === '') {
      missing.add(key)
      return `<mark class="missing">[${key}]</mark>`
    }
    return esc(v)
  })
  return { html, missing: [...missing] }
}

export const LETTER_CSS = `
.letter{font-family:Georgia,'Times New Roman',serif;color:#111827;font-size:14px;line-height:1.6;max-width:720px;margin:0 auto;padding:40px 48px;background:#fff}
.letter .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #65a30d;padding-bottom:12px;margin-bottom:20px}
.letter .head img{height:44px}
.letter .co{text-align:right;font-family:system-ui,sans-serif;font-size:11px;color:#475569;max-width:360px}
.letter .co b{color:#111827;font-size:12px}
.letter h1{font-size:20px;font-weight:700;margin:8px 0 16px}
.letter h3{font-size:15px;font-weight:700;margin:18px 0 6px}
.letter p{margin:0 0 10px}
.letter ul{list-style:disc;padding-left:22px;margin:0 0 10px}
.letter ol{list-style:decimal;padding-left:22px;margin:0 0 10px}
.letter li{margin:3px 0}
.letter table.salary{border-collapse:collapse;width:100%;margin:8px 0 12px;font-family:system-ui,sans-serif;font-size:13px}
.letter table.salary th,.letter table.salary td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}
.letter table.salary th{background:#f8fafc}
.letter table.salary .amt{text-align:right;white-space:nowrap}
.letter .sign{display:flex;justify-content:space-between;gap:24px;margin-top:36px;font-family:system-ui,sans-serif;font-size:12px}
.letter .sign .box{width:45%}
.letter .sign img{height:56px;display:block;margin-bottom:4px}
.letter .sign .line{border-top:1px solid #9ca3af;padding-top:4px}
.letter .pending{height:56px;display:flex;align-items:flex-end;color:#9ca3af;font-style:italic}
.letter mark.missing{background:#fde68a;color:#92400e;padding:0 2px}
`

// Full letter: letterhead, title, body, company signature and the
// employee block. The data-slot elements are filled at signing.
export function letterHtml(opts: {
  entity: LegalEntity | null
  title: string
  body: string
  date: string
  directorSignatureDataUrl?: string | null
  employeeName: string
}): string {
  const e = opts.entity
  return `<div class="letter">
<div class="head"><img src="https://hr.flaxfoods.in/flax-logo.png" alt="Flax"/>
<div class="co"><b>${esc(e?.legal_name ?? 'Health and Beyond Foods Private Limited')}</b><br/>${esc(e?.address ?? '')}${e?.gstin ? `<br/>GSTIN ${esc(e.gstin)}` : ''}</div></div>
<div style="font-family:system-ui,sans-serif;font-size:12px;color:#475569">Date: ${esc(opts.date)}</div>
<h1>${esc(opts.title)}</h1>
${opts.body}
<div class="sign">
<div class="box">For ${esc(e?.legal_name ?? '')}<br/>
${opts.directorSignatureDataUrl ? `<img src="${opts.directorSignatureDataUrl}" alt="signature"/>` : '<div class="pending">(signature)</div>'}
<div class="line"><b>${esc(e?.signatory_name ?? 'Gurmeet Singh')}</b><br/>${esc(e?.signatory_title ?? 'Director')}</div></div>
<div class="box">Accepted and agreed<br/><div class="pending" data-slot="employee-signature">Awaiting signature</div>
<div class="line"><b>${esc(opts.employeeName)}</b><br/><span data-slot="employee-signed-on">Not yet signed</span></div></div>
</div></div>`
}

async function blobToDataUrl(b: Blob): Promise<string> {
  return await new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })
}

export async function directorSignatureDataUrl(entity: LegalEntity | null): Promise<string | null> {
  if (!entity?.signature_path) return null
  const { data, error } = await supabase.storage.from('signatures').download(entity.signature_path)
  if (error || !data) return null
  return await blobToDataUrl(data)
}

// Everything needed to render documents for one employee.
export async function loadDocContext(employeeId: string) {
  const [empR, entR, ratesR, uniR] = await Promise.all([
    supabase
      .from('v_employees')
      .select('id, employee_code, full_name, designation_code, designation_name, outlet_city, hired_on, monthly_salary, pf_enabled, pt_enabled, esic_enabled')
      .eq('id', employeeId)
      .single(),
    supabase.schema('core').from('legal_entities').select('*'),
    supabase.from('v_app_settings').select('key, value').in('key', ['pf_rate_pct', 'esic_rate_pct', 'esic_max_gross', 'pt_amount']),
    supabase
      .schema('core')
      .from('deductions')
      .select('total_amount, months_total, monthly_amount')
      .eq('employee_id', employeeId)
      .eq('kind', 'uniform')
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  if (empR.error) throw empR.error
  if (entR.error) throw entR.error
  const employee = empR.data as DocEmployee
  const rates = { ...DEFAULT_RATES }
  for (const r of (ratesR.data ?? []) as { key: keyof Rates; value: number }[]) {
    if (typeof r.value === 'number') rates[r.key] = r.value
  }
  const { data: terms } = employee.designation_code
    ? await supabase.schema('core').from('position_terms').select('*').eq('designation_code', employee.designation_code).maybeSingle()
    : { data: null }
  const entity = entityForCity((entR.data ?? []) as LegalEntity[], employee.outlet_city)
  const u = (uniR.data ?? [])[0] as MergeContext['uniform'] | undefined
  return { employee, entity, rates, terms: (terms as PositionTerms | null) ?? null, uniform: u ?? null }
}

export function renderForEmployee(
  tpl: DocTemplate,
  ctx: Awaited<ReturnType<typeof loadDocContext>>,
  signatureDataUrl: string | null,
  joiningDate?: string,
) {
  const data = mergeData({ ...ctx, joiningDate })
  const { html: body, missing } = fillTemplate(tpl.body, data)
  const html = letterHtml({
    entity: ctx.entity,
    title: tpl.title,
    body,
    date: data.date,
    directorSignatureDataUrl: signatureDataUrl,
    employeeName: ctx.employee.full_name,
  })
  return { html, data, missing }
}

export function useSendDocuments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      employeeId,
      templates,
      joiningDate,
    }: {
      employeeId: string
      templates: DocTemplate[]
      joiningDate?: string
    }) => {
      const ctx = await loadDocContext(employeeId)
      const sig = await directorSignatureDataUrl(ctx.entity)
      const rows = templates.map((t) => {
        const r = renderForEmployee(t, ctx, sig, joiningDate)
        return {
          employee_id: employeeId,
          template_id: t.id,
          kind: t.kind,
          title: t.title,
          template_version: t.version,
          rendered_html: r.html,
          merge_data: r.data,
          sign_method: t.sign_method,
        }
      })
      const { error } = await supabase.schema('core').from('sign_requests').insert(rows)
      if (error) {
        if (error.code === '23505') throw new Error('One of these documents is already waiting for this employee to sign.')
        throw error
      }
      return rows.length
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign-requests'] }),
  })
}
