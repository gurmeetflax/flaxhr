import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type SCStatus = 'draft' | 'final'

export interface SCRun {
  id: string
  outlet_id: string
  outlet_name: string | null
  period_month: string
  status: SCStatus
  surcharge_collected: number
  company_retain_pct: number
  mnr_pct: number
  breakages_amount: number
  complaints_amount: number
  gross_payable: number | null
  net_payable: number | null
  total_points_sum: number | null
  point_value: number | null
  finalized_at: string | null
  finalized_by: string | null
  created_at: string
  updated_at: string
}

export interface SCRunHeader extends SCRun {
  surcharge_note: string | null
  breakages_note: string | null
  complaints_note: string | null
  notes: string | null
}

export interface SCRunPreviewLine {
  employee_id: string
  employee_code: string
  full_name: string
  hired_on: string | null
  designation_code: string | null
  designation_name: string
  points_per_day_default: number
  points_per_day: number
  points_per_day_override: number | null
  days_present_auto: number
  days_present: number
  days_present_override: number | null
  total_points: number
  projected_sc_payable: number
  notes: string | null
}

export interface SCRunLine {
  run_id: string
  employee_id: string
  employee_name: string
  employee_code: string
  hired_on: string | null
  designation_code: string | null
  designation_name: string | null
  days_present: number
  days_present_override: number | null
  points_per_day: number
  points_per_day_override: number | null
  total_points: number
  sc_payable: number
  notes: string | null
}

export function useSCRuns(filter?: { outletId?: string | null; status?: SCStatus | null }) {
  return useQuery<SCRun[]>({
    queryKey: ['sc-runs', filter ?? {}],
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from('v_sc_runs')
        .select('*')
        .order('period_month', { ascending: false })
      if (filter?.outletId) q = q.eq('outlet_id', filter.outletId)
      if (filter?.status) q = q.eq('status', filter.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as SCRun[]
    },
  })
}

export function useSCRun(id: string | undefined) {
  return useQuery<SCRunHeader | null>({
    queryKey: ['sc-run', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .schema('core' as never)
        .from('outlet_sc_runs')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      // Join in outlet_name from a separate fetch.
      const { data: o } = await supabase
        .from('flax_outlets')
        .select('display_name')
        .eq('id', (data as { outlet_id: string }).outlet_id)
        .maybeSingle()
      return {
        ...(data as Omit<SCRunHeader, 'outlet_name'>),
        outlet_name: (o?.display_name as string | undefined) ?? null,
      } as SCRunHeader
    },
  })
}

export function useSCRunPreview(id: string | undefined) {
  return useQuery<SCRunPreviewLine[]>({
    queryKey: ['sc-run-preview', id],
    enabled: !!id,
    staleTime: 5_000,
    queryFn: async () => {
      if (!id) return []
      const { data, error } = await supabase.rpc('compute_sc_run', { p_run_id: id })
      if (error) throw error
      return (data ?? []) as SCRunPreviewLine[]
    },
  })
}

export function useSCRunLines(id: string | undefined) {
  return useQuery<SCRunLine[]>({
    queryKey: ['sc-run-lines', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return []
      const { data, error } = await supabase
        .from('v_sc_run_lines')
        .select(
          'run_id, employee_id, employee_name, employee_code, hired_on, designation_code, designation_name, days_present, days_present_override, points_per_day, points_per_day_override, total_points, sc_payable, notes',
        )
        .eq('run_id', id)
        .order('total_points', { ascending: false })
      if (error) throw error
      return (data ?? []) as SCRunLine[]
    },
  })
}

