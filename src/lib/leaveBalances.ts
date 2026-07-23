import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EmployeeLeaveBalance {
  employee_id: string
  employee_code: string
  employee_name: string
  outlet_id: string | null
  leave_type_id: string
  leave_code: string
  leave_name: string
  is_paid: boolean
  balance: number
  as_of: string | null
}

export function useEmployeeLeaveBalances(outletId?: string | null) {
  return useQuery<EmployeeLeaveBalance[]>({
    queryKey: ['employee-leave-balances', outletId ?? 'all'],
    staleTime: 20_000,
    queryFn: async () => {
      let q = supabase
        .from('v_employee_leave_balances')
        .select(
          'employee_id, employee_code, employee_name, outlet_id, leave_type_id, leave_code, leave_name, is_paid, balance, as_of',
        )
        .order('employee_code', { ascending: true })
      if (outletId) q = q.eq('outlet_id', outletId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r) => ({ ...r, balance: Number(r.balance ?? 0) })) as EmployeeLeaveBalance[]
    },
  })
}

export function useAdjustLeaveBalance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employee_id: string
      leave_type_id: string
      delta: number
      reason: string
      source?: 'manual_adjust' | 'encash' | 'carry_forward'
    }) => {
      const { error } = await supabase.rpc('adjust_leave_balance', {
        p_employee: input.employee_id,
        p_leave_type: input.leave_type_id,
        p_delta: input.delta,
        p_reason: input.reason,
        p_source: input.source ?? 'manual_adjust',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-leave-balances'] })
      qc.invalidateQueries({ queryKey: ['my-leave-balances'] })
      qc.invalidateQueries({ queryKey: ['employee-leave-summary'] })
    },
  })
}

export function useAccrueMonthlyLeaves() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (periodMonth?: string) => {
      const { data, error } = await supabase.rpc('accrue_monthly_leaves', {
        p_period_month: periodMonth ?? null,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-leave-balances'] })
      qc.invalidateQueries({ queryKey: ['my-leave-balances'] })
    },
  })
}

export function useBackfillOpeningBalances() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('backfill_opening_leave_balances', {})
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-leave-balances'] })
      qc.invalidateQueries({ queryKey: ['my-leave-balances'] })
    },
  })
}
