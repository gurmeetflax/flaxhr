// CV scanner — scores a candidate's CV against the role's requirements.
//
// Called from the Hiring page with the signed-in admin/HR user's JWT:
//   supabase.functions.invoke('cv-score', { body: { candidate_id } })
// Downloads the CV from the private 'cvs' bucket, sends it to Claude
// (PDF as a document block, photos as images, Word files as extracted
// text) together with the role's requirements, and stores the score,
// a per-requirement breakdown and the contact details it found.
//
// Needs the ANTHROPIC_API_KEY Supabase secret.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime; TS server here isn't configured for it.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import JSZip from 'npm:jszip@3'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const SYSTEM = `You screen job applications for Flax Healthy Living, a healthy-food restaurant and cafe chain in India (Mumbai, Bangalore, Goa) with outlets, a central kitchen and a head office.

You are given one candidate's CV and the requirements for the role they applied to. Judge the CV only on what it actually says. Do not reward polish or penalise plain, short or badly formatted CVs: many kitchen and service applicants write very simple CVs, and hotel-management or on-the-job experience counts as real experience. Never make assumptions from the candidate's name, gender, age, religion, caste, region or photo, and never mention them.

For every must-have and nice-to-have requirement, decide met / partial / missing / unclear and quote or paraphrase the evidence from the CV (or say what is missing). Check the red flags. Then give an overall score from 0 to 100:
- 85–100: meets all must-haves with strong relevant experience — interview first.
- 70–84: meets the must-haves, some gaps — worth interviewing.
- 50–69: partly fits — consider if the pipeline is thin.
- below 50: does not fit this role.
Missing must-haves weigh far more than nice-to-haves. If the CV is unreadable or is not a CV, score 0 and say so in the summary.

Also extract the candidate's name, phone, email and current city if they appear, otherwise empty strings.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['full_name', 'phone', 'email', 'city', 'years_experience', 'current_role', 'score', 'recommendation', 'summary', 'criteria', 'strengths', 'concerns'],
  properties: {
    full_name: { type: 'string' },
    phone: { type: 'string' },
    email: { type: 'string' },
    city: { type: 'string' },
    years_experience: { type: 'number', description: 'Total relevant years of work experience, 0 if none or unclear' },
    current_role: { type: 'string', description: 'Most recent job title and employer, or empty' },
    score: { type: 'integer', description: '0-100 overall fit' },
    recommendation: { type: 'string', enum: ['interview', 'maybe', 'reject'] },
    summary: { type: 'string', description: 'Two or three sentences for HR on why this score' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requirement', 'kind', 'verdict', 'evidence'],
        properties: {
          requirement: { type: 'string' },
          kind: { type: 'string', enum: ['must_have', 'nice_to_have', 'red_flag'] },
          verdict: { type: 'string', enum: ['met', 'partial', 'missing', 'unclear', 'present', 'absent'] },
          evidence: { type: 'string' },
        },
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  try {
    return await handle(req)
  } catch (e) {
    console.error('cv-score', e)
    return json(500, { error: e instanceof Error ? e.message : String(e) })
  }
})

