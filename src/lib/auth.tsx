import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type Role = 'admin' | 'hr' | 'manager' | 'auditor' | 'employee' | 'service'

export interface UserRole {
  role: Role
  outlet_id: string | null
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function useMyRoles() {
  const { user } = useAuth()
  return useQuery<UserRole[]>({
    queryKey: ['my-roles', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .schema('core' as never)
        .from('user_roles')
        .select('role, outlet_id')
        .eq('user_id', user.id)
        .is('deleted_at', null)
      if (error) throw error
      return (data as unknown as UserRole[]) ?? []
    },
    enabled: !!user,
    staleTime: 60_000,
  })
}

export function useHasRole(role: Role | Role[]) {
  const { data: roles = [] } = useMyRoles()
  const wanted = Array.isArray(role) ? role : [role]
  return roles.some((r) => wanted.includes(r.role))
}

export interface EmployeeRow {
  id: string
  employee_code: string
  user_id: string | null
  full_name: string
  work_email: string | null
  phone: string | null
  outlet_id: string | null
  is_active: boolean
  hired_on: string | null
}

export function useMyEmployee() {
  const { user } = useAuth()
  return useQuery<EmployeeRow | null>({
    queryKey: ['my-employee', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .schema('core' as never)
        .from('employees')
        .select(
          'id, employee_code, user_id, full_name, work_email, phone, outlet_id, is_active, hired_on',
        )
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as EmployeeRow) ?? null
    },
    enabled: !!user,
    staleTime: 60_000,
  })
}
