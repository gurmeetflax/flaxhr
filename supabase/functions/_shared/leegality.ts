// Leegality (Aadhaar eSign) helpers shared by esign-start and
// leegality-webhook. v3 API: X-Auth-Token header, JSON bodies.
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime.

export const LEEGALITY_ENV = (Deno.env.get('LEEGALITY_ENV') ?? 'sandbox').trim().toLowerCase()
export const LEEGALITY_BASE =
  LEEGALITY_ENV === 'production' ? 'https://app1.leegality.com/api' : 'https://sandbox.leegality.com/api'
export const LEEGALITY_TOKEN = (Deno.env.get('LEEGALITY_AUTH_TOKEN') ?? '').trim()
export const LEEGALITY_SALT = (Deno.env.get('LEEGALITY_PRIVATE_SALT') ?? '').trim()
export const LEEGALITY_PROFILE_ID = (Deno.env.get('LEEGALITY_PROFILE_ID') ?? '').trim()

export async function leegality(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${LEEGALITY_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'X-Auth-Token': LEEGALITY_TOKEN, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON error page */
  }
  return { ok: res.ok, status: res.status, json, text }
}

// Leegality wraps results as { status, messages, data }. Field names vary a
// little between versions, so look values up by key anywhere in the tree.
export function findKey(obj: any, test: (k: string, v: any) => boolean): any {
  if (!obj || typeof obj !== 'object') return undefined
  for (const [k, v] of Object.entries(obj)) {
    if (test(k, v)) return v
  }
  for (const v of Object.values(obj)) {
    const r = findKey(v, test)
    if (r !== undefined) return r
  }
  return undefined
}

// Base64 PDFs anywhere in the response ("JVBERi0" is "%PDF-").
export function findPdfs(obj: any, out: { key: string; b64: string }[] = [], key = ''): { key: string; b64: string }[] {
  if (typeof obj === 'string') {
    if (obj.startsWith('JVBERi0') && obj.length > 500) out.push({ key, b64: obj })
  } else if (Array.isArray(obj)) {
    obj.forEach((v) => findPdfs(v, out, key))
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) findPdfs(v, out, k)
  }
  return out
}

// Copy of a response without the (huge) base64 files, for the audit log.
export function stripFiles(obj: any): any {
  if (typeof obj === 'string') return obj.length > 500 ? `[${obj.length} chars]` : obj
  if (Array.isArray(obj)) return obj.map(stripFiles)
  if (obj && typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, stripFiles(v)]))
  return obj
}

export function messages(json: any, text: string): string {
  const m = json?.messages ?? json?.message
  if (Array.isArray(m)) return m.map((x: any) => x?.message ?? x?.code ?? JSON.stringify(x)).join('; ')
  if (typeof m === 'string') return m
  return text.slice(0, 300)
}

export async function hmacSha1Hex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } })
}
