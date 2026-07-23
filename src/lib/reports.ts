import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type AttendanceStatus = 'on_leave' | 'absent' | 'late' | 'present'

export interface AttendanceReportRow {
  employee_id: string
  employee_code: string
  employee_name: string
  designation_name: string | null
  outlet_id: string | null
  outlet_name: string | null
  outlet_timezone: string | null
  work_date: string // YYYY-MM-DD
  first_in_at: string | null
  last_out_at: string | null
  scheduled_start_at: string | null
  scheduled_end_at: string | null
  grace_in_minutes: number
  late_minutes: number | null
  worked_minutes: number | null
  status: AttendanceStatus
}

export interface AttendanceReportFilters {
  outletId?: string | null
  fromDate?: string | null // YYYY-MM-DD
  toDate?: string | null   // YYYY-MM-DD
  limit?: number
}

export function useAttendanceReport(filters: AttendanceReportFilters = {}) {
  return useQuery<AttendanceReportRow[]>({
    queryKey: ['attendance-report', filters],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('v_attendance_report')
        .select(
          'employee_id, employee_code, employee_name, designation_name, outlet_id, outlet_name, outlet_timezone, work_date, first_in_at, last_out_at, scheduled_start_at, scheduled_end_at, grace_in_minutes, late_minutes, worked_minutes, status',
        )
        .order('work_date', { ascending: false })
        .order('employee_code', { ascending: true })
        .limit(filters.limit ?? 2000)
      if (filters.outletId) q = q.eq('outlet_id', filters.outletId)
      if (filters.fromDate) q = q.gte('work_date', filters.fromDate)
      if (filters.toDate) q = q.lte('work_date', filters.toDate)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as AttendanceReportRow[]
    },
  })
}

export interface EmployeeLeaveSummary {
  employee_id: string
  employee_code: string
  employee_name: string
  leaves_pending: number
  leaves_used: number
}

export function useEmployeeLeaveSummary() {
  return useQuery<EmployeeLeaveSummary[]>({
    queryKey: ['employee-leave-summary'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_employee_leave_summary')
        .select('employee_id, employee_code, employee_name, leaves_pending, leaves_used')
      if (error) throw error
      return (data ?? []).map((r) => ({
        employee_id: r.employee_id,
        employee_code: r.employee_code,
        employee_name: r.employee_name,
        leaves_pending: Number(r.leaves_pending ?? 0),
        leaves_used: Number(r.leaves_used ?? 0),
      })) as EmployeeLeaveSummary[]
    },
  })
}
