# Android 1.3 release (versionCode 4) — plan for 2026-09-25

Written 2026-09-24, the day after iOS 1.3 (build 7) was approved. Build
mechanics: `mobile-app-runbook-mac.md` § PLAY STORE. What is waiting per
platform: `native-release-queue.md`. This file is the day's checklist.

## Where Android stands

- Google Play: versionCode 3 / 1.2 live in **production** since 2026-09-14.
- Tree: versionCode 4 / "1.3" in `android/app/build.gradle`, `npx cap sync
  android` last run at 9784d9f (12 plugins), JDK 21 + Android SDK on the
  Windows PC still work. Nothing Android has been uploaded since.
- Play Console: listing, data safety, content rating etc. are done. The
  "Sign in details" form still carries the dead demo@streamflaremedia.com
  login (see step 4).

## What versionCode 4 fixes (all in the tree, compiled into the APK)

1. **Launcher icon** — phones still show the green Streamflaire swoosh.
   Regenerated WorkBench "W" mipmaps + splash are committed.
2. **Home-screen label** — still "Streamflaire Hub" on phones.
   `res/values/strings.xml` now says WorkBench.
3. **Google sign-in inside the app** — `@capgo/capacitor-social-login`
   bundled; `/app/login` gets "Continue with Google" via the system
   Credential Manager sheet (web-side code is live already and hides the
   button when the plugin is missing).
4. **Microphone permissions** — `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`
   in the manifest, so `getUserMedia` can work in the webview at all.

## Deliberately NOT in this build

- **Tier 3 native ringing on Android** (calls ringing a closed phone).
  Needs a native plugin: FCM high-priority data push → foreground service +
  full-screen incoming-call intent / ConnectionService, a second platform
  beside `ios-voip` in `lib/voip.ts`, and a bridge gate in
  `components/Softphone.tsx` like `nativeVoip()` on iOS. Multi-day work →
  **versionCode 5**. Design notes: `business-line-voice-2026-09-18.md` § Tier 3.
- **Foreground calls in the Android app.** `Softphone.tsx` refuses to
  register in the Android shell today, so Android users' calls ring the
  cell. Once vc4 is on phones (mic permission present), lifting that gate
  for foreground-only use is a **web deploy, no build**. Do it after
  David confirms the update installed.

## Steps, in order

1. **David — Google Cloud Console, BEFORE upload.** Credentials → Create
   OAuth client ID → **Android**, package `com.streamflaire.hub`, in the
   same project as the web sign-in client. Make TWO:
   - upload key SHA-1 `D9:C7:8B:33:AC:C8:FF:32:33:BE:BC:28:55:52:D0:88:63:41:88:11`
   - Play app-signing key SHA-1 — Play Console → Setup → App signing
   Play re-signs every upload, so installed apps present the second
   fingerprint. Register only the first and sign-in works sideloaded but
   fails for every real user. No new env var (plugin uses the existing
   web `GOOGLE_SIGNIN_CLIENT_ID`).
2. **Build (Claude, Windows).** `npx cap sync android` (expect 12
   plugins) then `cd android && .\gradlew bundleRelease` → 
   `android/app/build/outputs/bundle/release/app-release.aab`, signed with
   the upload key from `android/keystore.properties`.
3. **Upload (Claude via Playwright after David signs in to Google).**
   Play Console → Production → new release, US, full rollout. Managed
   publishing is off, so it goes live on approval. Release notes below.
4. **Fix "Sign in details"** (App content → Testing credentials): replace
   the stale demo login with the App Store review account —
   `test@testing.com` / `Testing!123`, company Streamflaire (see
   `app-store-listing.md` § Review notes for the wording).
5. **Bump `versionCode` to 5** in `android/app/build.gradle` right after
   the upload succeeds; commit. Clear the Play section of
   `native-release-queue.md` except the tier 3 item.
6. **David — verify on a phone after the update installs:**
   - launcher icon is the blue WorkBench "W", label reads "WorkBench",
     splash is WorkBench
   - `/app/login` shows "Continue with Google" and opens the *system*
     account sheet, not a browser tab
   - Settings → My Profile → Connected sign-ins → Connect Google links
     without moving you to a different company
7. **Then (web deploy, no build):** lift the Android `nativePlatform()`
   gate in `Softphone.tsx` for foreground calls.

## Loose ends to re-check in the Console while there

- Internal testers list (was empty on 2026-09-01).
- Whether the 6 phone screenshots in `docs/plans/play-assets/` were
  uploaded (production went live, so presumably yes — confirm).
- Keystore backup off-machine: David does this by hand
  (`C:\Users\David Lessly\.workbench-keys\workbench-upload.jks`).

## Release notes (Play "What's new", 500 chars max)

```
WorkBench 1.3
• Sign in with Google — one tap, no password to remember
• New WorkBench icon and name on your home screen
• Groundwork for business-line calls in the app
```
