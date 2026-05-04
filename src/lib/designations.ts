import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Designation {
  code: string
  name: string
  is_active: boolean
  display_order: number
}

export function useDesignations(opts: { activeOnly?: boolean } = {}) {
  const { activeOnly = false } = opts
  return useQuery<Designation[]>({
    queryKey: ['designations', activeOnly ? 'active' : 'all'],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('v_designations')
        .select('code, name, is_active, display_order')
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
      const row = {
        code: input.code.trim().toLowerCase(),
        name: input.name.trim(),
        is_active: input.is_active ?? true,
        display_order: input.display_order ?? 0,
      }
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
