import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type FnfStatus = 'open' | 'clearance_done' | 'settled' | 'closed'
export type ItemStatus = 'pending' | 'done' | 'waived'

export interface FnfRecord {
  id: string
  employee_id: string
  exit_date: string
  fnf_target_date: string
  status: FnfStatus
  final_amount: number | null
  notes: string | null
  created_at: string
  updated_at: string
  settled_at: string | null
  settled_by: string | null
  employee_code: string
  full_name: string
  outlet_id: string | null
  outlet_name: string | null
  items_total: number
  items_done: number
}

export interface ClearanceItem {
  id: string
  fnf_id: string
  code: string
  label: string
  owner_role: 'it' | 'manager' | 'hr' | 'employee'
  status: ItemStatus
  notes: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  employee_id: string
}

export function useFnfRecords() {
  return useQuery<FnfRecord[]>({
    queryKey: ['fnf-records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_fnf_records')
        .select('*')
        .order('fnf_target_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as FnfRecord[]
    },
  })
}

export function useFnfRecord(id: string | undefined) {
  return useQuery<FnfRecord | null>({
    queryKey: ['fnf-record', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('v_fnf_records')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as FnfRecord | null) ?? null
    },
  })
}

export function useClearanceItems(fnfId: string | undefined) {
  return useQuery<ClearanceItem[]>({
    queryKey: ['clearance-items', fnfId],
    enabled: !!fnfId,
    queryFn: async () => {
      if (!fnfId) return []
      const { data, error } = await supabase
        .from('v_clearance_items')
        .select('*')
        .eq('fnf_id', fnfId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as ClearanceItem[]
    },
  })
}

export function useUpdateClearanceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: ItemStatus; notes?: string }) => {
      const { error } = await supabase.rpc('update_clearance_item', {
        p_id: input.id,
        p_status: input.status,
        p_notes: input.notes ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clearance-items'] })
      qc.invalidateQueries({ queryKey: ['fnf-records'] })
      qc.invalidateQueries({ queryKey: ['fnf-record'] })
    },
  })
}

export function useComputeFnfSettlement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fnfId: string) => {
      const { data, error } = await supabase.rpc('compute_fnf_settlement', { p_fnf_id: fnfId })
      if (error) throw error
      return Number(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fnf-records'] })
      qc.invalidateQueries({ queryKey: ['fnf-record'] })
    },
  })
}

export function useSettleFnf() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fnfId: string) => {
      const { error } = await supabase.rpc('settle_fnf', { p_fnf_id: fnfId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fnf-records'] })
      qc.invalidateQueries({ queryKey: ['fnf-record'] })
    },
  })
}
