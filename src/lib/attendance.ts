import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { compressImage } from '@/lib/imageCompression'

export interface PunchLog {
  id: string
  type: 'in' | 'out'
  punched_at: string
  selfie_path: string | null
  is_within_geofence: boolean | null
  distance_m: number | null
  lat: number | null
  lng: number | null
  outlet_id: string | null
}

export interface PunchResult {
  id: string
  type: 'in' | 'out'
  punched_at: string
  selfie_path: string
  is_within_geofence: boolean
  distance_m: number
  outlet_id: string
}

export interface AttendanceRow {
  id: string
  type: 'in' | 'out'
  punched_at: string
  selfie_path: string | null
  is_within_geofence: boolean | null
  distance_m: number | null
  lat: number | null
  lng: number | null
  source: 'self' | 'regularised'
  outlet_id: string | null
  outlet_name: string | null
  outlet_timezone: string | null
  geofence_radius_m: number | null
  employee_id: string
  employee_code: string
  employee_name: string
}

export interface AttendanceFilters {
  outletId?: string | null
  employeeId?: string | null
  fromDate?: string | null
  toDate?: string | null
  source?: 'self' | 'regularised' | null
  type?: 'in' | 'out' | null
  limit?: number
}

export function useAttendance(filters: AttendanceFilters = {}) {
  return useQuery<AttendanceRow[]>({
    queryKey: ['attendance', filters],
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from('v_attendance')
        .select(
          'id, type, punched_at, selfie_path, is_within_geofence, distance_m, lat, lng, source, outlet_id, outlet_name, outlet_timezone, geofence_radius_m, employee_id, employee_code, employee_name',
        )
        .order('punched_at', { ascending: false })
        .limit(filters.limit ?? 500)
      if (filters.outletId) q = q.eq('outlet_id', filters.outletId)
      if (filters.employeeId) q = q.eq('employee_id', filters.employeeId)
      if (filters.source) q = q.eq('source', filters.source)
      if (filters.type) q = q.eq('type', filters.type)
      if (filters.fromDate) q = q.gte('punched_at', filters.fromDate)
      if (filters.toDate) q = q.lte('punched_at', filters.toDate)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as AttendanceRow[]
    },
  })
}

export function useMyAttendance(filters: Omit<AttendanceFilters, 'employeeId'> = {}) {
  const { user } = useAuth()
  return useQuery<AttendanceRow[]>({
    queryKey: ['my-attendance', user?.id, filters],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from('v_attendance')
        .select(
          'id, type, punched_at, selfie_path, is_within_geofence, distance_m, lat, lng, source, outlet_id, outlet_name, outlet_timezone, geofence_radius_m, employee_id, employee_code, employee_name',
        )
        .order('punched_at', { ascending: false })
        .limit(filters.limit ?? 200)
      if (filters.outletId) q = q.eq('outlet_id', filters.outletId)
      if (filters.source) q = q.eq('source', filters.source)
      if (filters.type) q = q.eq('type', filters.type)
      if (filters.fromDate) q = q.gte('punched_at', filters.fromDate)
      if (filters.toDate) q = q.lte('punched_at', filters.toDate)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as AttendanceRow[]
    },
  })
}

export interface MyOutlet {
  id: string
  display_name: string | null
  name: string | null
  city: string | null
  timezone: string | null
  address: string | null
  lat: number | null
  lng: number | null
  geofence_radius_m: number | null
}

export function useMyOutlet() {
  const { user } = useAuth()
  return useQuery<MyOutlet | null>({
    queryKey: ['my-outlet', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_outlet')
        .select('id, display_name, name, city, timezone, address, lat, lng, geofence_radius_m')
        .maybeSingle()
      if (error) throw error
      return (data as MyOutlet) ?? null
    },
  })
}

export function useMyTodayPunches() {
  const { user } = useAuth()
  return useQuery<PunchLog[]>({
    queryKey: ['my-today-punches', user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_today_punches')
        .select('id, type, punched_at, selfie_path, is_within_geofence, distance_m, lat, lng, outlet_id')
      if (error) throw error
      return (data ?? []) as PunchLog[]
    },
  })
}

export function useNextPunchType(): 'in' | 'out' {
  const { data = [] } = useMyTodayPunches()
  const last = data[0]
  return !last || last.type === 'out' ? 'in' : 'out'
}

interface PunchInput {
  /** Omit when the selfie_required setting is off. */
  selfie?: Blob
  lat: number
  lng: number
}

export function usePunch() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation<PunchResult, Error, PunchInput>({
    mutationFn: async ({ selfie, lat, lng }) => {
      if (!user) throw new Error('Not signed in')

      // When the selfie_required setting is off, the client may omit the
      // selfie blob entirely; otherwise we downsample + JPEG re-encode in
      // the browser before upload. Phone cameras produce 2–4 MB selfies
      // and we only need ~720 px to verify identity, so this keeps
      // storage and bandwidth bounded.
      let path: string | null = null
      if (selfie) {
        const compressed = await compressImage(selfie)
        const contentType = compressed.type || 'image/jpeg'
        const ext = mimeToExt(contentType) ?? 'jpg'
        path = `${user.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('attendance-selfies')
          .upload(path, compressed, {
            contentType,
            cacheControl: '3600',
            upsert: false,
          })
        if (upErr) throw new Error(`Selfie upload failed: ${upErr.message}`)
      }

      const { data, error } = await supabase.rpc('punch', {
        p_type: 'auto',
        p_lat: lat,
        p_lng: lng,
        p_selfie_path: path,
        p_user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 256) : null,
      })

      if (error) throw mapPunchError(error.message)
      return data as PunchResult
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-today-punches'] })
    },
  })
}

function mimeToExt(mime: string): string | null {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return null
}

function mapPunchError(message: string): Error {
  const m = message ?? ''
  if (m.includes('OUT_OF_GEOFENCE')) {
    const dist = /distance_m=(\d+)/.exec(m)?.[1]
    const radius = /radius_m=(\d+)/.exec(m)?.[1]
    return new Error(
      dist && radius
        ? `Outside geofence — you're ${dist} m away (allowed: ${radius} m). Move closer to the outlet.`
        : 'You are outside the outlet geofence. Move closer to punch.',
    )
  }
  if (m.includes('SELFIE_REQUIRED')) return new Error('Selfie is required.')
  if (m.includes('LOCATION_REQUIRED')) return new Error('Location is required.')
  if (m.includes('NO_OUTLET_ASSIGNED')) return new Error('No outlet is assigned to you.')
  if (m.includes('OUTLET_GEOFENCE_NOT_CONFIGURED'))
    return new Error('Your outlet has no geofence configured. Ask an admin.')
  if (m.includes('NO_ACTIVE_EMPLOYEE'))
    return new Error('Your employee profile is inactive.')
  return new Error(m || 'Punch failed')
}

export async function getSignedSelfieUrl(path: string, expiresInSec = 60): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('attendance-selfies')
    .createSignedUrl(path, expiresInSec)
  if (error) return null
  return data.signedUrl
}
