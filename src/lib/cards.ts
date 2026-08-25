import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type CardColour = 'yellow' | 'red' | 'green'
export type CardStatus = 'active' | 'expired' | 'appealed' | 'rescinded' | 'acknowledged'

export interface CardReason {
  code: string
  title: string
  description: string | null
  colour: CardColour
  category: string
  is_auto: boolean
  threshold: Record<string, unknown> | null
  is_active: boolean
}

export interface CardRow {
  id: string
  employee_id: string
  employee_code: string
  employee_name: string
  outlet_name: string | null
  reason_code: string
  reason_title: string
  reason_category: string
  colour: CardColour
  incident_date: string
  source: 'manual' | 'auto'
  status: CardStatus
  expires_at: string | null
  acknowledged_at: string | null
  notes: string | null
  issued_at: string
}

export function useCardReasons() {
  return useQuery<CardReason[]>({
    queryKey: ['card-reasons'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('card_reasons')
        .select('*')
        .order('colour')
        .order('category')
      if (error) throw error
      return (data ?? []) as CardReason[]
    },
  })
}

export function useUpsertCardReason() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: Partial<CardReason> & { code: string; title: string; colour: CardColour; category: string }) => {
      const { error } = await supabase
        .schema('core')
        .from('card_reasons')
        .upsert(
          {
            code: r.code,
            title: r.title,
            description: r.description ?? null,
            colour: r.colour,
            category: r.category,
            is_auto: r.is_auto ?? false,
            threshold: r.threshold ?? null,
            is_active: r.is_active ?? true,
          },
          { onConflict: 'code' },
        )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-reasons'] }),
  })
}

export function useCards(filter?: {
  status?: CardStatus | null
  colour?: CardColour | null
  outletId?: string | null
  employeeId?: string | null
  limit?: number
}) {
  return useQuery<CardRow[]>({
    queryKey: ['cards', filter ?? {}],
    staleTime: 20_000,
    queryFn: async () => {
      let q = supabase
        .from('v_cards')
        .select(
          'id, employee_id, employee_code, employee_name, outlet_name, reason_code, reason_title, reason_category, colour, incident_date, source, status, expires_at, acknowledged_at, notes, issued_at, outlet_id',
        )
        .order('issued_at', { ascending: false })
        .limit(filter?.limit ?? 500)
      if (filter?.status) q = q.eq('status', filter.status)
      if (filter?.colour) q = q.eq('colour', filter.colour)
      if (filter?.outletId) q = q.eq('outlet_id', filter.outletId)
      if (filter?.employeeId) q = q.eq('employee_id', filter.employeeId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as CardRow[]
    },
  })
}

export function useDeleteCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('delete_card', { p_card_id: cardId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards'] })
      qc.invalidateQueries({ queryKey: ['employee-snapshot'] })
    },
  })
}

export function useIssueCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employee_id: string
      reason_code: string
      notes?: string
      evidence?: string
      colour?: CardColour
      incident_date?: string
    }) => {
      const { data, error } = await supabase.rpc('issue_card', {
        p_employee: input.employee_id,
        p_reason_code: input.reason_code,
        p_notes: input.notes ?? null,
        p_evidence: input.evidence ?? null,
        p_colour: input.colour ?? null,
        p_incident: input.incident_date ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards'] })
      qc.invalidateQueries({ queryKey: ['employee-snapshot'] })
    },
  })
}

export interface CardSettings {
  yellow_expiry_days: number
  red_expiry_days: number
  green_expiry_days: number
  yellows_to_red: number
  reds_to_pip: number
  reds_to_termination_review: number
  greens_offset_yellow: number
  onboarding_grace_days: number
  late_grace_minutes: number
  lates_window_days: number
  lates_window_n: number
  alert_slack: boolean
  alert_email: boolean
  alert_function_url: string
}

export function useCardSettings() {
  return useQuery<CardSettings | null>({
    queryKey: ['app-setting', 'card_settings'],
    staleTime: 30_000,
    queryFn: async () => {
      // Read via v_app_settings (public view) to avoid schema('core') RPC juggling.
      const { data, error } = await supabase
        .from('v_app_settings')
        .select('value')
        .eq('key', 'card_settings')
        .maybeSingle()
      if (error) throw error
      return (data?.value as CardSettings | null) ?? null
    },
  })
}

export function useSaveCardSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<CardSettings>) => {
      const { error } = await supabase.rpc('set_app_setting', {
        p_key: 'card_settings',
        p_value: settings,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-setting', 'card_settings'] }),
  })
}
