import Papa from 'papaparse'
import { createEphemeralClient, supabase } from '@/lib/supabase'
import { employeeCodeToEmail, isValidEmail } from '@/lib/identity'

/**
 * CSV columns the bulk-upload form accepts. Header row is required;
 * column order is irrelevant. Values are trimmed; empty strings count
 * as missing.
 */
export const BULK_COLUMNS = [
  'first_name',
  'last_name',
  'personal_email',
  'phone',
  'outlet_id',
  'designation_code',
  'hired_on',
  'monthly_salary',
  'date_of_birth',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'home_lat',
  'home_lng',
  'aadhaar_last4',
  'pan_last4',
  'pf_enabled',
  'pt_enabled',
  'esic_enabled',
] as const

export type BulkColumn = (typeof BULK_COLUMNS)[number]

export interface RawRow {
  rowIndex: number
  first_name: string
  last_name: string
  full_name: string
  personal_email: string
  phone: string
  outlet_id: string
  designation_code: string
  hired_on: string
  monthly_salary: string
  date_of_birth: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  home_lat: string
  home_lng: string
  aadhaar_last4: string
  pan_last4: string
  pf_enabled: string
  pt_enabled: string
  esic_enabled: string
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
  // Required: first_name + last_name + outlet_id, with one-cycle back-compat
  // for a legacy `full_name` column.
  const hasNamesSplit = headers.includes('first_name') && headers.includes('last_name')
  const hasFullName = headers.includes('full_name')
  if (!hasNamesSplit && !hasFullName) {
    throw new Error('Missing required columns. CSV needs "first_name" and "last_name" (or legacy "full_name"). See the template.')
  }
  if (!headers.includes('outlet_id')) {
    throw new Error('Missing required column "outlet_id". See the template.')
  }
  if (hasFullName && !hasNamesSplit) {
    console.warn('[bulkEmployees] CSV uses legacy "full_name" header — please switch to "first_name" + "last_name".')
  }
  if (!headers.includes('personal_email') && headers.includes('work_email')) {
    console.warn('[bulkEmployees] CSV uses legacy "work_email" header — please rename to "personal_email".')
  }
  return (result.data ?? []).map((row, i) => {
    let first = (row.first_name ?? '').trim()
    let last = (row.last_name ?? '').trim()
    if (!first && !last && row.full_name) {
      const parts = row.full_name.trim().split(/\s+/)
      first = parts.shift() ?? ''
      last = parts.join(' ')
    }
    return ({
      rowIndex: i + 2,
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`.trim(),
      personal_email: (row.personal_email ?? row.work_email ?? '').trim().toLowerCase(),
      phone: (row.phone ?? '').trim().replace(/\s+/g, ''),
      outlet_id: (row.outlet_id ?? '').trim(),
      designation_code: (row.designation_code ?? '').trim().toLowerCase(),
      hired_on: (row.hired_on ?? '').trim(),
      monthly_salary: (row.monthly_salary ?? '').trim(),
      date_of_birth: (row.date_of_birth ?? '').trim(),
      address: (row.address ?? '').trim(),
      emergency_contact_name: (row.emergency_contact_name ?? '').trim(),
      emergency_contact_phone: (row.emergency_contact_phone ?? '').trim().replace(/\s+/g, ''),
      home_lat: (row.home_lat ?? '').trim(),
      home_lng: (row.home_lng ?? '').trim(),
      aadhaar_last4: (row.aadhaar_last4 ?? '').trim(),
      pan_last4: (row.pan_last4 ?? '').trim().toUpperCase(),
      pf_enabled: (row.pf_enabled ?? '').trim().toLowerCase(),
      pt_enabled: (row.pt_enabled ?? '').trim().toLowerCase(),
      esic_enabled: (row.esic_enabled ?? '').trim().toLowerCase(),
    })
  })
}

function parseBool(s: string): boolean {
  return ['1', 'true', 'yes', 'y', 'tick', 'on'].includes(s)
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
    if (!r.first_name) errors.push('first_name is required')
    if (!r.last_name) errors.push('last_name is required')
    const normName = r.full_name.toLowerCase().replace(/\s+/g, ' ')
    if (normName && seenNames.has(normName)) errors.push('duplicate name in this CSV')
    seenNames.add(normName)
    if (!r.outlet_id) errors.push('outlet_id is required')
    else if (!ctx.validOutletIds.has(r.outlet_id))
      errors.push(`outlet_id "${r.outlet_id}" not found`)
    if (r.designation_code && !ctx.validDesignationCodes.has(r.designation_code))
      errors.push(`designation_code "${r.designation_code}" not found`)
    if (r.personal_email) {
      if (!isValidEmail(r.personal_email)) errors.push('personal_email looks invalid')
      else if (seenEmails.has(r.personal_email)) errors.push('duplicate personal_email in this CSV')
      else if (ctx.existingEmails.has(r.personal_email))
        errors.push('personal_email already exists in DB')
      seenEmails.add(r.personal_email)
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
    if (r.home_lat && Number.isNaN(Number(r.home_lat))) errors.push('home_lat must be a number')
    if (r.home_lng && Number.isNaN(Number(r.home_lng))) errors.push('home_lng must be a number')
    if (r.aadhaar_last4 && !/^[0-9]{4}$/.test(r.aadhaar_last4))
      errors.push('aadhaar_last4 must be 4 digits')
    if (r.pan_last4 && !/^[A-Z0-9]{4}$/.test(r.pan_last4))
      errors.push('pan_last4 must be 4 alphanumeric chars')
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
      .select('phone, personal_email')
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
  for (const e of (employeesRes.data ?? []) as Array<{ phone: string | null; personal_email: string | null }>) {
    if (e.phone) existingPhones.add(e.phone)
    if (e.personal_email) existingEmails.add(e.personal_email.toLowerCase())
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
        first_name: row.first_name.trim(),
        last_name: row.last_name.trim(),
        phone: row.phone || null,
        personal_email: row.personal_email || null,
        outlet_id: row.outlet_id,
        designation_code: row.designation_code || null,
        hired_on: row.hired_on || null,
        monthly_salary: row.monthly_salary ? Number(row.monthly_salary) : null,
        date_of_birth: row.date_of_birth || null,
        address: row.address || null,
        emergency_contact_name: row.emergency_contact_name || null,
        emergency_contact_phone: row.emergency_contact_phone || null,
        home_lat: row.home_lat ? Number(row.home_lat) : null,
        home_lng: row.home_lng ? Number(row.home_lng) : null,
        aadhaar_last4: row.aadhaar_last4 || null,
        pan_last4: row.pan_last4 || null,
        pf_enabled: parseBool(row.pf_enabled),
        pt_enabled: parseBool(row.pt_enabled),
        esic_enabled: parseBool(row.esic_enabled),
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
      first_name: r.first_name,
      last_name: r.last_name,
      full_name: r.full_name,
      employee_code: r.employee_code ?? '',
      pin: r.pin ?? '',
      outlet_id: r.outlet_id,
      personal_email: r.personal_email,
      phone: r.phone,
    })),
  )
  return csv
}

export const TEMPLATE_CSV = [
  BULK_COLUMNS.join(','),
  'Asha,Sharma,asha@example.com,9876500001,BND,cashier,2026-04-01,18000,1995-06-12,"Sion, Mumbai",Ravi Sharma,9876511111,19.0420,72.8607,1234,AB12,yes,yes,yes',
  'Ravi,Kumar,,9876500002,BND,helper,,15000,,,,,,,,,,,',
].join('\n')
