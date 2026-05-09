import Papa from 'papaparse'
import { createEphemeralClient, supabase } from '@/lib/supabase'
import { employeeCodeToEmail, isValidEmail } from '@/lib/identity'

/**
 * CSV columns the bulk-upload form accepts. Header row is required;
 * column order is irrelevant. Values are trimmed; empty strings count
 * as missing.
 */
export const BULK_COLUMNS = [
  'full_name',
  'work_email',
  'phone',
  'outlet_id',
  'designation_code',
  'hired_on',
  'monthly_salary',
  'date_of_birth',
] as const

export type BulkColumn = (typeof BULK_COLUMNS)[number]

export interface RawRow {
  rowIndex: number
  full_name: string
  work_email: string
  phone: string
  outlet_id: string
  designation_code: string
  hired_on: string
  monthly_salary: string
  date_of_birth: string
}

export interface ValidatedRow extends RawRow {
  errors: string[]
}

export interface ImportedRow extends ValidatedRow {
  status: 'pending' | 'success' | 'error'
  employee_code?: string
  pin?: string
  error?: string
}

/**
 * Parses a CSV string into rows. Throws on malformed input or missing
 * required header columns.
 */
export function parseCsv(text: string): RawRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  if (result.errors.length > 0) {
    const first = result.errors[0]
    throw new Error(`CSV parse error on row ${first.row}: ${first.message}`)
  }
  const headers = result.meta.fields ?? []
  const required: BulkColumn[] = ['full_name', 'outlet_id']
  for (const r of required) {
    if (!headers.includes(r)) {
      throw new Error(`Missing required column "${r}". See the template.`)
    }
  }
  return (result.data ?? []).map((row, i) => ({
    rowIndex: i + 2, // +2 for header row + 1-based
    full_name: (row.full_name ?? '').trim(),
    work_email: (row.work_email ?? '').trim().toLowerCase(),
    phone: (row.phone ?? '').trim().replace(/\s+/g, ''),
    outlet_id: (row.outlet_id ?? '').trim(),
    designation_code: (row.designation_code ?? '').trim().toLowerCase(),
    hired_on: (row.hired_on ?? '').trim(),
    monthly_salary: (row.monthly_salary ?? '').trim(),
    date_of_birth: (row.date_of_birth ?? '').trim(),
  }))
}

export interface ValidateContext {
  validOutletIds: Set<string>
  validDesignationCodes: Set<string>
  existingPhones: Set<string>
  existingEmails: Set<string>
}

export function validateRows(rows: RawRow[], ctx: ValidateContext): ValidatedRow[] {
  const seenPhones = new Set<string>()
  const seenEmails = new Set<string>()
  const seenNames = new Set<string>()
  return rows.map((r) => {
    const errors: string[] = []
    if (!r.full_name) errors.push('full_name is required')
    const normName = r.full_name.toLowerCase().replace(/\s+/g, ' ')
    if (normName && seenNames.has(normName)) errors.push('duplicate full_name in this CSV')
    seenNames.add(normName)
    if (!r.outlet_id) errors.push('outlet_id is required')
    else if (!ctx.validOutletIds.has(r.outlet_id))
      errors.push(`outlet_id "${r.outlet_id}" not found`)
    if (r.designation_code && !ctx.validDesignationCodes.has(r.designation_code))
      errors.push(`designation_code "${r.designation_code}" not found`)
    if (r.work_email) {
      if (!isValidEmail(r.work_email)) errors.push('work_email looks invalid')
      else if (seenEmails.has(r.work_email)) errors.push('duplicate work_email in this CSV')
      else if (ctx.existingEmails.has(r.work_email))
        errors.push('work_email already exists in DB')
      seenEmails.add(r.work_email)
    }
    if (r.phone) {
      if (seenPhones.has(r.phone)) errors.push('duplicate phone in this CSV')
      else if (ctx.existingPhones.has(r.phone)) errors.push('phone already exists in DB')
      seenPhones.add(r.phone)
    }
    if (r.hired_on && !/^\d{4}-\d{2}-\d{2}$/.test(r.hired_on))
      errors.push('hired_on must be YYYY-MM-DD')
    if (r.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth))
      errors.push('date_of_birth must be YYYY-MM-DD')
    if (r.monthly_salary) {
      const n = Number(r.monthly_salary)
      if (Number.isNaN(n) || n < 0) errors.push('monthly_salary must be a non-negative number')
    }
    return { ...r, errors }
  })
}

