import { PushNotifications } from '@capacitor/push-notifications'
import { App as CapApp } from '@capacitor/app'
import { supabase } from '@/lib/supabase'
import { IS_NATIVE, NATIVE_PLATFORM } from '@/lib/native'

// Register with Firebase Cloud Messaging (Android) or APNs (iOS), send
// the resulting token to the DB so backend workers can push to this
// device. Idempotent — safe to call on every launch.
//
// Called from AuthProvider after a session is established.

let registered = false

export async function registerPushIfPossible(): Promise<void> {
  if (!IS_NATIVE || registered) return
  if (NATIVE_PLATFORM !== 'android' && NATIVE_PLATFORM !== 'ios') return

  const perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'denied') return
  if (perm.receive !== 'granted') {
    const req = await PushNotifications.requestPermissions()
    if (req.receive !== 'granted') return
  }

  return new Promise((resolve) => {
    const unsubReg = PushNotifications.addListener('registration', async (token) => {
      registered = true
      try {
        const appInfo = await CapApp.getInfo().catch(() => null)
        await supabase.rpc('register_device_token', {
          p_token: token.value,
          p_platform: NATIVE_PLATFORM,
          p_device_model: null,
          p_app_version: appInfo?.version ?? null,
        })
      } catch (e) {
        console.warn('[push] failed to save device token', e)
      } finally {
        unsubReg.then((h) => h.remove())
        resolve()
      }
    })
    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error', err)
      unsubReg.then((h) => h.remove())
      resolve()
    })
    PushNotifications.register().catch(() => resolve())
  })
}
