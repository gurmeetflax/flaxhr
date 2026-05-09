import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export interface AdminDashboardSummary {
  period_month: string
  outlet_id: string | null
  headcount: number
  joiners: number
  leavers: number
  attrition_pct: number
  manpower_cost: number
  sales: number
  manpower_cost_pct: number | null
  present_today: number
  late_today: number
  absent_today: number
  on_leave_today: number
}

export function useAdminDashboardSummary(periodMonth: string, outletId: string | null) {
  return useQuery<AdminDashboardSummary | null>({
    queryKey: ['admin-dashboard-summary', periodMonth, outletId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_dashboard_summary', {
        p_period_month: periodMonth,
        p_outlet_id: outletId,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (row as AdminDashboardSummary) ?? null
    },
  })
}

export type RosterAttendanceFlag = 'on_time' | 'late' | 'missed'

export interface RosterAttendanceRow {
  employee_id: string
  employee_code: string
  employee_name: string
  outlet_id: string | null
  outlet_name: string | null
  shift_name: string | null
  planned_start: string | null
  planned_end: string | null
  grace_minutes: number
  actual_in: string | null
  delta_minutes: number | null
  flag: RosterAttendanceFlag
}

export function useRosterVsAttendance(date: string, outletId: string | null) {
  return useQuery<RosterAttendanceRow[]>({
    queryKey: ['roster-vs-attendance', date, outletId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('roster_vs_attendance', {
        p_date: date,
        p_outlet_id: outletId,
      })
      if (error) throw error
      return (data ?? []) as RosterAttendanceRow[]
    },
  })
}

export interface TodayPunch {
  id: string
  type: 'in' | 'out'
  punched_at: string
  outlet_id: string | null
  outlet_name: string | null
  employee_id: string
  employee_code: string
  full_name: string
}

export function useTodayPunches(outletId: string | null) {
  return useQuery<TodayPunch[]>({
    queryKey: ['today-punches', outletId],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('v_today_punches')
        .select(
          'id, type, punched_at, outlet_id, outlet_name, employee_id, employee_code, full_name',
        )
        .order('punched_at', { ascending: true })
      if (outletId) q = q.eq('outlet_id', outletId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as TodayPunch[]
    },
  })
}

export interface OutletMonthlySalesRow {
  outlet_id: string
  outlet_name: string | null
  period_month: string
  amount: number
  updated_at: string
}

export function useOutletMonthlySales(periodMonth: string) {
  return useQuery<OutletMonthlySalesRow[]>({
    queryKey: ['outlet-monthly-sales', periodMonth],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_outlet_monthly_sales')
        .select('outlet_id, outlet_name, period_month, amount, updated_at')
        .eq('period_month', periodMonth)
      if (error) throw error
      return (data ?? []) as OutletMonthlySalesRow[]
    },
  })
}

export function useUpsertOutletSales() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { outlet_id: string; period_month: string; amount: number }) => {
      const { error } = await supabase.rpc('upsert_outlet_sales', {
        p_outlet_id: input.outlet_id,
        p_period_month: input.period_month,
        p_amount: input.amount,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outlet-monthly-sales'] })
      qc.invalidateQueries({ queryKey: ['admin-dashboard-summary'] })
    },
  })
}

export interface MyDashboardSummary {
  employee_id: string | null
  month_present_days: number
  month_absent_days: number
  month_late_days: number
  paid_leave_balance_total: number
  today_shift_start: string | null
  today_shift_end: string | null
  last_punch_at: string | null
  last_punch_type: 'in' | 'out' | null
  next_roster_date: string | null
  next_roster_start: string | null
  next_roster_shift_name: string | null
}

export function useMyDashboardSummary() {
  const { user } = useAuth()
  return useQuery<MyDashboardSummary | null>({
    queryKey: ['my-dashboard-summary', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_dashboard_summary')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return (data as MyDashboardSummary) ?? null
    },
  })
}
