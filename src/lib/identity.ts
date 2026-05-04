export const EMPLOYEE_EMAIL_DOMAIN = 'flax-hr.local'
export const ADMIN_EMAIL_DOMAIN = 'flaxitup.com'

/**
 * Normalises an employee code to canonical hyphenated form.
 *  FLXBND0001  -> FLX-BND-0001
 *  flx-bnd-1   -> FLX-BND-0001 (also pads numeric to 4)
 *  FLX-BND-001 -> FLX-BND-0001
 * Hyphens, spaces and case are forgiven; result always matches
 * /^FLX-[A-Z0-9]{2,6}-[0-9]{4}$/.
 */
export function normaliseEmployeeCode(code: string) {
  const cleaned = code.trim().toUpperCase().replace(/[\s-]+/g, '')
  if (!cleaned.startsWith('FLX')) return cleaned // let validators reject
  const rest = cleaned.slice(3)
  // Numeric tail
  const m = /^([A-Z0-9]{2,6}?)([0-9]+)$/.exec(rest)
  if (!m) return cleaned
  const outlet = m[1]
  const num = m[2].padStart(4, '0')
  return `FLX-${outlet}-${num}`
}

export function employeeCodeToEmail(code: string) {
  return `${normaliseEmployeeCode(code).toLowerCase()}@${EMPLOYEE_EMAIL_DOMAIN}`
}

export function emailToEmployeeCode(email: string | null | undefined): string | null {
  if (!email) return null
  const suffix = `@${EMPLOYEE_EMAIL_DOMAIN}`
  if (!email.endsWith(suffix)) return null
  return email.slice(0, -suffix.length).toUpperCase()
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
