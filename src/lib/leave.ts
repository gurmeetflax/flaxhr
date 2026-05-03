import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveType {
  id: string
  code: string
  name: string
  is_paid: boolean
  accrual_per_month: number
  max_balance: number | null
  requires_approval: boolean
  min_notice_days: number
  allow_half_day: boolean
  is_active: boolean
}

export interface LeaveBalance {
  leave_type_id: string
  code: string
  name: string
  is_paid: boolean
  balance: number
}

export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  half_day: 'none' | 'first' | 'second'
  days: number
  reason: string | null
  status: LeaveStatus
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  leave_code: string
  leave_name: string
  is_paid: boolean
  employee_code: string
  employee_name: string
  outlet_id: string | null
  outlet_name: string | null
}

export function useLeaveTypes() {
  return useQuery<LeaveType[]>({
    queryKey: ['leave-types'],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('leave_types').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return (data ?? []) as LeaveType[]
    },
  })
}

export function useUpsertLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (lt: Partial<LeaveType> & { code: string; name: string }) => {
      const { error } = await supabase.from('leave_types').upsert(lt, { onConflict: 'code' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-types'] }),
  })
}

export function useMyLeaveBalances() {
  const { user } = useAuth()
  return useQuery<LeaveBalance[]>({
    queryKey: ['my-leave-balances', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_my_leave_balances').select('*')
      if (error) throw error
      return (data ?? []) as LeaveBalance[]
    },
  })
}

export function useLeaveRequests(filter?: { status?: LeaveStatus | null; mine?: boolean }) {
  const { user } = useAuth()
  return useQuery<LeaveRequest[]>({
    queryKey: ['leave-requests', filter ?? {}, user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase.from('v_leave_requests').select('*').order('created_at', { ascending: false })
      if (filter?.status) q = q.eq('status', filter.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LeaveRequest[]
    },
  })
}

export function useSubmitLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      leave_type_id: string
      start_date: string
      end_date: string
      half_day?: 'none' | 'first' | 'second'
      reason?: string
    }) => {
      const { error } = await supabase.rpc('submit_leave_request', {
        p_leave_type_id: input.leave_type_id,
        p_start_date: input.start_date,
        p_end_date: input.end_date,
        p_half_day: input.half_day ?? 'none',
        p_reason: input.reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] })
      qc.invalidateQueries({ queryKey: ['my-leave-balances'] })
    },
  })
}

export function useDecideLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: 'approved' | 'rejected'; note?: string }) => {
      const { error } = await supabase.rpc('decide_leave_request', {
        p_id: input.id,
        p_status: input.status,
        p_note: input.note ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] })
      qc.invalidateQueries({ queryKey: ['my-leave-balances'] })
    },
  })
}
