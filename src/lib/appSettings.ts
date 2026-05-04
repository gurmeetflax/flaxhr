import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Tiny key/value store backed by core.app_settings (jsonb values).
 * Used for app-wide toggles like selfie_required.
 */

export type AppSettingValue = string | number | boolean | null | Record<string, unknown> | unknown[]

interface AppSettingRow {
  key: string
  value: AppSettingValue
  updated_at: string
}

/**
 * Reads a single setting by key. Defaults to `defaultValue` when the row
 * is missing (e.g. a brand-new key the migration hasn't seeded yet).
 */
export function useAppSetting<T extends AppSettingValue = AppSettingValue>(
  key: string,
  defaultValue: T,
) {
  return useQuery<T>({
    queryKey: ['app-setting', key],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_app_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle()
      if (error) throw error
      return ((data?.value as T) ?? defaultValue) as T
    },
  })
}

export function useAppSettings() {
  return useQuery<Record<string, AppSettingValue>>({
    queryKey: ['app-settings'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_app_settings')
        .select('key, value, updated_at')
      if (error) throw error
      const rows = (data as unknown as AppSettingRow[]) ?? []
      return Object.fromEntries(rows.map((r) => [r.key, r.value]))
    },
  })
}

export function useSetAppSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { key: string; value: AppSettingValue }) => {
      const { error } = await supabase.rpc('set_app_setting', {
        p_key: input.key,
        p_value: input.value,
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['app-setting', vars.key] })
      qc.invalidateQueries({ queryKey: ['app-settings'] })
    },
  })
}
