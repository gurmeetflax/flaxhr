import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export type RegStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

// What the request is for. A missed punch adds the punch once approved; the
// others are whole-day requests that attendance (and payroll) read directly.
export type RegCategory = 'missed_punch' | 'week_off' | 'sick_leave' | 'casual_leave'

export const REG_CATEGORY_LABEL: Record<RegCategory, string> = {
  missed_punch: 'Missed punch',
  week_off: 'Week off',
  sick_leave: 'Sick leave',
  casual_leave: 'Casual leave',
}

export interface Regularisation {
  id: string
  employee_id: string
  outlet_id: string | null
  requested_for: string
  type: 'in' | 'out'
  category: RegCategory
  reason: string
  evidence_path: string | null
  status: RegStatus
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
  employee_code: string
  employee_name: string
  outlet_name: string | null
  outlet_timezone: string | null
}

export function useMyRegularisations() {
  const { user } = useAuth()
  return useQuery<Regularisation[]>({
    queryKey: ['my-regularisations', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_regularisations')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Regularisation[]
    },
  })
}

export function useRegularisations(filter?: { status?: RegStatus | null }) {
  return useQuery<Regularisation[]>({
    queryKey: ['regularisations', filter ?? {}],
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase.from('v_regularisations').select('*').order('created_at', { ascending: false })
      if (filter?.status) q = q.eq('status', filter.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Regularisation[]
    },
  })
}

export function useCreateRegularisation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      requested_for: string
      type: 'in' | 'out'
      category: RegCategory
      reason: string
      outlet_id?: string | null
      evidence_path?: string | null
    }) => {
      const { error } = await supabase.rpc('submit_regularisation', {
        p_requested_for: input.requested_for,
        p_type: input.type,
        p_reason: input.reason,
        p_outlet_id: input.outlet_id ?? null,
        p_evidence_path: input.evidence_path ?? null,
        p_category: input.category,
      })
      if (error) throw friendly(error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-regularisations'] })
      qc.invalidateQueries({ queryKey: ['my-attendance-month'] })
    },
  })
}

export function useDecideRegularisation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: 'approved' | 'rejected'; note?: string }) => {
      const { error } = await supabase.rpc('decide_regularisation', {
        p_id: input.id,
        p_status: input.status,
        p_note: input.note ?? null,
      })
      if (error) throw friendly(error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['regularisations'] })
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
  })
}

// A future-dated regularisation became a future punch, which made the app
// think the person had already punched out for days (Nov 2026). The
// database now refuses them; say why in plain words.
function friendly(error: { message: string }): Error {
  if (error.message.includes('FUTURE_TIME')) {
    return new Error('That date and time is in the future. Regularise only days that have already passed.')
  }
  if (error.message.includes('DAY_ALREADY_REQUESTED')) {
    return new Error('You have already asked for a week off or leave on that day.')
  }
  return new Error(error.message)
}

// One line for lists: "Week off · Fri 24 Oct" or "In · 24 Oct, 11:05 am".
export function regWhen(reg: Pick<Regularisation, 'category' | 'type' | 'requested_for'>, tz: string) {
  const cat = reg.category ?? 'missed_punch'
  if (cat !== 'missed_punch')
    return `${REG_CATEGORY_LABEL[cat]} · ${formatInTimeZone(reg.requested_for, tz, 'EEE d MMM')}`
  return `${reg.type === 'in' ? 'Punch in' : 'Punch out'} · ${formatInTimeZone(reg.requested_for, tz, 'd MMM, h:mm a')}`
}
