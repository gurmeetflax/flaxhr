import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const GRIEVANCE_CATEGORIES = [
  { code: 'harassment',          label: 'Harassment (verbal, sexual, mental)' },
  { code: 'abuse',                label: 'Abuse (physical, mental)' },
  { code: 'discrimination',       label: 'Discrimination (gender, caste, religion, age)' },
  { code: 'bullying',             label: 'Bullying / hostile behaviour' },
  { code: 'retaliation',          label: 'Retaliation for raising a concern' },
  { code: 'wage_dispute',         label: 'Wage / payroll dispute' },
  { code: 'safety',               label: 'Workplace safety concern' },
  { code: 'workload',             label: 'Unreasonable workload / overtime' },
  { code: 'manager_misconduct',   label: 'Manager misconduct' },
  { code: 'whistleblower',        label: 'Whistleblower (fraud, theft, policy violation)' },
  { code: 'favouritism',          label: 'Favouritism / unfair treatment' },
  { code: 'other',                label: 'Other' },
] as const

export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number]['code']
export type GrievanceSeverity = 'low' | 'medium' | 'high'
export type GrievanceStatus = 'open' | 'under_review' | 'resolved' | 'dismissed'

export interface MyGrievance {
  id: string
  category: GrievanceCategory
  severity: GrievanceSeverity
  subject: string
  description: string
  status: GrievanceStatus
  resolution: string | null
  created_at: string
  resolved_at: string | null
}

export interface AdminGrievance extends MyGrievance {
  employee_id: string | null
  is_anonymous: boolean
  hr_notes: string | null
  resolved_by: string | null
  updated_at: string
  employee_code: string | null
  full_name: string
  outlet_id: string | null
  outlet_name: string | null
}

export function useMyGrievances() {
  return useQuery<MyGrievance[]>({
    queryKey: ['my-grievances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_my_grievances').select('*')
      if (error) throw error
      return (data ?? []) as MyGrievance[]
    },
  })
}

export function useGrievances() {
  return useQuery<AdminGrievance[]>({
    queryKey: ['grievances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_grievances').select('*')
      if (error) throw error
      return (data ?? []) as AdminGrievance[]
    },
  })
}

export function useSubmitGrievance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      category: GrievanceCategory
      subject: string
      description: string
      severity?: GrievanceSeverity
      anonymous?: boolean
    }) => {
      const { error } = await supabase.rpc('submit_grievance', {
        p_category: input.category,
        p_subject: input.subject,
        p_description: input.description,
        p_severity: input.severity ?? 'medium',
        p_anonymous: input.anonymous ?? false,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-grievances'] }),
  })
}

export function useUpdateGrievanceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      status: GrievanceStatus
      hr_notes?: string
      resolution?: string
    }) => {
      const { error } = await supabase.rpc('update_grievance_status', {
        p_id: input.id,
        p_status: input.status,
        p_hr_notes: input.hr_notes ?? null,
        p_resolution: input.resolution ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grievances'] }),
  })
}
