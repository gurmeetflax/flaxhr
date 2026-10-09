import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { startOfDay } from 'date-fns'
import { supabase } from '@/lib/supabase'

export interface FieldVisit {
  id: string
  employee_id: string
  employee_code: string
  employee_name: string
  outlet_id: string | null
  client_name: string
  purpose: string | null
  outcome: string | null
  check_in_at: string
  check_in_lat: number
  check_in_lng: number
  check_in_accuracy_m: number | null
  check_out_at: string | null
  check_out_lat: number | null
  check_out_lng: number | null
  check_out_accuracy_m: number | null
  duration_min: number | null
}

interface Coords {
  lat: number
  lng: number
  accuracy: number | null
}

const ERRORS: Record<string, string> = {
  LOCATION_REQUIRED: 'Waiting for your location.',
  CLIENT_REQUIRED: 'Enter who you are meeting.',
  NOT_FIELD_STAFF: 'Meetings are only for field staff. Ask HR to turn it on.',
  MEETING_ALREADY_OPEN: 'You are already in a meeting. Check out of it first.',
  NO_OPEN_MEETING: 'No meeting to check out of.',
}

function friendly(err: { message?: string }): Error {
  const code = Object.keys(ERRORS).find((k) => err.message?.startsWith(k))
  return new Error(code ? ERRORS[code] : (err.message ?? 'Something went wrong'))
}

// The signed-in employee's meetings from the start of today.
export function useMyTodayVisits(employeeId: string | undefined) {
  return useQuery<FieldVisit[]>({
    queryKey: ['my-field-visits', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_field_visits')
        .select('*')
        .eq('employee_id', employeeId!)
        .gte('check_in_at', startOfDay(new Date()).toISOString())
        .order('check_in_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FieldVisit[]
    },
  })
}

// Admin list for a date range (RLS scopes managers to their outlets).
export function useFieldVisits(from: string, to: string) {
  return useQuery<FieldVisit[]>({
    queryKey: ['field-visits', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_field_visits')
        .select('*')
        .gte('check_in_at', new Date(`${from}T00:00:00`).toISOString())
        .lte('check_in_at', new Date(`${to}T23:59:59`).toISOString())
        .order('check_in_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      return (data ?? []) as FieldVisit[]
    },
  })
}

export function useMeetingCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { client: string; purpose: string; coords: Coords }) => {
      const { error } = await supabase.rpc('field_visit_check_in', {
        p_client_name: v.client,
        p_purpose: v.purpose,
        p_lat: v.coords.lat,
        p_lng: v.coords.lng,
        p_accuracy_m: v.coords.accuracy != null ? Math.round(v.coords.accuracy) : null,
      })
      if (error) throw friendly(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-field-visits'] }),
  })
}

export function useMeetingCheckOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { outcome: string; coords: Coords }) => {
      const { error } = await supabase.rpc('field_visit_check_out', {
        p_outcome: v.outcome,
        p_lat: v.coords.lat,
        p_lng: v.coords.lng,
        p_accuracy_m: v.coords.accuracy != null ? Math.round(v.coords.accuracy) : null,
      })
      if (error) throw friendly(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-field-visits'] }),
  })
}

export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