/**
 * Fetches existing phones+emails+outlets so we can dup-check client-side
 * before any server insertion. Cheap because both are indexed.
 */
export async function fetchValidationContext(): Promise<ValidateContext> {
  const [outletsRes, employeesRes, designationsRes] = await Promise.all([
    supabase.from('flax_outlets').select('id').eq('active', true),
    supabase
      .schema('core' as never)
      .from('employees')
      .select('phone, work_email')
      .is('deleted_at', null),
    supabase.from('v_designations').select('code').eq('is_active', true),
  ])
  if (outletsRes.error) throw outletsRes.error
  if (employeesRes.error) throw employeesRes.error
  if (designationsRes.error) throw designationsRes.error
  const validOutletIds = new Set((outletsRes.data ?? []).map((o) => o.id as string))
  const validDesignationCodes = new Set(
    (designationsRes.data ?? []).map((d) => d.code as string),
  )
  const existingPhones = new Set<string>()
  const existingEmails = new Set<string>()
  for (const e of (employeesRes.data ?? []) as Array<{ phone: string | null; work_email: string | null }>) {
    if (e.phone) existingPhones.add(e.phone)
    if (e.work_email) existingEmails.add(e.work_email.toLowerCase())
  }
  return { validOutletIds, validDesignationCodes, existingPhones, existingEmails }
}

/** Cryptographically random 6-digit PIN. */
export function generatePin(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

/**
 * Imports a single validated row: reserves an employee_code, signs up the
 * auth user with that synthetic email + the generated PIN, inserts the
 * employees row, grants the 'employee' role for the outlet.
 *
 * Mirrors CreateEmployeePage end-to-end but uses an ephemeral client so
 * the admin's session is never replaced. Errors are returned, not thrown,
 * so the caller can render per-row results.
 */
export async function importOne(row: ValidatedRow): Promise<ImportedRow> {
  if (row.errors.length > 0) {
    return { ...row, status: 'error', error: row.errors.join('; ') }
  }
  try {
    const { data: reservedCode, error: codeErr } = await supabase.rpc('next_employee_code')
    if (codeErr) throw codeErr
    const code = reservedCode as string
    const pin = generatePin()
    const tmp = createEphemeralClient()
    const { data: signUp, error: signUpErr } = await tmp.auth.signUp({
      email: employeeCodeToEmail(code),
      password: pin,
    })
    if (signUpErr) throw signUpErr
    const userId = signUp.user?.id
    if (!userId) throw new Error('Sign-up returned no user id')

    const { error: empErr } = await supabase
      .schema('core' as never)
      .from('employees')
      .insert({
        employee_code: code,
        user_id: userId,
        full_name: row.full_name.replace(/\s+/g, ' '),
        phone: row.phone || null,
        work_email: row.work_email || null,
        outlet_id: row.outlet_id,
        designation_code: row.designation_code || null,
        hired_on: row.hired_on || null,
        monthly_salary: row.monthly_salary ? Number(row.monthly_salary) : null,
        date_of_birth: row.date_of_birth || null,
      })
    if (empErr) throw empErr

    const { error: roleErr } = await supabase
      .schema('core' as never)
      .from('user_roles')
      .insert({ user_id: userId, role: 'employee', outlet_id: row.outlet_id })
    if (roleErr) throw roleErr

    return { ...row, status: 'success', employee_code: code, pin }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { ...row, status: 'error', error: msg }
  }
}

/** Builds a CSV blob with the issued codes + PINs for the admin to share. */
export function resultsToCsv(results: ImportedRow[]): string {
  const ok = results.filter((r) => r.status === 'success')
  const csv = Papa.unparse(
    ok.map((r) => ({
      full_name: r.full_name,
      employee_code: r.employee_code ?? '',
      pin: r.pin ?? '',
      outlet_id: r.outlet_id,
      work_email: r.work_email,
      phone: r.phone,
    })),
  )
  return csv
}

export const TEMPLATE_CSV = [
  BULK_COLUMNS.join(','),
  'Asha Sharma,asha@flaxitup.com,9876500001,BND,cashier,2026-04-01,18000,1995-06-12',
  'Ravi Kumar,,9876500002,BND,helper,,15000,',
].join('\n')
