import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EmployeeSnapshot {
  employee_id: string
  employee_code: string
  employee_name: string
  first_name: string | null
  last_name: string | null
  personal_email: string | null
  phone: string | null
  date_of_birth: string | null
  hired_on: string | null
  tenure_days: number | null
  designation_code: string | null
  designation_name: string | null
  outlet_id: string | null
  outlet_name: string | null
  monthly_salary: number | null
  kyc_status: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  address: string | null
  latest_selfie_path: string | null
  latest_selfie_at: string | null
  late_count_30d: number
  absent_count_30d: number
  present_count_30d: number
  on_leave_count_30d: number
  avg_late_minutes_30d: number | null
  leaves_pending: number
  leaves_used: number
  pip_open_count: number
  pip_target_date: string | null
  warning_count: number
  last_warning_at: string | null
  uniform_active_count: number
  uniform_active_qty: number
  has_offer_letter: boolean
  has_appointment_letter: boolean
  has_contract: boolean
  document_count: number
}

export function useEmployeeSnapshot(employeeId: string | undefined) {
  return useQuery<EmployeeSnapshot | null>({
    queryKey: ['employee-snapshot', employeeId],
    enabled: !!employeeId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employee_snapshot')
        .select('*')
        .eq('employee_id', employeeId!)
        .maybeSingle()
      if (error) throw error
      return (data as EmployeeSnapshot | null) ?? null
    },
  })
}

export function useSignedUrl(path: string | null | undefined, bucket = 'attendance-selfies') {
  return useQuery<string | null>({
    queryKey: ['signed-url', bucket, path],
    enabled: !!path,
    staleTime: 55_000,
    queryFn: async () => {
      if (!path) return null
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
      if (error) return null
      return data.signedUrl
    },
  })
}
