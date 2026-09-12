import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.flaxfoods.hr',
  appName: 'Flax HR',
  webDir: 'dist',
  // Load the deployed web app on first launch — no need to rebuild the
  // android APK for every frontend change. Falls back to the bundled
  // dist/ if offline.
  server: {
    url: 'https://hr.flaxfoods.in',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    // Android package name matches appId.
    // Employee-only build; admin routes are hidden at runtime by the SPA.
    backgroundColor: '#ffffff',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Camera: {
      androidPhotosPermissionText: 'Flax HR needs camera access for punch-in selfies.',
    },
    Geolocation: {
      androidLocationPermissionText:
        'Flax HR needs location to verify you are at the outlet when you punch.',
    },
  },
}

export default config
