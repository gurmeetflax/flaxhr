import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface OvertimeMonthlyRow {
  employee_id: string
  employee_code: string
  employee_name: string
  outlet_id: string | null
  outlet_name: string | null
  period_month: string
  worked_minutes_total: number
  worked_hours_total: number
  ot_minutes_total: number
  ot_hours_total: number
  ot_days: number
  hourly_rate: number
  ot_amount_total: number
}

export interface OvertimeDailyRow {
  employee_id: string
  employee_code: string
  employee_name: string
  outlet_id: string | null
  outlet_name: string | null
  work_date: string
  worked_minutes: number
  worked_hours: number
  ot_minutes: number
  ot_hours: number
  monthly_salary: number | null
  hourly_rate: number
  ot_amount: number
}

export function useOvertimeMonthly(periodMonth: string, outletId?: string | null) {
  return useQuery<OvertimeMonthlyRow[]>({
    queryKey: ['overtime-monthly', periodMonth, outletId ?? 'all'],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('v_overtime_monthly')
        .select(
          'employee_id, employee_code, employee_name, outlet_id, outlet_name, period_month, worked_minutes_total, worked_hours_total, ot_minutes_total, ot_hours_total, ot_days, hourly_rate, ot_amount_total',
        )
        .eq('period_month', periodMonth)
        .order('ot_hours_total', { ascending: false })
      if (outletId) q = q.eq('outlet_id', outletId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r) => ({
        ...r,
        worked_hours_total: Number(r.worked_hours_total ?? 0),
        ot_hours_total: Number(r.ot_hours_total ?? 0),
        hourly_rate: Number(r.hourly_rate ?? 0),
        ot_amount_total: Number(r.ot_amount_total ?? 0),
      })) as OvertimeMonthlyRow[]
    },
  })
}

export function useOvertimeDailyForEmployee(employeeId: string | undefined, periodMonth: string) {
  return useQuery<OvertimeDailyRow[]>({
    queryKey: ['overtime-daily', employeeId, periodMonth],
    enabled: !!employeeId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_overtime_daily')
        .select('*')
        .eq('employee_id', employeeId!)
        .gte('work_date', periodMonth)
        .lt('work_date', endOfMonthISO(periodMonth))
        .order('work_date')
      if (error) throw error
      return (data ?? []) as OvertimeDailyRow[]
    },
  })
}

export function useMyOvertimeMonthly() {
  return useQuery<OvertimeMonthlyRow[]>({
    queryKey: ['my-overtime-monthly'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_overtime_monthly')
        .select('*')
        .order('period_month', { ascending: false })
        .limit(24)
      if (error) throw error
      return (data ?? []) as OvertimeMonthlyRow[]
    },
  })
}

export function useMyOvertimeDaily(periodMonth: string) {
  return useQuery<OvertimeDailyRow[]>({
    queryKey: ['my-overtime-daily', periodMonth],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_overtime_daily')
        .select('*')
        .gte('work_date', periodMonth)
        .lt('work_date', endOfMonthISO(periodMonth))
        .order('work_date')
      if (error) throw error
      return (data ?? []) as OvertimeDailyRow[]
    },
  })
}

function endOfMonthISO(startOfMonth: string): string {
  // startOfMonth = 'YYYY-MM-01' → returns first day of NEXT month
  const d = new Date(startOfMonth + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}
