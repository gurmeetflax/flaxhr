// Leegality → Flax HR: completes Aadhaar-signed documents.
//
// Two callers:
//  1. Leegality's webhook (no auth) when an invitee signs, rejects or a
//     request expires. We never trust the payload: we look up the
//     document with our own token and only then mark it signed.
//  2. The app ("Check status"), with the user's session and { request_id }.
// On completion the signed PDF (and audit trail, if Leegality returns one)
// is saved to signed-docs/<employee_id>/ and filed under the employee.
//
// Deployed with verify_jwt off so Leegality can reach it.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  b64ToBytes,
  CORS,
  findKey,
  findPdfs,
  hmacSha1Hex,
  json,
  leegality,
  LEEGALITY_SALT,
  LEEGALITY_TOKEN,
  messages,
  stripFiles,
} from '../_shared/leegality.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  if (!LEEGALITY_TOKEN) return json(500, { error: 'Aadhaar eSign is not configured.' })

  const raw = await req.text()
  let body: any = {}
  try {
    body = JSON.parse(raw)
  } catch {
    body = Object.fromEntries(new URLSearchParams(raw))
  }

  // 2. App-initiated status check.
  if (body.request_id && req.headers.get('authorization')) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { authorization: req.headers.get('authorization')! } },
      auth: { persistSession: false },
    })
    const [{ data: mine }, { data: asAdmin }] = await Promise.all([
      userClient.from('v_my_sign_requests').select('id').eq('id', body.request_id).maybeSingle(),
      userClient.from('v_sign_requests').select('id').eq('id', body.request_id).maybeSingle(),
    ])
    if (!mine && !asAdmin) return json(404, { error: 'Document not found.' })
    const { data: r } = await sb.schema('core').from('sign_requests').select('*').eq('id', body.request_id).single()
    if (!r?.provider_ref) return json(200, { status: r?.status ?? 'unknown', note: 'Not sent to Aadhaar eSign yet.' })
    return json(200, await sync(r))
  }

  // 1. Leegality webhook.
  const documentId = findKey(body, (k, v) => k === 'documentId' && typeof v === 'string')
  const irn = findKey(body, (k, v) => k === 'irn' && typeof v === 'string')
  if (!documentId && !irn) return json(200, { ok: true, ignored: 'no documentId' })

  let macOk: boolean | null = null
  if (LEEGALITY_SALT && body.mac && documentId) {
    macOk = (await hmacSha1Hex(LEEGALITY_SALT, documentId)).toLowerCase() === String(body.mac).toLowerCase()
  }

  let q = sb.schema('core').from('sign_requests').select('*')
  q = documentId ? q.eq('provider_ref', documentId) : q.eq('id', irn)
  const { data: r } = await q.maybeSingle()
  if (!r) return json(200, { ok: true, ignored: 'unknown document' })

  await sb
    .schema('core')
    .from('sign_requests')
    .update({ audit: { ...(r.audit ?? {}), last_webhook: { at: new Date().toISOString(), mac_ok: macOk, body: stripFiles(body) } } })
    .eq('id', r.id)

  // Always confirm with Leegality before changing anything.
  const result = await sync({ ...r, audit: { ...(r.audit ?? {}), last_webhook: { mac_ok: macOk } } })
  return json(200, { ok: true, ...result })
})

async function sync(r: any) {
  if (r.status === 'signed') return { status: 'signed' }
  const res = await leegality(`/v3.3/document/details?documentId=${encodeURIComponent(r.provider_ref)}`)
  const pdfs = findPdfs(res.json)
  const docStatus = String(
    findKey(res.json, (k, v) => /^(documentStatus|status)$/.test(k) && typeof v === 'string') ?? '',
  ).toUpperCase()
  const rejected = /REJECT|DECLIN/.test(docStatus)
  const expired = /EXPIRE/.test(docStatus)

  if (!pdfs.length) {
    const status = rejected ? 'REJECTED' : expired ? 'EXPIRED' : docStatus || `PENDING (${messages(res.json, res.text).slice(0, 80)})`
    await sb.schema('core').from('sign_requests').update({ provider_status: status }).eq('id', r.id)
    return { status: r.status, provider_status: status }
  }

  // Signed: the main document, plus an audit trail if returned separately.
  const main = pdfs.find((p) => !/audit/i.test(p.key)) ?? pdfs[0]
  const audit = pdfs.find((p) => /audit/i.test(p.key) && p !== main)
  const base = `${r.employee_id}/${r.id}`
  const up1 = await sb.storage
    .from('signed-docs')
    .upload(`${base}-aadhaar.pdf`, b64ToBytes(main.b64), { contentType: 'application/pdf', upsert: true })
  if (up1.error) return { status: r.status, error: up1.error.message }
  if (audit) {
    await sb.storage
      .from('signed-docs')
      .upload(`${base}-audit-trail.pdf`, b64ToBytes(audit.b64), { contentType: 'application/pdf', upsert: true })
  }

  const signer = findKey(res.json, (k, v) => /^(name|signerName)$/.test(k) && typeof v === 'string')
  const now = new Date().toISOString()
  const { data: updated } = await sb
    .schema('core')
    .from('sign_requests')
    .update({
      status: 'signed',
      signed_at: now,
      signed_via: 'aadhaar',
      signer_name: signer ?? null,
      signed_pdf_path: `${base}-aadhaar.pdf`,
      provider_status: docStatus || 'COMPLETED',
      viewed_at: r.viewed_at ?? now,
      audit: {
        ...(r.audit ?? {}),
        method: 'aadhaar',
        signed_at: now,
        audit_trail_path: audit ? `${base}-audit-trail.pdf` : null,
        leegality_details: stripFiles(res.json),
      },
    })
    .eq('id', r.id)
    .neq('status', 'signed')
    .select('id')
  if (updated?.length) {
    await sb.schema('core').from('employee_documents').insert({
      employee_id: r.employee_id,
      kind: r.kind,
      title: r.title,
      path: `${base}-aadhaar.pdf`,
      issued_on: now.slice(0, 10),
      notes: 'Signed with Aadhaar eSign (Leegality)',
      sign_request_id: r.id,
    })
  }
  return { status: 'signed' }
}
