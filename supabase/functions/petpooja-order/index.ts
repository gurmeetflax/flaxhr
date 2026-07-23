// Petpooja "Global API" webhook receiver.
//
// Petpooja POSTs one JSON blob per "SAVE AND PRINT" event (an
// "orderdetails" event). There is no auth beyond an optional static
// token in the body. We just forward the raw payload to
// public.ingest_petpooja_order() and let Postgres validate + upsert.
//
// URL Petpooja should be configured with:
//   https://<project-ref>.supabase.co/functions/v1/petpooja-order
//
// Deploy with JWT verification disabled — Petpooja never sends an
// Authorization header:
//   supabase functions deploy petpooja-order --no-verify-jwt
//
// Env vars (Dashboard → Functions → petpooja-order → Secrets):
//   SUPABASE_URL              — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  — Deno runtime; TS server here isn't set up for it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  // Only respond to the orderdetails event; Petpooja may send others in
  // future and we want to keep our schema stable.
  if (payload?.event && payload.event !== 'orderdetails') {
    return json(200, { ignored: payload.event })
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await sb.rpc('ingest_petpooja_order', {
    p_payload: payload,
  })

  if (error) {
    // Petpooja doesn't do anything with our error body, but log it so we
    // can inspect it in Supabase Function logs.
    console.error('ingest_petpooja_order failed', {
      message: error.message,
      code: (error as any).code,
      details: (error as any).details,
    })
    return json(500, { error: error.message })
  }

  return json(200, data ?? { ok: true })
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
