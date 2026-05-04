export const EMPLOYEE_EMAIL_DOMAIN = 'flax-hr.local'
export const ADMIN_EMAIL_DOMAIN = 'flaxitup.com'

/**
 * Normalises an employee code to canonical FLAX#### form.
 *  flax 1     -> FLAX0001
 *  FLAX-0001  -> FLAX0001
 *  flax0001   -> FLAX0001
 * Hyphens, spaces and case are forgiven; the numeric tail is padded to 4.
 * Result always matches /^FLAX[0-9]{4}$/ when the input has a numeric tail.
 */
export function normaliseEmployeeCode(code: string) {
  const cleaned = code.trim().toUpperCase().replace(/[\s-]+/g, '')
  if (!cleaned.startsWith('FLAX')) return cleaned // let validators reject
  const rest = cleaned.slice(4)
  if (!/^[0-9]+$/.test(rest)) return cleaned
  return `FLAX${rest.padStart(4, '0')}`
}

export function employeeCodeToEmail(code: string) {
  return `${normaliseEmployeeCode(code).toLowerCase()}@${EMPLOYEE_EMAIL_DOMAIN}`
}

export function emailToEmployeeCode(email: string | null | undefined): string | null {
  if (!email) return null
  const suffix = `@${EMPLOYEE_EMAIL_DOMAIN}`
  if (!email.endsWith(suffix)) return null
  const local = email.slice(0, -suffix.length).toUpperCase()
  return /^FLAX[0-9]{4}$/.test(local) ? local : null
}

export function isFlaxitupEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${ADMIN_EMAIL_DOMAIN}`)
}

// Basic shape check. Not RFC-complete — just catches typos.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email.trim())
}

// Parse a free-text field like " a@x.com, b@y.com ,c@z.com " into a clean
// array of lowercased, trimmed, de-duped emails.
export function parseEmails(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(/[,\n]/)) {
    const e = raw.trim().toLowerCase()
    if (!e) continue
    if (seen.has(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

export function joinEmails(emails: string[] | null | undefined): string {
  return (emails ?? []).join(', ')
}