async function handle(req: Request): Promise<Response> {
  // Only admin / HR may score. Check with the caller's own JWT.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: cand, error: cErr } = await userClient
    .schema('core')
    .from('candidates')
    .select('id, cv_path, cv_mime, cv_filename, role_id')
    .eq('id', (await req.json().catch(() => ({}))).candidate_id ?? '')
    .maybeSingle()
  if (cErr) return json(403, { error: cErr.message })
  if (!cand) return json(404, { error: 'candidate not found or not allowed' })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  if (!ANTHROPIC_API_KEY) return fail(sb, cand.id, 'ANTHROPIC_API_KEY is not set in Supabase secrets.')
  // Clear any earlier error so the app shows "scoring" again.
  await sb.schema('core').from('candidates').update({ score_error: null }).eq('id', cand.id)
  const { data: role, error: rErr } = await sb
    .schema('core')
    .from('hiring_roles')
    .select('title, department, requirements')
    .eq('id', cand.role_id)
    .single()
  if (rErr) return fail(sb, cand.id, `Couldn't load the role: ${rErr.message}`)

  const { data: file, error: fErr } = await sb.storage.from('cvs').download(cand.cv_path)
  if (fErr || !file) return fail(sb, cand.id, `Couldn't read the CV file: ${fErr?.message ?? 'missing'}`)

  let cvBlock: any
  try {
    cvBlock = await toContentBlock(file, cand.cv_mime ?? '', cand.cv_filename ?? '')
  } catch (e) {
    return fail(sb, cand.id, e instanceof Error ? e.message : String(e))
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  let result: any
  try {
    // fallbacks: 'default' re-runs a declined request on another model
    // inside the same call instead of failing the score.
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            cvBlock,
            {
              type: 'text',
              text: `Role applied for: ${role.title} (${role.department})\n\nRequirements:\n${JSON.stringify(role.requirements, null, 2)}\n\nScore this CV against these requirements.`,
            },
          ],
        },
      ],
    })
    if (msg.stop_reason === 'refusal') return fail(sb, cand.id, 'The AI declined to score this file.')
    const text = msg.content.find((b: any) => b.type === 'text')?.text ?? ''
    result = JSON.parse(text)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(sb, cand.id, 'AI is busy (rate limit). Try again in a minute.')
    if (e instanceof Anthropic.AuthenticationError)
      return fail(sb, cand.id, 'The Anthropic API key in Supabase secrets is invalid or revoked. Replace ANTHROPIC_API_KEY.')
    if (e instanceof Anthropic.APIError) return fail(sb, cand.id, `AI error ${e.status}: ${e.message}`)
    return fail(sb, cand.id, e instanceof Error ? e.message : String(e))
  }

  const score = Math.max(0, Math.min(100, Math.round(result.score ?? 0)))
  const patch: Record<string, unknown> = {
    score,
    score_detail: {
      summary: result.summary,
      recommendation: result.recommendation,
      years_experience: result.years_experience,
      current_role: result.current_role,
      criteria: result.criteria,
      strengths: result.strengths,
      concerns: result.concerns,
    },
    score_error: null,
    scored_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  // Fill contact details only where HR hasn't typed them already.
  const { data: cur } = await sb.schema('core').from('candidates').select('full_name, phone, email, city').eq('id', cand.id).single()
  for (const k of ['full_name', 'phone', 'email', 'city'] as const) {
    if (!cur?.[k] && result[k]) patch[k] = String(result[k]).trim()
  }
  const { error: uErr } = await sb.schema('core').from('candidates').update(patch).eq('id', cand.id)
  if (uErr) return fail(sb, cand.id, `Couldn't save the score: ${uErr.message}`)
  return json(200, { ok: true, score })
}

async function toContentBlock(file: Blob, mime: string, name: string): Promise<any> {
  const lower = name.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(bytes) } }
  }
  if (/^image\/(jpeg|png|webp|gif)$/.test(mime) || /\.(jpe?g|png|webp)$/.test(lower)) {
    const media = mime.startsWith('image/') ? mime : lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    return { type: 'image', source: { type: 'base64', media_type: media, data: b64(bytes) } }
  }
  if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
    const zip = await JSZip.loadAsync(bytes)
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''
    const text = xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .trim()
    if (!text) throw new Error('The Word file has no readable text.')
    return { type: 'text', text: `CV (from ${name}):\n\n${text}` }
  }
  if (mime.startsWith('text/') || lower.endsWith('.txt')) {
    return { type: 'text', text: `CV (from ${name}):\n\n${new TextDecoder().decode(bytes)}` }
  }
  throw new Error('Unsupported file type. Upload a PDF, Word (.docx) file or a photo of the CV.')
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function fail(sb: any, id: string, message: string) {
  await sb.schema('core').from('candidates').update({ score_error: message, updated_at: new Date().toISOString() }).eq('id', id)
  return json(422, { error: message })
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } })
}
