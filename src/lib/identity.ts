export const EMPLOYEE_EMAIL_DOMAIN = 'flax-hr.local'
export const ADMIN_EMAIL_DOMAIN = 'flaxitup.com'

export function normaliseEmployeeCode(code: string) {
  return code.trim().toUpperCase()
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
