import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { haversineMeters } from '@/lib/geo'

export interface MyOutlet {
  employee_id: string
  outlet_id: string
  outlet_name: string | null
  outlet_city: string | null
  role: 'home' | 'occasional' | 'area_manager'
  is_primary: boolean
  lat: number | null
  lng: number | null
  geofence_radius_m: number | null
}

export interface EmployeeOutletRow {
  employee_id: string
  outlet_id: string
  outlet_name: string | null
  outlet_city: string | null
  role: 'home' | 'occasional' | 'area_manager'
  is_primary: boolean
  created_at: string
}

export function useMyOutlets() {
  return useQuery<MyOutlet[]>({
    queryKey: ['my-outlets'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_outlets')
        .select('*')
      if (error) throw error
      return (data ?? []) as MyOutlet[]
    },
  })
}

export function useEmployeeOutlets(employeeId: string | undefined) {
  return useQuery<EmployeeOutletRow[]>({
    queryKey: ['employee-outlets', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      if (!employeeId) return []
      const { data, error } = await supabase
        .from('v_employee_outlets')
        .select('*')
        .eq('employee_id', employeeId)
      if (error) throw error
      return (data ?? []) as EmployeeOutletRow[]
    },
  })
}

export function useSetEmployeeOutlets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employee_id: string
      outlet_ids: string[]
      role?: 'occasional' | 'area_manager'
    }) => {
      const { error } = await supabase.rpc('set_employee_outlets', {
        p_employee: input.employee_id,
        p_outlet_ids: input.outlet_ids,
        p_role: input.role ?? 'occasional',
      })
      if (error) throw error
    },
    onSuccess: (_p, vars) => {
      qc.invalidateQueries({ queryKey: ['employee-outlets', vars.employee_id] })
    },
  })
}

/**
 * Pick the outlet for a punch given the user's current GPS.
 *
 * Priority:
 *   1. If exactly one outlet is in range, pick it.
 *   2. If multiple are in range, pick the closest.
 *   3. If none are in range, pick the closest outlet (so the
 *      OUT_OF_GEOFENCE error reports a sensible distance against the
 *      one the user is most likely heading to).
 *   4. If the user has no outlets at all, return null and let the
 *      server complain.
 */
export interface OutletPick {
  outlet: MyOutlet
  distance_m: number
  inRange: boolean
}

export function pickOutletForPunch(
  outlets: MyOutlet[],
  lat: number,
  lng: number,
): OutletPick | null {
  if (outlets.length === 0) return null
  const candidates = outlets
    .filter((o) => o.lat != null && o.lng != null)
    .map((o) => {
      const distance_m = haversineMeters({ lat, lng }, { lat: o.lat!, lng: o.lng! })
      const radius = o.geofence_radius_m ?? 200
      return { outlet: o, distance_m, inRange: distance_m <= radius }
    })
  if (candidates.length === 0) return null

  const inRange = candidates.filter((c) => c.inRange)
  if (inRange.length > 0) {
    return inRange.sort((a, b) => a.distance_m - b.distance_m)[0]
  }
  return candidates.sort((a, b) => a.distance_m - b.distance_m)[0]
}
