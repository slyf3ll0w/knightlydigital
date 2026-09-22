# Native release queue

Store builds are expensive (review latency, a Mac for iOS, a version bump, a
staged rollout), so we batch them. **Anything that cannot ride a web deploy
gets parked here until the next submission.** When you cut a build, work the
platform's section top to bottom, then clear it.

Build mechanics live in `mobile-app-runbook-mac.md` (§ PLAY STORE for the
Android/Windows path, § Mac steps for iOS). This file is only *what is
waiting* — not how to build.

## Picking this up cold — 2026-09-16

Everything below for **Google Play is written and pushed**. The repo is one
command from an uploadable bundle; what is left is Console clicking, not code.

In order:

1. **Google Cloud Console first, before the release is live.** Two *Android*
   OAuth clients for package `com.streamflaire.hub`, in the same project as the
   web sign-in client:
   - upload key SHA-1 `D9:C7:8B:33:AC:C8:FF:32:33:BE:BC:28:55:52:D0:88:63:41:88:11`
   - Play app-signing key SHA-1, from Play Console → Setup → App signing

   Play re-signs every upload, so the second fingerprint is the one installed
   apps present. Register only the first and Google sign-in works perfectly in
   a sideloaded build and fails for every real user. No new env var: the
   plugin initializes with the existing *web* `GOOGLE_SIGNIN_CLIENT_ID`.

2. **Build**: `npx cap sync android` (mandatory — see the runbook), then
   `cd android && .\gradlew bundleRelease`. versionCode is already 4 / "1.3".

3. **Upload** to Play, production, US only, full rollout. Managed publishing is
   off, so it goes live on approval.

4. **Verify on the phone after the update installs** — none of it is visible
   before then, because all three are compiled into the APK:
   - the launcher icon is the blue WorkBench "W", not the green swoosh
   - the label under it reads "WorkBench", not "Streamflaire Hub"
   - the splash is WorkBench
   - `/app/login` shows "Continue with Google", and it opens the *system*
     account sheet, not a browser tab
   - Settings → My Profile → Connected sign-ins → Connect Google links
     without bouncing you to a different company

Already verified on this machine, so no need to redo: `tsc`, `next build`, the
plugin is absent from the web bundle, and `gradlew :app:assembleDebug` passes
with no Facebook/Twitter classes in the APK.

What is deliberately NOT in this release: anything iOS. That queue is separate
and still needs the Mac.

---

## First: does it actually need a build?

The shell is thin (`mobile-app-plan.md`): the webview loads the live site, so
**almost nothing does.** Ship it to Railway and it is in the app.

Needs a build — the native project only:
- `android/**`, `ios/**` — manifest, entitlements, Info.plist, Swift/Java,
  icons, splash, version numbers
- `capacitor.config.ts` — it is compiled into the native project at sync time
- **Adding a Capacitor plugin.** Using one that is already installed does not.

Does NOT need a build, even though it looks native:
- Anything under `app/`, `lib/`, `components/`, `public/`
- `components/NativeShell.tsx` — it runs *inside* the webview and is served
  from the site. New listeners against an already-bundled plugin go live on
  deploy.

The installed plugins (`android/app/capacitor.build.gradle` is the list):
app, browser, camera, haptics, keyboard, push-notifications, splash-screen,
status-bar, biometric-auth, app-shortcuts, badge, social-login. `npx cap sync
android` should report **12** for Android.

> Worked example, 2026-09-16. The App Links deep-link fix *looked* native —
> intent filters, universal links. It needed no build: the intent filter and
> `@capacitor/app` both shipped in versionCode 3, and the missing piece was a
> JS `appUrlOpen` listener in `NativeShell.tsx`. Web deploy, live immediately.
> When in doubt, check whether the native half already shipped.

## Shipped now

| | Version | State |
|---|---|---|
| Google Play | versionCode 3 / 1.2 | Live since 2026-09-14; **4 / 1.3 is built in the tree, not yet uploaded** |
| App Store | 1.2 (build 5) | **Never submitted** |

Bump `versionCode` in `android/app/build.gradle` on every Play upload (Play
rejects reuse; `versionName` is cosmetic). Already bumped to **4 / "1.3"** for
the release below — bump again to 5 after it uploads.

---

## Google Play — waiting for the next build

**App icon and splash still say Streamflaire.** Fixed in the tree — the
regenerated `android/app/src/main/res/mipmap-*` and `drawable-*/splash.png`
are committed and ride the next upload; nothing more to do at build time.
- Cause: the `assets/` sources were rebranded at 56a7f70 and again at a30edc8,
  but a30edc8 ran the generator with `--ios` only — so Android kept the icons
  generated at 44596b0, six days before the rebrand. iOS was regenerated in
  that same commit and is correct.
- Regenerate with `npx @capacitor/assets generate --android` (runs on Windows,
  no Android Studio needed). **Run it for both platforms whenever `assets/`
  changes** — the one-platform split is exactly what caused this.
- The green-swoosh icon is on real phones today, so this is the only
  user-visible item in this section.