export function useUpsertSCRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      outlet_id: string
      period_month: string // 'YYYY-MM-DD' (first of month)
      surcharge_collected?: number
      surcharge_note?: string | null
      company_retain_pct?: number
      mnr_pct?: number
      breakages_amount?: number
      breakages_note?: string | null
      complaints_amount?: number
      complaints_note?: string | null
      notes?: string | null
    }) => {
      const row: Record<string, unknown> = {
        outlet_id: input.outlet_id,
        period_month: input.period_month,
        surcharge_collected: input.surcharge_collected ?? 0,
        surcharge_note: input.surcharge_note ?? null,
        company_retain_pct: input.company_retain_pct ?? 30,
        mnr_pct: input.mnr_pct ?? 10,
        breakages_amount: input.breakages_amount ?? 0,
        breakages_note: input.breakages_note ?? null,
        complaints_amount: input.complaints_amount ?? 0,
        complaints_note: input.complaints_note ?? null,
        notes: input.notes ?? null,
      }
      if (input.id) row.id = input.id

      const { data, error } = await supabase
        .schema('core' as never)
        .from('outlet_sc_runs')
        .upsert(row, { onConflict: input.id ? 'id' : 'outlet_id,period_month' })
        .select('id')
        .maybeSingle()
      if (error) throw error
      return (data?.id as string | undefined) ?? null
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['sc-runs'] })
      if (vars.id) {
        qc.invalidateQueries({ queryKey: ['sc-run', vars.id] })
        qc.invalidateQueries({ queryKey: ['sc-run-preview', vars.id] })
      }
    },
  })
}

export function useDeleteSCRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .schema('core' as never)
        .from('outlet_sc_runs')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sc-runs'] }),
  })
}

export function useUpsertSCLineOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      run_id: string
      employee_id: string
      days_present?: number | null
      points_per_day?: number | null
      notes?: string | null
    }) => {
      const { error } = await supabase.rpc('upsert_sc_line_override', {
        p_run_id: input.run_id,
        p_employee_id: input.employee_id,
        p_days_present: input.days_present ?? null,
        p_points_per_day: input.points_per_day ?? null,
        p_notes: input.notes ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['sc-run-preview', vars.run_id] })
    },
  })
}

export function useFinalizeSCRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('finalize_sc_run', { p_run_id: id })
      if (error) throw error
      return data as {
        id: string
        gross_payable: number
        net_payable: number
        total_points_sum: number
        point_value: number
        lines: number
      }
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['sc-runs'] })
      qc.invalidateQueries({ queryKey: ['sc-run', id] })
      qc.invalidateQueries({ queryKey: ['sc-run-lines', id] })
      qc.invalidateQueries({ queryKey: ['sc-run-preview', id] })
    },
  })
}

export function useUnlockSCRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('unlock_sc_run', { p_run_id: id })
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['sc-runs'] })
      qc.invalidateQueries({ queryKey: ['sc-run', id] })
    },
  })
}

export interface MySC {
  run_id: string
  employee_id: string
  designation_name: string | null
  days_present: number
  points_per_day: number
  total_points: number
  sc_payable: number
  notes: string | null
  outlet_id: string
  outlet_name: string | null
  period_month: string
  point_value: number
  finalized_at: string
}

export function useMySC(limit = 1) {
  return useQuery<MySC[]>({
    queryKey: ['my-sc', limit],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_sc')
        .select('*')
        .limit(limit)
      if (error) throw error
      return (data ?? []) as MySC[]
    },
  })
}

/**
 * Live derivation of the header math, used in the UI before the next save.
 * Server computes the same values on finalize; this is just for instant
 * feedback as the admin edits inputs.
 */
export function deriveSCNumbers(input: {
  surcharge_collected: number
  company_retain_pct: number
  mnr_pct: number
  breakages_amount: number
  complaints_amount: number
}) {
  const retain = round2(input.surcharge_collected * (input.company_retain_pct / 100))
  const mnr = round2(input.surcharge_collected * (input.mnr_pct / 100))
  const gross = round2(input.surcharge_collected - retain - mnr)
  const net = round2(gross - input.breakages_amount - input.complaints_amount)
  return { retain, mnr, gross, net: net < 0 ? 0 : net }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
