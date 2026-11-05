import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export type RegStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface Regularisation {
  id: string
  employee_id: string
  outlet_id: string | null
  requested_for: string
  type: 'in' | 'out'
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
      })
      if (error) throw friendly(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-regularisations'] }),
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
    return new Error('That date and time is in the future. Regularise only punches you already missed.')
  }
  return new Error(error.message)
}
