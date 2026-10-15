import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RosterGroup } from '@/lib/autoRoster'

export interface Designation {
  code: string
  name: string
  is_active: boolean
  display_order: number
  /** Service-charge weight per day worked. Default 1.00. */
  sc_points_per_day: number
  /** Auto roster: which role group this title fills, and whether it can lead a shift. */
  roster_group: RosterGroup | null
  is_lead: boolean
}

export function useDesignations(opts: { activeOnly?: boolean } = {}) {
  const { activeOnly = false } = opts
  return useQuery<Designation[]>({
    queryKey: ['designations', activeOnly ? 'active' : 'all'],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('v_designations')
        .select('code, name, is_active, display_order, sc_points_per_day, roster_group, is_lead')
        .order('display_order')
        .order('name')
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Designation[]
    },
  })
}

export function useUpsertDesignation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<Designation> & { code: string; name: string }) => {
      const row: Record<string, unknown> = {
        code: input.code.trim().toLowerCase(),
        name: input.name.trim(),
        is_active: input.is_active ?? true,
        display_order: input.display_order ?? 0,
      }
      if (input.sc_points_per_day != null) row.sc_points_per_day = input.sc_points_per_day
      if (input.roster_group !== undefined) row.roster_group = input.roster_group
      if (input.is_lead !== undefined) row.is_lead = input.is_lead
      const { error } = await supabase
        .schema('core' as never)
        .from('designations')
        .upsert(row, { onConflict: 'code' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
  })
}

export function useDeleteDesignation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase
        .schema('core' as never)
        .from('designations')
        .delete()
        .eq('code', code)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
  })
}
