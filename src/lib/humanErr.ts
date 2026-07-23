/**
 * Renders a helpful string for any error surface — Error instances,
 * Supabase PostgrestError objects, plain strings, arbitrary junk.
 *
 * The default `String(err)` on a PostgrestError yields "[object Object]"
 * because supabase-js doesn't extend Error; it hands back a plain object
 * with { message, code, details, hint }. Extract them here so every
 * "Failed to load" / toast.error can point at the actual DB reason.
 */
export function humanErr(err: unknown, fallback = 'Something went wrong'): string {
  if (err == null) return fallback
  if (err instanceof Error) return err.message || fallback
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    const parts: string[] = []
    if (typeof e.message === 'string' && e.message) parts.push(e.message)
    if (typeof e.code === 'string' && e.code) parts.push(`(${e.code})`)
    if (typeof e.hint === 'string' && e.hint) parts.push(`— ${e.hint}`)
    if (parts.length) return parts.join(' ')
    if (typeof e.details === 'string' && e.details) return e.details
    try { return JSON.stringify(err) } catch { return fallback }
  }
  return String(err)
}
