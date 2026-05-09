import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type PipStatus = 'open' | 'review' | 'closed_pass' | 'closed_fail'

export interface Pip {
  id: string
  employee_id: string
  employee_code: string
  full_name: string
  outlet_id: string | null
  outlet_name: string | null
  score_pct_at_trigger: number | null
  threshold_pct_at_trigger: number | null
  consecutive_low_at_trigger: number | null
  started_on: string
  target_date: string
  status: PipStatus
  notes: string | null
  closed_at: string | null
  created_at: string
}

export interface MyPip {
  id: string
  started_on: string
  target_date: string
  status: 'open' | 'review'
  score_pct_at_trigger: number | null
  threshold_pct_at_trigger: number | null
  notes: string | null
}

export function usePips() {
  return useQuery<Pip[]>({
    queryKey: ['pips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_pips')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Pip[]
    },
  })
}

export function useClosePip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; outcome: 'pass' | 'fail'; notes?: string }) => {
      const { error } = await supabase.rpc('close_pip', {
        p_pip_id: input.id,
        p_outcome: input.outcome,
        p_notes: input.notes ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pips'] }),
  })
}

export function useMyPip() {
  return useQuery<MyPip | null>({
    queryKey: ['my-pip'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_pip')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as MyPip | null) ?? null
    },
  })
}
