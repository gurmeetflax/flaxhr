import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface GiftCode {
  id: string
  code: string
  provider: string
  face_value: number
  currency: string
  expires_on: string | null
  assigned_to: string | null
  assigned_at: string | null
  notes: string | null
  created_at: string
  assignee_name?: string | null
  assignee_code?: string | null
}

export interface GiftCodeStats {
  provider: string
  available: number
  assigned: number
  expired: number
}

export function useGiftCodes() {
  return useQuery<GiftCode[]>({
    queryKey: ['gift-codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core' as never)
        .from('gift_codes')
        .select(
          'id, code, provider, face_value, currency, expires_on, assigned_to, assigned_at, notes, created_at, assignee:employees!gift_codes_assigned_to_fkey(full_name, employee_code)',
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as Array<
        GiftCode & { assignee: { full_name: string; employee_code: string } | null }
      >).map((r) => ({
        ...r,
        assignee_name: r.assignee?.full_name ?? null,
        assignee_code: r.assignee?.employee_code ?? null,
      }))
    },
  })
}

export function useGiftCodeStats() {
  return useQuery<GiftCodeStats[]>({
    queryKey: ['gift-codes-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_gift_codes_stats')
        .select('provider, available, assigned, expired')
      if (error) throw error
      return (data ?? []) as GiftCodeStats[]
    },
  })
}

export function useAddGiftCodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      codes: string[]
      provider: string
      face_value: number
      currency: string
      expires_on: string | null
      notes: string | null
    }) => {
      const rows = input.codes
        .map((c) => c.trim())
        .filter(Boolean)
        .map((code) => ({
          code,
          provider: input.provider,
          face_value: input.face_value,
          currency: input.currency,
          expires_on: input.expires_on,
          notes: input.notes,
        }))
      if (rows.length === 0) throw new Error('No codes to add')
      const { error } = await supabase
        .schema('core' as never)
        .from('gift_codes')
        .insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gift-codes'] })
      qc.invalidateQueries({ queryKey: ['gift-codes-stats'] })
    },
  })
}

export function useDeleteGiftCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .schema('core' as never)
        .from('gift_codes')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gift-codes'] })
      qc.invalidateQueries({ queryKey: ['gift-codes-stats'] })
    },
  })
}

export interface BirthdayTodayRow {
  employee_id: string
  employee_code: string
  full_name: string
  personal_email: string | null
  outlet_id: string | null
  date_of_birth: string
}

export function useBirthdaysToday() {
  return useQuery<BirthdayTodayRow[]>({
    queryKey: ['birthdays-today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_birthday_today')
        .select('employee_id, employee_code, full_name, personal_email, outlet_id, date_of_birth')
      if (error) throw error
      return (data ?? []) as BirthdayTodayRow[]
    },
  })
}

export function useRunBirthdaysToday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_birthdays_today')
      if (error) throw error
      return (data ?? []) as Array<{ employee_id: string; full_name: string; notification_id: string | null }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gift-codes'] })
      qc.invalidateQueries({ queryKey: ['gift-codes-stats'] })
      qc.invalidateQueries({ queryKey: ['my-notifications'] })
    },
  })
}
