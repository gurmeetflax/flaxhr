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

## What's still to do

- **Push notifications** — Firebase project + `google-services.json` +
  `@capacitor/push-notifications` registration in `src/lib/push.ts`, plus a
  `core.device_tokens` table so the DB can address the right device.
- **Biometric unlock** — `capacitor-native-biometric` is installed; wire a
  helper that stores the Supabase refresh token in the OS keychain and
  restores it after a successful biometric prompt.
- **Camera plugin swap** — punch-in currently uses the web `<input type="file"
  capture="user">`; replace with `Camera.getPhoto({ source: CAMERA,
  direction: FRONT })` for a snappier capture inside the app.
- **Play Store assets** — 512×512 icon, feature graphic, 4+ phone
  screenshots, privacy-policy URL.
