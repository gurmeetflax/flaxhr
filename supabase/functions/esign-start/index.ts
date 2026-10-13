// Starts Aadhaar eSign for one document via Leegality.
//
// Called by the employee from the app:
//   supabase.functions.invoke('esign-start', { body: { request_id, pdf_base64 } })
// The app renders the frozen letter to PDF and sends it here; we create a
// Leegality sign request (workflow LEEGALITY_PROFILE_ID) with the employee
// as the only invitee and return their signing link. Idempotent: if the
// document already went to Leegality, the existing link is returned, so a
// letter is never charged twice.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  CORS,
  findKey,
  json,
  leegality,
  LEEGALITY_ENV,
  LEEGALITY_PROFILE_ID,
  LEEGALITY_TOKEN,
  messages,
  stripFiles,
} from '../_shared/leegality.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  if (!LEEGALITY_TOKEN || !LEEGALITY_PROFILE_ID) return json(500, { error: 'Aadhaar eSign is not configured yet.' })

  const body = await req.json().catch(() => ({}))
  const requestId = String(body.request_id ?? '')

  // Ownership check with the caller's own session.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: mine } = await userClient.from('v_my_sign_requests').select('id').eq('id', requestId).maybeSingle()
  if (!mine) return json(404, { error: 'Document not found.' })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const { data: r, error } = await sb
    .schema('core')
    .from('sign_requests')
    .select('id, employee_id, title, sign_method, status, provider_ref, provider_url, audit')
    .eq('id', requestId)
    .single()
  if (error || !r) return json(404, { error: 'Document not found.' })
  if (r.sign_method !== 'aadhaar') return json(400, { error: 'This document is signed in the app.' })
  if (r.status === 'signed') return json(400, { error: 'Already signed.' })
  if (r.provider_ref && r.provider_url) return json(200, { url: r.provider_url, reused: true })

  const pdf = String(body.pdf_base64 ?? '')
  if (!pdf.startsWith('JVBERi0')) return json(400, { error: 'Could not prepare the PDF. Please try again.' })

  const { data: emp } = await sb
    .schema('core')
    .from('employees')
    .select('full_name, phone, personal_email')
    .eq('id', r.employee_id)
    .single()
  const phone = String(emp?.phone ?? '').replace(/\D/g, '').slice(-10)
  if (!/^[6-9]\d{9}$/.test(phone)) return json(400, { error: 'Your mobile number on file is missing or invalid. Ask HR to update it.' })

  const invitee: Record<string, string> = { name: emp.full_name, phone }
  if (emp.personal_email) invitee.email = emp.personal_email

  const res = await leegality('/v3.0/sign/request', {
    method: 'POST',
    body: {
      profileId: LEEGALITY_PROFILE_ID,
      file: { name: `${r.title} - ${emp.full_name}.pdf`.replace(/[^\w .-]+/g, ''), file: pdf },
      invitees: [invitee],
      irn: r.id,
    },
  })

  const documentId = findKey(res.json, (k, v) => k === 'documentId' && typeof v === 'string')
  const signUrl = findKey(
    res.json,
    (k, v) => /sign.?url|^url$/i.test(k) && typeof v === 'string' && v.startsWith('http'),
  )
  const ok = res.ok && (res.json?.status === 1 || res.json?.status === true || documentId) && documentId && signUrl

  await sb
    .schema('core')
    .from('sign_requests')
    .update({
      provider_ref: ok ? documentId : null,
      provider_url: ok ? signUrl : null,
      provider_status: ok ? 'SENT' : `ERROR ${res.status}`,
      audit: { ...(r.audit ?? {}), leegality_create: { env: LEEGALITY_ENV, http: res.status, response: stripFiles(res.json ?? res.text.slice(0, 500)) } },
    })
    .eq('id', r.id)

  if (!ok) return json(502, { error: `Aadhaar eSign couldn't start: ${messages(res.json, res.text)}` })
  return json(200, { url: signUrl })
})
