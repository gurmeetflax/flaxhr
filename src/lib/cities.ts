import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface City {
  id: string
  display_name: string
  is_active: boolean
  display_order: number
}

export function useCities(activeOnly = false) {
  return useQuery<City[]>({
    queryKey: ['cities', activeOnly],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase
        .from('v_cities')
        .select('id, display_name, is_active, display_order')
        .order('display_order')
        .order('display_name')
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as City[]
    },
  })
}

export function useUpsertCity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      display_name: string
      is_active?: boolean
      display_order?: number
    }) => {
      const { error } = await supabase.rpc('upsert_city', {
        p_id: input.id,
        p_display_name: input.display_name,
        p_is_active: input.is_active ?? true,
        p_display_order: input.display_order ?? 0,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cities'] }),
  })
}
