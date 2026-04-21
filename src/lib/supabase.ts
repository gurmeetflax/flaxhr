import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them.',
  )
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// A second, session-less client for operations that MUST NOT replace the
// current user's session — e.g. `auth.signUp` called from an admin screen
// to create an employee. Supabase's default behaviour is to sign the new
// user into the calling client, which would knock the admin out.
export function createEphemeralClient(): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `flax-hr-ephemeral-${Math.random().toString(36).slice(2)}`,
    },
  })
}
