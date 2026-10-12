import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type Department = 'kitchen' | 'service' | 'management' | 'office'
export type CandidateStatus = 'new' | 'shortlisted' | 'interview' | 'selected' | 'rejected'

export interface Requirements {
  summary?: string
  must_have?: string[]
  nice_to_have?: string[]
  min_experience_years?: number
  languages?: string[]
  location?: string
  red_flags?: string[]
}

export interface HiringRole {
  id: string
  designation_code: string | null
  title: string
  department: Department
  requirements: Requirements
  is_open: boolean
  candidates: number
  new_candidates: number
  interviews: number
}

export interface Criterion {
  requirement: string
  kind: 'must_have' | 'nice_to_have' | 'red_flag'
  verdict: 'met' | 'partial' | 'missing' | 'unclear' | 'present' | 'absent'
  evidence: string
}

export interface ScoreDetail {
  summary: string
  recommendation: 'interview' | 'maybe' | 'reject'
  years_experience: number
  current_role: string
  criteria: Criterion[]
  strengths: string[]
  concerns: string[]
}

export interface Candidate {
  id: string
  role_id: string
  role_title: string
  department: Department
  designation_code: string | null
  full_name: string | null
  phone: string | null
  email: string | null
  city: string | null
  cv_path: string
  cv_filename: string | null
  cv_mime: string | null
  status: CandidateStatus
  score: number | null
  score_detail: ScoreDetail | null
  score_error: string | null
  scored_at: string | null
  interview_at: string | null
  interview_minutes: number
  meet_link: string | null
  interview_notes: string | null
  invite_sent_at: string | null
  employee_id: string | null
  created_at: string
}

export const STATUS_LABEL: Record<CandidateStatus, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  selected: 'Selected',
  rejected: 'Rejected',
}

export function useHiringRoles() {
  return useQuery<HiringRole[]>({
    queryKey: ['hiring-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_hiring_roles').select('*').order('title')
      if (error) throw error
      return (data ?? []) as HiringRole[]
    },
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: { id: string; requirements?: Requirements; is_open?: boolean }) => {
      const { id, ...patch } = r
      const { error } = await supabase
        .schema('core')
        .from('hiring_roles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hiring-roles'] }),
  })
}

export function useCandidates(roleId: string | null) {
  return useQuery<Candidate[]>({
    queryKey: ['candidates', roleId],
    enabled: !!roleId,
    // Poll while any CV is still being scored.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((c) => c.score == null && !c.score_error) ? 4000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_candidates')
        .select('*')
        .eq('role_id', roleId!)
        .order('score', { ascending: false, nullsFirst: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Candidate[]
    },
  })
}

export async function scoreCandidate(candidateId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('cv-score', { body: { candidate_id: candidateId } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(body?.error ?? error.message)
  }
}

// Upload each CV, create a candidate row, then score it. Scoring runs in
// the background; the list polls until scores land.
export function useUploadCvs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ roleId, files }: { roleId: string; files: File[] }) => {
      const ids: string[] = []
      for (const f of files) {
        const path = `${roleId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, '_')}`
        const { error: upErr } = await supabase.storage.from('cvs').upload(path, f, {
          contentType: f.type || undefined,
        })
        if (upErr) throw new Error(`${f.name}: ${upErr.message}`)
        const { data, error } = await supabase
          .schema('core')
          .from('candidates')
          .insert({ role_id: roleId, cv_path: path, cv_filename: f.name, cv_mime: f.type || null })
          .select('id')
          .single()
        if (error) throw error
        ids.push(data.id as string)
      }
      for (const id of ids) void scoreCandidate(id).catch(() => qc.invalidateQueries({ queryKey: ['candidates'] }))
      return ids.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] })
      qc.invalidateQueries({ queryKey: ['hiring-roles'] })
    },
  })
}

export function useUpdateCandidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { id: string } & Partial<Omit<Candidate, 'id'>>) => {
      const { id, ...patch } = c
      const { error } = await supabase
        .schema('core')
        .from('candidates')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] })
      qc.invalidateQueries({ queryKey: ['hiring-roles'] })
    },
  })
}

export async function sendInterviewInvite(candidateId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('interview-invite', { body: { candidate_id: candidateId } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(body?.error ?? error.message)
  }
}

export async function cvUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('cvs').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

// Same invite the email carries, for adding to Google Calendar by hand.
export function downloadIcs(c: Candidate, director = { name: 'Gurmeet', email: 'gurmeet@flaxitup.com' }) {
  if (!c.interview_at) return
  const start = new Date(c.interview_at)
  const end = new Date(start.getTime() + (c.interview_minutes || 30) * 60_000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const txt = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const title = `Flax interview: ${c.full_name ?? 'Candidate'} — ${c.role_title}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flax HR//Hiring//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:interview-${c.id}@hr.flaxfoods.in`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${txt(title)}`,
    `DESCRIPTION:${txt(`Interview for ${c.role_title}.${c.meet_link ? `\nJoin: ${c.meet_link}` : ''}${c.phone ? `\nCandidate phone: ${c.phone}` : ''}`)}`,
    `LOCATION:${txt(c.meet_link ?? 'Flax Head Office')}`,
    `ORGANIZER;CN=${director.name}:mailto:${director.email}`,
    ...(c.email ? [`ATTENDEE;CN=${txt(c.full_name ?? 'Candidate')};RSVP=TRUE:mailto:${c.email}`] : []),
    `ATTENDEE;CN=${director.name};RSVP=TRUE:mailto:${director.email}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `interview-${(c.full_name ?? 'candidate').replace(/\s+/g, '_')}.ics`
  a.click()
  URL.revokeObjectURL(a.href)
}
