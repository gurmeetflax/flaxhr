# Flax HR — Android app

The Android app is a **Capacitor** wrapper around the existing web SPA. Same
React code, same Supabase backend. The employee side only — admin routes are
redirected to `/me` on the mobile shell.

Package: `in.flaxfoods.hr` · App name: `Flax HR` · Web URL: `https://hr.flaxfoods.in`

## First-time setup

1. Install **Android Studio** (Ladybug or newer) with Android SDK 34+.
2. Install **JDK 17** (`brew install --cask temurin@17` on macOS).
3. Set `ANDROID_HOME` (usually `~/Library/Android/sdk` on macOS).
4. From the repo root:
   ```bash
   npm install
   npm run android:sync   # builds the web app + copies to android/
   npm run android:open   # opens the project in Android Studio
   ```

## Everyday dev loop

- Edit React code as normal (`npm run dev`).
- To test the change in the app: `npm run android:sync` — copies the new
  bundled web assets into `android/app/src/main/assets/public`, then Android
  Studio picks them up on the next run.
- Live-reload: with a device connected on the same LAN, `npm run android:run`
  from the CLI or hit ▶ in Android Studio.

The `capacitor.config.ts` currently points the app at
`https://hr.flaxfoods.in` — so once installed, the app auto-picks up any web
deploy without needing a Play Store update. If you want the app to run the
locally-bundled `dist/` instead (for offline dev), remove the `server.url`
line in `capacitor.config.ts` and re-sync.

## Building a signed release for Play Store

1. **Generate a keystore** (once):
   ```bash
   keytool -genkey -v -keystore flax-hr-release.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias flax-hr
   ```
   Keep the `.jks` file and its passwords out of git — store in 1Password.

2. **Configure signing** in `android/app/build.gradle` — add above `android { ... }`:
   ```gradle
   android {
     signingConfigs {
       release {
         storeFile file(System.getenv('FLAX_HR_KEYSTORE'))
         storePassword System.getenv('FLAX_HR_KEYSTORE_PASSWORD')
         keyAlias 'flax-hr'
         keyPassword System.getenv('FLAX_HR_KEY_PASSWORD')
       }
     }
     buildTypes {
       release {
         signingConfig signingConfigs.release
       }
     }
   }
   ```

3. **Build AAB**:
   ```bash
   npm run android:sync
   cd android
   FLAX_HR_KEYSTORE=~/keys/flax-hr-release.jks \
   FLAX_HR_KEYSTORE_PASSWORD=... \
   FLAX_HR_KEY_PASSWORD=... \
     ./gradlew bundleRelease
   ```
   Output lands at `android/app/build/outputs/bundle/release/app-release.aab`.

4. Upload the AAB to **Google Play Console** → Production or Internal testing track.

## Permissions declared

- `INTERNET` — talk to Supabase / the web SPA
- `CAMERA`, `CAMERA.FRONT` — punch-in selfie capture
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` — outlet geofence check
- `POST_NOTIFICATIONS` — punch reminders, card alerts, leave decisions
- `USE_BIOMETRIC`, `USE_FINGERPRINT` — Face/Fingerprint unlock on relaunch

## What's wired in the code

- **Native camera** — punch-in on the app calls `@capacitor/camera` with the
  front camera; on web it still falls back to the file input.
  (`src/lib/nativeCamera.ts`, `src/pages/me/PunchPage.tsx`)
- **Native geolocation** — `getCurrentPosition` in `src/lib/geo.ts` routes
  through `@capacitor/geolocation` on the native runtime for a much more
  accurate outlet-geofence check than the WebView's HTML5 geolocation.
- **Biometric unlock** — on successful login the Supabase refresh token is
  written to the OS keychain via `capacitor-native-biometric`. On next
  launch the app prompts for Face / Fingerprint and, on success, restores
  the session so the login screen is skipped.
  (`src/lib/biometric.ts`, `src/lib/auth.tsx`)
- **Push notifications** — after login the app registers with FCM, then
  upserts the token into `core.device_tokens` via the
  `register_device_token` RPC. (`src/lib/push.ts`,
  `supabase/migrations/20260514000017_device_tokens.sql`)
- **Privacy policy** — served at `/privacy` on the web app. Use
  `https://hr.flaxfoods.in/privacy` as the Play Store privacy policy URL.

## What YOU still need to supply

- **Firebase project + `google-services.json`** — required for push. Create
  a Firebase project, add an Android app with package `in.flaxfoods.hr`,
  download `google-services.json`, drop it in `android/app/`. Also add:
  ```gradle
  // android/build.gradle (top-level)
  classpath 'com.google.gms:google-services:4.4.2'
  // android/app/build.gradle (bottom of file)
  apply plugin: 'com.google.gms.google-services'
  ```
  Nothing else changes — `@capacitor/push-notifications` picks it up from
  there. Then implement a small worker (Edge Function) that reads
  `core.device_tokens` and posts to the FCM HTTP v1 API.
- **Adaptive launcher icon** — Capacitor left a placeholder mark. Generate
  Flax-branded icons (Android Studio → Image Asset Studio, foreground SVG
  1024×1024) and let it regenerate the `mipmap-*` folders. Adaptive
  background is already set to Flax green (`#5B7C4A`).
- **Play Store listing assets** — 512×512 hi-res icon, 1024×500 feature
  graphic, minimum 4 phone screenshots (1080×1920 or similar).
- **Signing keystore** — see "Building a signed release" above. Store the
  `.jks` file + passwords in 1Password.
