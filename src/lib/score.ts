import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EmployeeScore {
  employee_id: string
  period_month: string
  attendance_score: number
  leaves_score: number
  evaluations_score: number
  complaints_score: number
  knowledge_score: number
  weights: {
    attendance?: number
    leaves?: number
    evaluations?: number
    complaints?: number
    knowledge?: number
  }
  total_score: number
}

export function useEmployeeScore(employeeId: string | undefined, periodMonth: string) {
  return useQuery<EmployeeScore | null>({
    queryKey: ['employee-score', employeeId, periodMonth],
    enabled: !!employeeId,
    queryFn: async () => {
      if (!employeeId) return null
      const { data, error } = await supabase.rpc('employee_score', {
        p_employee: employeeId,
        p_period_month: periodMonth,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (row as EmployeeScore | null) ?? null
    },
  })
}

export function useUpsertKnowledgeScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employee_id: string
      period_month: string
      score: number
      notes?: string
    }) => {
      const { error } = await supabase.rpc('upsert_knowledge_score', {
        p_employee: input.employee_id,
        p_period_month: input.period_month,
        p_score: input.score,
        p_notes: input.notes ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-score'] })
    },
  })
}
