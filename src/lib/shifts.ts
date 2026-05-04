import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export interface Shift {
  id: string
  outlet_id: string
  name: string
  start_time: string
  end_time: string
  grace_in_minutes: number
  grace_out_minutes: number
  days_of_week: number[]
  is_active: boolean
}

export interface EmployeeShift {
  employee_id: string
  shift_id: string
  effective_from: string
  effective_to: string | null
  employee_code: string
  employee_name: string
  shift_name: string
  start_time: string
  end_time: string
  outlet_id: string
  outlet_name: string | null
}

export function useShifts(outletId?: string | null) {
  return useQuery<Shift[]>({
    queryKey: ['shifts', outletId ?? 'all'],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase.schema('core').from('shifts').select('*').order('outlet_id').order('start_time')
      if (outletId) q = q.eq('outlet_id', outletId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Shift[]
    },
  })
}

export function useUpsertShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: Partial<Shift> & { outlet_id: string; name: string; start_time: string; end_time: string }) => {
      const { error } = await supabase.schema('core').from('shifts').upsert(s, { onConflict: 'outlet_id,name' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  })
}

export function useDeleteShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.schema('core').from('shifts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  })
}

export function useEmployeeShifts(employeeId?: string | null) {
  return useQuery<EmployeeShift[]>({
    queryKey: ['employee-shifts', employeeId ?? 'all'],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from('v_employee_shifts').select('*')
      if (employeeId) q = q.eq('employee_id', employeeId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as EmployeeShift[]
    },
  })
}

export function useAssignShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { employee_id: string; shift_id: string; effective_from: string; effective_to?: string | null }) => {
      const { error } = await supabase.schema('core').from('employee_shifts').upsert(input, {
        onConflict: 'employee_id,effective_from',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-shifts'] }),
  })
}

export interface MyTodayShift {
  employee_id: string
  shift_id: string
  outlet_id: string
  name: string
  start_time: string
  end_time: string
  grace_in_minutes: number
  grace_out_minutes: number
}

export function useMyTodayShift() {
  const { user } = useAuth()
  return useQuery<MyTodayShift | null>({
    queryKey: ['my-today-shift', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_my_today_shift').select('*').maybeSingle()
      if (error) throw error
      return (data as MyTodayShift) ?? null
    },
  })
}
