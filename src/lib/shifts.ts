import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export interface Shift {
  id: string
  /** null = universal (applies to all outlets) */
  outlet_id: string | null
  name: string
  start_time: string
  end_time: string
  grace_in_minutes: number
  grace_out_minutes: number
  days_of_week: number[]
  is_active: boolean
}

export const UNIVERSAL_OUTLET = '__universal' as const
export type ShiftOutletFilter = string | typeof UNIVERSAL_OUTLET | null

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

/**
 * Lists shifts.
 *  - null              → all shifts (universal + per-outlet)
 *  - UNIVERSAL_OUTLET  → only universal shifts (outlet_id is null)
 *  - otherwise         → shifts at that outlet PLUS universal shifts
 */
export function useShifts(filter: ShiftOutletFilter = null) {
  return useQuery<Shift[]>({
    queryKey: ['shifts', filter ?? 'all'],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase.schema('core').from('shifts').select('*').order('outlet_id', { nullsFirst: true }).order('start_time')
      if (filter === UNIVERSAL_OUTLET) {
        q = q.is('outlet_id', null)
      } else if (filter) {
        q = q.or(`outlet_id.eq.${filter},outlet_id.is.null`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Shift[]
    },
  })
}

export function useUpsertShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      s: Partial<Shift> & {
        outlet_id: string | null
        name: string
        start_time: string
        end_time: string
      },
    ) => {
      // No onConflict — universal shifts have outlet_id IS NULL, which the
      // partial unique indexes (shifts_universal_name_uq, shifts_outlet_name_uq)
      // enforce, but PostgREST onConflict can't address partial indexes by
      // column tuple alone. Caller updates by id when editing.
      const { error } = s.id
        ? await supabase.schema('core').from('shifts').update(s).eq('id', s.id)
        : await supabase.schema('core').from('shifts').insert(s)
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
