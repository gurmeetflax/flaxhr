import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PayrollRun {
  id: string
  outlet_id: string
  outlet_name: string | null
  period_month: string
  status: 'draft' | 'finalised'
  created_at: string
  finalised_at: string | null
  employee_count: number
  total_net: number
  total_gross: number
}

export interface DeductionLine {
  id: string
  kind: 'uniform' | 'advance' | 'other'
  amount: number
  months_remaining: number
  notes: string | null
}

export interface PayrollLine {
  id: string
  run_id: string
  employee_id: string
  employee_code: string
  full_name: string
  gross: number
  days_in_month: number
  days_present: number
  days_paid_leave: number
  days_payable: number
  prorated_gross: number
  deductions_total: number
  deductions_breakdown: DeductionLine[]
  net_pay: number
  period_month: string
  status: 'draft' | 'finalised'
  outlet_id: string
}

export interface MyPayslip {
  id: string
  run_id: string
  employee_id: string
  gross: number
  days_in_month: number
  days_present: number
  days_paid_leave: number
  days_payable: number
  prorated_gross: number
  deductions_total: number
  deductions_breakdown: DeductionLine[]
  net_pay: number
  period_month: string
  finalised_at: string
  outlet_id: string
  outlet_name: string | null
  employee_code: string
  full_name: string
}

export function usePayrollRuns(outletId?: string | null) {
  return useQuery<PayrollRun[]>({
    queryKey: ['payroll-runs', outletId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('v_payroll_runs').select('*').order('period_month', { ascending: false })
      if (outletId) q = q.eq('outlet_id', outletId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PayrollRun[]
    },
  })
}

export function usePayrollRun(runId: string | undefined) {
  return useQuery<PayrollRun | null>({
    queryKey: ['payroll-run', runId],
    enabled: !!runId,
    queryFn: async () => {
      if (!runId) return null
      const { data, error } = await supabase
        .from('v_payroll_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle()
      if (error) throw error
      return (data as PayrollRun | null) ?? null
    },
  })
}

export function usePayrollLines(runId: string | undefined) {
  return useQuery<PayrollLine[]>({
    queryKey: ['payroll-lines', runId],
    enabled: !!runId,
    queryFn: async () => {
      if (!runId) return []
      const { data, error } = await supabase
        .from('v_payroll_run_lines')
        .select('*')
        .eq('run_id', runId)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as PayrollLine[]
    },
  })
}

export function useCreatePayrollRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { outlet_id: string; period_month: string }) => {
      const { data, error } = await supabase.rpc('create_payroll_run', {
        p_outlet_id: input.outlet_id,
        p_period_month: input.period_month,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  })
}

export function useComputePayrollRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase.rpc('compute_payroll_run', { p_run_id: runId })
      if (error) throw error
    },
    onSuccess: (_p, runId) => {
      qc.invalidateQueries({ queryKey: ['payroll-lines', runId] })
      qc.invalidateQueries({ queryKey: ['payroll-runs'] })
    },
  })
}

export function useFinalisePayrollRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase.rpc('finalise_payroll_run', { p_run_id: runId })
      if (error) throw error
    },
    onSuccess: (_p, runId) => {
      qc.invalidateQueries({ queryKey: ['payroll-lines', runId] })
      qc.invalidateQueries({ queryKey: ['payroll-run', runId] })
      qc.invalidateQueries({ queryKey: ['payroll-runs'] })
    },
  })
}

export function useMyPayslips() {
  return useQuery<MyPayslip[]>({
    queryKey: ['my-payslips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_payslips')
        .select('*')
        .order('period_month', { ascending: false })
      if (error) throw error
      return (data ?? []) as MyPayslip[]
    },
  })
}

// Deductions ledger ---------------------------------------------------------

export interface Deduction {
  id: string
  employee_id: string
  kind: 'uniform' | 'advance' | 'other'
  total_amount: number
  monthly_amount: number
  months_total: number
  months_remaining: number
  started_on: string
  notes: string | null
  is_active: boolean
}

export function useDeductions(employeeId: string | undefined) {
  return useQuery<Deduction[]>({
    queryKey: ['deductions', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      if (!employeeId) return []
      const { data, error } = await supabase
        .schema('core' as never)
        .from('deductions')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Deduction[]
    },
  })
}

export function useAddDeduction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employee_id: string
      kind: 'uniform' | 'advance' | 'other'
      total_amount: number
      months: number
      notes?: string
    }) => {
      const monthly = Math.round((input.total_amount / input.months) * 100) / 100
      const { error } = await supabase
        .schema('core' as never)
        .from('deductions')
        .insert({
          employee_id: input.employee_id,
          kind: input.kind,
          total_amount: input.total_amount,
          monthly_amount: monthly,
          months_total: input.months,
          months_remaining: input.months,
          notes: input.notes ?? null,
        })
      if (error) throw error
    },
    onSuccess: (_p, vars) => {
      qc.invalidateQueries({ queryKey: ['deductions', vars.employee_id] })
    },
  })
}

export function useDeactivateDeduction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .schema('core' as never)
        .from('deductions')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deductions'] }),
  })
}
