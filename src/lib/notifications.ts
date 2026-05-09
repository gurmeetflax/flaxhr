import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMyEmployee } from '@/lib/auth'

export interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface NotificationPrefs {
  employee_id: string
  channel_email: boolean
  channel_inapp: boolean
  mute_types: string[]
  updated_at: string
}

export function useMyNotifications(limit = 50) {
  return useQuery<Notification[]>({
    queryKey: ['my-notifications', limit],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_notifications')
        .select('id, type, title, body, data, read_at, created_at')
        .limit(limit)
      if (error) throw error
      return (data ?? []) as Notification[]
    },
  })
}

export function useUnreadCount() {
  const { data = [] } = useMyNotifications()
  return data.filter((n) => !n.read_at).length
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('mark_notification_read', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_all_notifications_read')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  })
}

/**
 * Subscribe to realtime inserts on core.notifications for the current
 * employee. Invalidates the list query so the bell updates without
 * polling.
 */
export function useNotificationsRealtime() {
  const qc = useQueryClient()
  const { data: employee } = useMyEmployee()
  const employeeId = employee?.id
  useEffect(() => {
    if (!employeeId) return
    const channel = supabase
      .channel(`notifications:${employeeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'core',
          table: 'notifications',
          filter: `recipient_id=eq.${employeeId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [employeeId, qc])
}

export function useMyNotificationPrefs() {
  return useQuery<NotificationPrefs | null>({
    queryKey: ['my-notification-prefs'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_notification_prefs')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return (data as NotificationPrefs | null) ?? null
    },
  })
}

export function useUpsertMyPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      channel_email: boolean
      channel_inapp: boolean
      mute_types: string[]
    }) => {
      const { error } = await supabase.rpc('upsert_my_notification_prefs', {
        p_channel_email: input.channel_email,
        p_channel_inapp: input.channel_inapp,
        p_mute_types: input.mute_types,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notification-prefs'] }),
  })
}
