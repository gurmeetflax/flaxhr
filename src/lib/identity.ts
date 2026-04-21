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
