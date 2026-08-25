/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno edge function; types resolved at deploy time.
//
// Posts a formatted text payload to a Slack incoming webhook stored in
// the SLACK_WEBHOOK_URL Supabase secret.
//
// Invoke from the SPA via:
//   supabase.functions.invoke('slack-post', { body: { text: '...' } })
//
// The webhook URL is held server-side so it never leaks to the browser.
// Uses the caller's JWT for auth (verify_jwt is on by default) so only
// signed-in users can invoke.

const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? ''

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'POST only' }, 405)
  }
  if (!SLACK_WEBHOOK_URL) {
    return json({ ok: false, error: 'SLACK_WEBHOOK_URL not set' }, 500)
  }
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400)
  }
  const text = (body?.text ?? '').toString().slice(0, 4000)
  if (!text) return json({ ok: false, error: 'text required' }, 400)

  const resp = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    return json({ ok: false, error: `slack_${resp.status}: ${t.slice(0, 200)}` }, 502)
  }
  return json({ ok: true })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...CORS_HEADERS,
    },
  })
}
