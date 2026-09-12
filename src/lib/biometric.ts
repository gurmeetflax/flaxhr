import { NativeBiometric } from 'capacitor-native-biometric'
import { supabase } from '@/lib/supabase'
import { IS_NATIVE } from '@/lib/native'

// Face / Fingerprint unlock. After a successful password login we stash
// the Supabase refresh token in the OS keychain (encrypted by the
// biometric enclave). On relaunch we prompt for biometric and, on
// success, restore the session — no password re-entry.
//
// The tokens are keyed by SERVER so a shared device can hold sessions
// for multiple employees, one per app install.

const SERVER = 'flax-hr'
const KEY = 'refresh_token'

interface BiometricStatus {
  available: boolean
  reason?: string
}

export async function biometricStatus(): Promise<BiometricStatus> {
  if (!IS_NATIVE) return { available: false, reason: 'web' }
  try {
    const r = await NativeBiometric.isAvailable()
    if (!r.isAvailable) return { available: false, reason: r.errorCode ? String(r.errorCode) : 'unavailable' }
    return { available: true }
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (!IS_NATIVE) return
  try {
    // Overwrite any prior credential first — API errors if a duplicate
    // already exists on Android.
    await NativeBiometric.deleteCredentials({ server: SERVER }).catch(() => undefined)
    await NativeBiometric.setCredentials({
      server: SERVER,
      username: KEY,
      password: token,
    })
  } catch (e) {
    // Non-fatal — the user can still log in with password next time.
    console.warn('biometric save failed', e)
  }
}

export async function clearRefreshToken(): Promise<void> {
  if (!IS_NATIVE) return
  try {
    await NativeBiometric.deleteCredentials({ server: SERVER })
  } catch {
    // no-op
  }
}

// Prompt for biometric, retrieve the stored refresh token, and restore
// the Supabase session. Returns true if the session was restored.
export async function tryBiometricUnlock(): Promise<boolean> {
  if (!IS_NATIVE) return false
  const status = await biometricStatus()
  if (!status.available) return false
  try {
    await NativeBiometric.verifyIdentity({
      reason: 'Unlock Flax HR',
      title: 'Unlock Flax HR',
      subtitle: 'Confirm it’s you',
      description: 'Use your face or fingerprint to open the app.',
    })
    const cred = await NativeBiometric.getCredentials({ server: SERVER })
    if (!cred?.password) return false
    const { error } = await supabase.auth.refreshSession({ refresh_token: cred.password })
    if (error) {
      // Stale token — nuke it so we don't keep prompting.
      await clearRefreshToken()
      return false
    }
    return true
  } catch {
    // User cancelled or the biometric hardware failed. Silent fallback.
    return false
  }
}
