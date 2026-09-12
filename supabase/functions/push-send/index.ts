// Push notification sender — reads targets from core.device_tokens and
// posts to Firebase Cloud Messaging (Android) via the HTTP v1 API.
//
// Invoked from other functions (card-alert, leave-decided, shift-reminder)
// or directly via supabase.functions.invoke('push-send', { body: {...} }).
//
// Payload:
//   { user_ids: string[]        — Supabase auth.user_id list
//   , title: string
//   , body: string
//   , data?: Record<string,string>  — deep-link path, ids, etc.
//   }
//
// Requires the following Supabase secrets:
//   FCM_SERVICE_ACCOUNT_JSON  — the full JSON blob from Firebase Console
//                               → Project Settings → Service Accounts
//                               → Generate new private key
//   FCM_PROJECT_ID            — e.g. flax-hr
//
// Deployed with verify_jwt = true so only signed-in callers (or other
// SECURITY-DEFINER functions passing the service_role JWT) can trigger it.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') ?? ''
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? ''

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

interface PushPayload {
  user_ids: string[]
  title: string
  body: string
  data?: Record<string, string>
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  if (!FCM_PROJECT_ID || !FCM_SERVICE_ACCOUNT_JSON) {
    return json(500, { error: 'FCM secrets not configured' })
  }

  let payload: PushPayload
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'invalid json' })
  }
  if (!payload.user_ids?.length || !payload.title || !payload.body) {
    return json(400, { error: 'user_ids, title, body required' })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: tokens, error } = await sb
    .schema('core')
    .from('device_tokens')
    .select('token, platform')
    .in('user_id', payload.user_ids)
    .in('platform', ['android', 'ios'])

  if (error) return json(500, { error: error.message })
  if (!tokens?.length) return json(200, { ok: true, sent: 0, skipped: 'no_tokens' })

  const accessToken = await getFcmAccessToken()
  const results = await Promise.allSettled(
    tokens.map((t: any) => sendFcm(accessToken, t.token, payload)),
  )

  const stale: string[] = []
  let sent = 0, failed = 0
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      if (r.value.ok) sent++
      else {
        failed++
        if (r.value.stale) stale.push(tokens[i].token)
      }
    } else {
      failed++
    }
  }

  // Reap stale/invalid tokens so we don't keep pinging them.
  if (stale.length) {
    await sb.schema('core').from('device_tokens').delete().in('token', stale)
  }

  return json(200, { ok: true, sent, failed, reaped: stale.length })
})

async function sendFcm(
  accessToken: string,
  token: string,
  payload: PushPayload,
): Promise<{ ok: boolean; stale?: boolean; error?: string }> {
  const body = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: { priority: 'HIGH' },
    },
  }
  const r = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  if (r.ok) return { ok: true }
  const errBody = await r.text().catch(() => '')
  // 404 UNREGISTERED / 400 INVALID_ARGUMENT with invalid-registration →
  // the app was uninstalled or token expired. Drop it.
  const stale =
    r.status === 404 ||
    (r.status === 400 && /invalid.registration|unregistered/i.test(errBody))
  return { ok: false, stale, error: `fcm_${r.status}: ${errBody.slice(0, 200)}` }
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getFcmAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  const sa = JSON.parse(FCM_SERVICE_ACCOUNT_JSON)
  const now = Math.floor(Date.now() / 1000)
  const jwt = await signServiceAccountJwt(sa, now)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!r.ok) throw new Error(`oauth token exchange failed: ${r.status}`)
  const j = await r.json()
  cachedToken = {
    value: j.access_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

async function signServiceAccountJwt(sa: any, now: number): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const unsigned = `${enc(header)}.${enc(claims)}`

  const pem = sa.private_key as string
  const der = pemToDer(pem)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  )
  const sigB64 = btoa(String.fromCharCode(...sig))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${unsigned}.${sigB64}`
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}
