import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export type RosterStatus = 'planned' | 'published' | 'swapped' | 'off'

export interface RosterEntry {
  id: string
  outlet_id: string
  employee_id: string
  shift_id: string | null
  work_date: string
  starts_at: string | null
  ends_at: string | null
  status: RosterStatus
  notes: string | null
  employee_code: string
  employee_name: string
  shift_name: string | null
  start_time: string | null
  end_time: string | null
  outlet_name: string | null
  outlet_timezone: string | null
}

export function useRoster(outletId: string | null, fromDate: string, toDate: string) {
  return useQuery<RosterEntry[]>({
    queryKey: ['roster', outletId, fromDate, toDate],
    enabled: !!outletId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_roster')
        .select('*')
        .eq('outlet_id', outletId!)
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date')
      if (error) throw error
      return (data ?? []) as RosterEntry[]
    },
  })
}

export function useUpsertRosterEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: {
      outlet_id: string
      employee_id: string
      work_date: string
      shift_id?: string | null
      status?: RosterStatus
      notes?: string | null
      starts_at?: string | null
      ends_at?: string | null
    }) => {
      const { error } = await supabase.schema('core').from('roster_entries').upsert(e, {
        onConflict: 'employee_id,work_date',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roster'] }),
  })
}

export function useDeleteRosterEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.schema('core').from('roster_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roster'] }),
  })
}

export function usePublishWeek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { outletId: string; fromDate: string; toDate: string }) => {
      const { error } = await supabase
        .schema('core')
        .from('roster_entries')
        .update({ status: 'published' })
        .eq('outlet_id', input.outletId)
        .gte('work_date', input.fromDate)
        .lte('work_date', input.toDate)
        .eq('status', 'planned')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roster'] }),
  })
}

export function useMyRoster() {
  const { user } = useAuth()
  return useQuery<RosterEntry[]>({
    queryKey: ['my-roster', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_roster')
        .select('*')
        .order('work_date')
      if (error) throw error
      return (data ?? []) as RosterEntry[]
    },
  })
}