**The home-screen label still reads "Streamflaire Hub".** Same root cause, a
different file: `android/app/src/main/res/values/strings.xml` (`app_name` +
`title_activity_main`). Fixed in the tree, ships with versionCode 4.
- `appName: 'WorkBench'` in `capacitor.config.ts` only seeds these strings when
  the native project is first created — **`npx cap sync` never rewrites them**,
  so the config looking right proves nothing. ae17618 ("Rebrand iOS app to
  WorkBench") set `CFBundleDisplayName` and touched zero Android files.
- `package_name` and `custom_url_scheme` in that file stay
  `com.streamflaire.hub` — that is the appId, and changing it would be a new
  app on Play. Same for the `StreamflaireHubShell` UA suffix, which the server
  keys on to detect the shell.
- The Play Console listing name is separate and already says WorkBench; this
  is only the label under the icon.

**Native Google sign-in.** Built and in the tree — `@capgo/capacitor-social-login`
is installed and synced, which is the new plugin that makes this a build.
Google refuses OAuth in embedded webviews, so the app uses the native
Credential Manager and posts the resulting ID token to a `google-native`
credentials provider that verifies it against Google’s JWKS and runs the same
`resolveSocialSignIn` rules as the web. Web Google sign-in is already live
(35ac856); the native half is Android-only on purpose.

Code: `lib/native-google-signin.ts` (the plugin bridge), `lib/google-id-token.ts`
(verification), the provider in `lib/auth-options.ts`, `POST
/api/app/profile/identities` (connect from Settings without re-minting the
session), and the client id routing in `lib/sign-in-options.ts`.

**Before the release goes live, in Google Cloud Console** (same project as the
web sign-in client) — without this the button appears and fails:
- Credentials → Create OAuth client ID → **Android**, package name
  `com.streamflaire.hub`, SHA-1 of the **upload key**:
  `D9:C7:8B:33:AC:C8:FF:32:33:BE:BC:28:55:52:D0:88:63:41:88:11`
- A **second** Android client with the SHA-1 of the **Play app-signing key**
  (Play Console → Setup → App signing). Play re-signs every upload, so the
  installed app presents that fingerprint, not the upload one — miss it and
  sign-in works in your sideloaded build and fails for every real user.
- No new env var: the plugin initializes with the existing *web*
  `GOOGLE_SIGNIN_CLIENT_ID`, which is also the audience the server verifies.

Old installs are safe: versionCode 3 has no plugin and loads this same web
code, so the button checks the plugin exists before rendering and those users
keep the password form (`useGoogleSignInOffered`).

iOS deliberately excluded — `isAndroidShellUserAgent` gates it, because App
Store rule 4.8 needs Sign in with Apple first. Full design:
`social-login-2026-09-14.md`.

**Microphone permission** (queued 2026-09-21, tier 2 of
`business-line-voice-2026-09-18.md`). `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`
are in `AndroidManifest.xml`. Needs a build because a manifest permission is
compiled in — without it `getUserMedia` fails inside the webview. Nothing
user-visible yet: `components/Softphone.tsx` refuses to register in the native
shell (`nativePlatform()`), so calls keep ringing the cell in the app. Lifting
that gate is tier 3 work (foreground service / full-screen intent), not part of
this build.

## App Store — waiting for the next build

The iOS app has never been submitted, so everything here lands in one go. All
of it needs the Mac (`mobile-app-runbook-mac.md` § Mac steps).

**1. Sign in with Apple — do this before native Google.** App Store rule 4.8
means Google cannot appear in the iOS app until Apple sign-in does
(recorded in `social-login-2026-09-14.md`). Needs a Services ID, a `.p8` key
and the Team ID; generate the client-secret JWT at boot from env so the
6-month expiry never bites. Private-relay addresses won't match an
owner-added teammate's email — the "no company attached" page needs a
"sign in with password once to link" path.

**2. Native Google sign-in** — same plugin and provider work as the Play item
above, gated behind Apple shipping first.

**3. Microphone usage string** (queued 2026-09-21). `NSMicrophoneUsageDescription`
is in `Info.plist`; iOS terminates an app that touches the mic without it, which
is the other reason the softphone stays off in the shell until tier 3
(PushKit + CallKit). Rides whatever build goes first.

**4. Siri App Intents** (queued 2026-08-22). "Hey Siri, clock me in" / "next
job" as real App Intents. The URL tier already works with no build (Shortcuts
app → Open URLs → `https://workbenchfsm.com/app/go/next-job`); App Intents
skip opening the app and let Siri confirm conversationally.
- App Intents extension (Swift, iOS 16+) in `ios/App`: `OpenNextJobIntent`
  (opens the universal link — trivial) and `ClockInIntent` (POSTs
  `/api/app/jobs/[id]/clock`; needs the session cookie from the WKWebView
  cookie store plus a next-job lookup — consider a small
  `GET /api/app/arrival`-style endpoint returning the target job id).
- Donate via `AppShortcutsProvider` so they show in Spotlight/Shortcuts.
- Android has no counterpart: Google Assistant App Actions are deprecated.

### iOS pre-submit checks

- `aps-environment` in `App.entitlements` is `development`. The distribution
  archive must carry `production` or push silently dies in the store build.
- Already in place, just confirm they survive the archive: Associated Domains
  (`applinks:` + `webcredentials:workbenchfsm.com`), `WKAppBoundDomains`
  (this is what gives WKWebView service workers, i.e. the offline snapshot in
  `components/OfflineSupport.tsx` — it no-ops without it), and the usage
  strings for camera, photos, Face ID and location.
- If `npx cap sync ios` was ever run on Windows, check
  `ios/App/CapApp-SPM/Package.swift` for backslash paths before archiving —
  invalid Swift, breaks SPM on the Mac.

---

## Keeping this list honest

When you hit something that needs a native change, add it here **with the
reason it can't ride a web deploy** — that one line is what stops the queue
filling up with things that could have shipped on a Tuesday. Clear items as
they ship and record the version they went out in.

Ideas deliberately *not* queued (no one is waiting on them): an Android
home-screen widget; a Settings help card documenting the Shortcuts recipe for
users who won't wait for the Siri build (that one is web — ship it any time).
