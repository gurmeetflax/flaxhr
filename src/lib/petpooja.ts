import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PetpoojaRestaurant {
  rest_id: string
  outlet_id: string
  token: string | null
  notes: string | null
  updated_at: string
}

export function usePetpoojaRestaurants() {
  return useQuery<PetpoojaRestaurant[]>({
    queryKey: ['petpooja-restaurants'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('petpooja_restaurants')
        .select('rest_id, outlet_id, token, notes, updated_at')
        .order('outlet_id')
      if (error) throw error
      return (data ?? []) as PetpoojaRestaurant[]
    },
  })
}

export function useUpsertPetpoojaRestaurant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      rest_id: string
      outlet_id: string
      token?: string | null
      notes?: string | null
    }) => {
      const { error } = await supabase
        .schema('core')
        .from('petpooja_restaurants')
        .upsert(
          {
            rest_id: input.rest_id.trim(),
            outlet_id: input.outlet_id,
            token: input.token?.trim() || null,
            notes: input.notes?.trim() || null,
          },
          { onConflict: 'rest_id' },
        )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['petpooja-restaurants'] }),
  })
}

export function useDeletePetpoojaRestaurant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rest_id: string) => {
      const { error } = await supabase
        .schema('core')
        .from('petpooja_restaurants')
        .delete()
        .eq('rest_id', rest_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['petpooja-restaurants'] }),
  })
}
