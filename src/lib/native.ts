import { Capacitor } from '@capacitor/core'

// True when the SPA is running inside the Capacitor Android app (or a
// future iOS build), false when in a normal browser. Use to gate
// native-only behaviour (biometric unlock, push registration) and to
// hide admin routes on the mobile shell.
export const IS_NATIVE = Capacitor.isNativePlatform()

export const NATIVE_PLATFORM = Capacitor.getPlatform() as 'web' | 'android' | 'ios'
