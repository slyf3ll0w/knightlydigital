# Native release queue

Store builds are expensive (review latency, a Mac for iOS, a version bump, a
staged rollout), so we batch them. **Anything that cannot ride a web deploy
gets parked here until the next submission.** When you cut a build, work the
platform's section top to bottom, then clear it.

Build mechanics live in `mobile-app-runbook-mac.md` (§ PLAY STORE for the
Android/Windows path, § Mac steps for iOS). This file is only *what is
waiting* — not how to build.

> **2026-09-24:** day-of checklist for this Play release (with what is
> deliberately left for versionCode 5) is `android-1.3-release-2026-09-25.md`.

## Picking this up cold — 2026-09-25

**Google Play 1.3 (versionCode 5) went LIVE on 2026-09-25** — submitted and
approved the same afternoon (full rollout, US). versionCode 4
was uploaded first, then discarded for a manifest fix and re-cut as 5; Play
keeps every uploaded version code in its library, so the tree is already at
**6** for the next upload. Day-of record: `android-1.3-release-2026-09-25.md`.

Two things that changed on the console side and are NOT in older notes:

1. **Play upgraded the app-signing key** (Protected with Play → App signing
   shows "Quantum-ready (beta)": a new classical key + a post-quantum key,
   with the 2026-09-01 key listed under "Previous app signing keys"). So
   there are now FOUR certificates a real install can present, and every
   place that pins a fingerprint needs all of them:
   - upload key SHA-1 `D9:C7:8B:33:AC:C8:FF:32:33:BE:BC:28:55:52:D0:88:63:41:88:11`
     / SHA-256 `DE:DF:69:37:4C:20:A2:FA:9E:68:B6:36:36:83:58:59:A5:95:EB:9D:F0:AE:70:F5:C4:95:7A:EB:D7:71:C6:FD`
   - app-signing, current classical SHA-1 `9C:3D:97:2E:1D:19:56:F7:EB:BE:02:6C:F1:E9:E2:2A:E7:7B:00:ED`
     / SHA-256 `1A:2B:78:05:8D:44:C6:92:1E:FC:9B:82:55:20:61:D7:CB:57:E4:9D:79:8E:64:63:E8:81:BA:B4:9B:CA:AB:52`
   - app-signing, post-quantum SHA-1 `5D:A7:7D:07:C2:AA:AB:1A:65:57:D4:0A:D7:5D:82:BF:F9:7E:FA:16`
     / SHA-256 `54:BB:AA:77:31:89:E1:58:37:5A:E0:C6:DE:6D:68:59:E3:5F:7F:CC:BB:CC:15:51:50:CF:A0:38:3E:5E:7F:16`
   - app-signing, previous (2026-09-01) SHA-1 `5F:95:3B:39:98:50:28:F8:0B:8E:07:01:E6:35:7E:16:D6:8B:12:31`
     / SHA-256 `00:1C:3D:C1:B6:70:3A:38:ED:C0:0D:FF:80:00:B7:F0:FD:C9:62:5C:9B:B6:3E:76:B9:CE:2F:69:92:E6:2F:96`

   Google Cloud Console (project `streamflaire-hub` → Google Auth Platform →
   Clients) now has four **Android** OAuth clients, one per SHA-1 above, so
   native Google sign-in works whichever key a phone was served. Done
   2026-09-25.

   **Still open — Railway `ANDROID_CERT_SHA256`** (production AND staging)
   only lists the previous app-signing key + the upload key; the live
   `/.well-known/assetlinks.json` proves it. Set it to all four SHA-256s,
   comma-separated, or App Links + Google Password Manager stop matching
   installs signed with the new keys:
   ```
   00:1C:3D:C1:B6:70:3A:38:ED:C0:0D:FF:80:00:B7:F0:FD:C9:62:5C:9B:B6:3E:76:B9:CE:2F:69:92:E6:2F:96,1A:2B:78:05:8D:44:C6:92:1E:FC:9B:82:55:20:61:D7:CB:57:E4:9D:79:8E:64:63:E8:81:BA:B4:9B:CA:AB:52,54:BB:AA:77:31:89:E1:58:37:5A:E0:C6:DE:6D:68:59:E3:5F:7F:CC:BB:CC:15:51:50:CF:A0:38:3E:5E:7F:16,DE:DF:69:37:4C:20:A2:FA:9E:68:B6:36:36:83:58:59:A5:95:EB:9D:F0:AE:70:F5:C4:95:7A:EB:D7:71:C6:FD
   ```
   Verify with `curl https://workbenchfsm.com/.well-known/assetlinks.json`.

2. **Play "Sign in details"** (App content → Testing credentials) now carries
   `test@testing.com` / `Testing!123` — the App Store review account. The
   form had `test@test.com`, which fails to sign in (checked live on
   2026-09-25). The instructions field is capped at 500 characters.

**Build mechanics that bit this time** (all also in the runbook § PLAY STORE):
`npx cap sync android` run from a git worktree rewrites the
`android/capacitor.settings.gradle` project paths to the junction's real
path — revert that file before committing. `RECORD_AUDIO` implies a required
microphone, which silently dropped 20 mic-less tablets/TVs from the vc4
upload; `<uses-feature android.hardware.microphone required=false>` is in
the manifest now (0 devices lost on vc5).

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
| Google Play | versionCode 5 / 1.3 | **Live since 2026-09-25** |
| App Store | 1.2 (build 5) | Live since 2026-08-06 as "Workbench FSM" (id6789991103); **1.3 (build 12) submitted 2026-09-23** |

Bump `versionCode` in `android/app/build.gradle` on every Play upload (Play
rejects reuse, even of a version that was only ever in a discarded draft;
`versionName` is cosmetic). The tree is at **6** for the next upload.

---

## Google Play — waiting for the next build (versionCode 6)

Shipped in versionCode 5 (2026-09-25), so no longer waiting: the WorkBench
launcher icon + splash, the "WorkBench" home-screen label, native Google
sign-in (`@capgo/capacitor-social-login`), `RECORD_AUDIO` +
`MODIFY_AUDIO_SETTINGS` (with the microphone declared optional). David
confirmed the update on his phone the same day.

**Foreground calls in the Android app — shipped as a web deploy, no build
(2026-09-25).** `components/Softphone.tsx` now runs the browser softphone in
the Android shell when the build carries a microphone permission
(`androidShellHasMicrophone`: the sign-in plugin is present ⇔ versionCode ≥ 4).
Older installs keep ringing the cell. With the app closed or backgrounded
long enough for Android to kill it, the app leg times out and the cell
rings — that gap is what tier 3 below closes.

**Calls ringing the phone when the app is closed — Android half** (queued 2026-09-23). iOS shipped it in 1.3 (PushKit + CallKit). Android needs an FCM high-priority data message → a foreground service with a full-screen incoming-call intent (ConnectionService for the native dialer look), and `components/Softphone.tsx` gating on a matching bridge the way it does on `nativeVoip()` for iOS; server side, a second platform beside `ios-voip` in `lib/voip.ts`. Until then Android phones are cells.

**Code shrinking / R8** (queued 2026-09-25). Play's release dashboard flags
"DEX code optimization is below our threshold — Obfuscation 2%", fix by
**Feb 2027**, and every upload warns about the missing deobfuscation file
and native debug symbols. Turn on `minifyEnabled` + `shrinkResources` for
the release build type, keep the Capacitor/plugin keep-rules, and upload
the mapping file with the bundle. Needs a build because it changes the
compiled APK; test the webview bridge on a device first (obfuscation can
break `@CapacitorPlugin` reflection if the keep-rules are wrong).

**Edge-to-edge deprecations** (queued 2026-09-25). Play recommends dropping
deprecated edge-to-edge APIs/parameters (targetSdk 36). Check what
`@capacitor/status-bar` / `@capacitor/keyboard` versions fix it and bump
them; ride along with the R8 build.

## App Store — 1.3 SUBMITTED 2026-09-23 (build 12), Waiting for Review

Builds 6–11 were the road to a working native calling engine (see
`business-line-voice-2026-09-18.md` § Tier 3 and `mobile-app-runbook-mac.md`
§ RELEASE 1.3 status). Everything below shipped in build 12. Clear this
section once 1.3 is live.

The app is live as **Workbench FSM** (id6789991103) at 1.2 (build 5) since
2026-08-06, so this is an update, not a first submission. Everything below
is in the tree and pushed; what's left is Apple/Google console work, the Mac
build, and a phone to test on.

**What 1.3 carries** (all four need this build):

1. **Sign in with Apple + native Google sign-in** — `lib/apple-signin.ts`,
   `lib/apple-id-token.ts`, `lib/native-social-signin.ts`,
   `components/SocialSignInButtons.tsx`. The iOS shell shows Apple first,
   then Google; rule 4.8 is satisfied because Google never renders there
   without Apple (`lib/sign-in-options.ts socialSignInFor`). Web Apple
   sign-in ships with the same deploy (no build): Apple's cross-site
   callback POST is bounced to a same-site GET by `middleware.ts` so the
   session cookies survive. The plugin is the one already on Android
   (`@capgo/capacitor-social-login`, `apple: true` now) — the Mac's
   `npx cap sync ios` is what adds it to the Xcode project.
2. **Siri App Intents** — `ios/App/App/Intents.swift`, nine of them, all but
   one running without opening the app (webview cookies → the app's own
   routes, plus read-only helpers under `/api/app/siri/`): clock in, clock
   out, next job (opens the universal link), **call a client** (the line
   rings your cell, press 1, then dials them — `POST /api/app/line/call`
   via cell), **text a client** (`POST /api/app/messages/[contactId]`),
   **on my way** (`POST /api/app/siri/on-my-way`: the template text from
   the line, job stamped + noted), **call back last missed call**
   (`/api/app/siri/last-missed`), **add a job note**, **what's my day**
   (`/api/app/siri/today` answers in words). Clients are an `AppEntity`
   resolved through `/api/app/siri/contacts?q=`. iOS 16+, `@available`.
3. **Business-line calls in the app, ringing when it's closed** (tier 3) —
   `ios/App/App/VoipPlugin.swift` (PushKit + CallKit, registered by
   `ShellViewController.swift`; `Main.storyboard` now points at that class),
   `lib/native-voip.ts`, `lib/apns.ts` (VoIP push straight to APNs — FCM
   can't carry it), `lib/voip.ts`, `wakeSoftphoneLeg` in `lib/voice.ts`,
   `POST /api/app/line/softphone/ready`. `components/Softphone.tsx` registers
   in the iPhone shell now (Android stays off). `UIBackgroundModes` gained
   `voip` + `audio`. Design: `business-line-voice-2026-09-18.md` § Tier 3.
4. **Microphone usage string** — already in Info.plist; rides along.

Also in the tree: `ITSAppUsesNonExemptEncryption = false` (no more
export-compliance prompt per upload), version 1.3 / build 6.

### David — consoles and env, BEFORE the Mac session

- **Apple developer portal → Identifiers → com.streamflaire.hub**: enable
  **Sign in with Apple**. (Associated Domains and Push Notifications are
  already on from 1.2.)
- **Services ID** for web sign-in (e.g. `com.streamflaire.hub.web`): enable
  Sign in with Apple, primary App ID = the app, domain `workbenchfsm.com`,
  return URL `https://workbenchfsm.com/api/auth/callback/apple`. This is
  `APPLE_SIGNIN_SERVICES_ID`.
- **Keys**: one key with BOTH "Sign in with Apple" and "Apple Push
  Notifications service (APNs)" ticked, downloaded once (.p8). The 10-char
  key id is `APPLE_SIGNIN_KEY_ID`; base64 the whole .p8 file into
  `APPLE_SIGNIN_PRIVATE_KEY`. `lib/apns.ts` falls back to those same two for
  VoIP pushes, so no APNs-specific vars are needed — set
  `APPLE_APNS_KEY_ID` / `APPLE_APNS_PRIVATE_KEY` only if you made a separate
  key. Upload the same .p8 to Firebase → Cloud Messaging → Apple app config
  if that was never done (ordinary notifications on iOS need it).
- **Google Cloud Console** (same project as the web client): create an
  **iOS** OAuth client, bundle id `com.streamflaire.hub`. Its client id is
  `GOOGLE_SIGNIN_IOS_CLIENT_ID`; its REVERSED form
  (`com.googleusercontent.apps.…`) replaces `REVERSED_GOOGLE_IOS_CLIENT_ID`
  in `ios/App/App/Info.plist` (commit that). Without the env var the iOS
  app offers Apple only — nothing breaks.
- **Railway**: `APPLE_SIGNIN_SERVICES_ID`, `APPLE_SIGNIN_KEY_ID`,
  `APPLE_SIGNIN_PRIVATE_KEY`, `GOOGLE_SIGNIN_IOS_CLIENT_ID`. `APPLE_TEAM_ID`
  is already set. The web Apple button appears on deploy once the first
  three exist; check `/api/auth/providers` lists `apple`.

### Mac — `mobile-app-runbook-mac.md` § RELEASE 1.3

### After it's live — verify on the phone

- Login shows Continue with Apple, then Continue with Google; each opens a
  system sheet, not a browser, and lands on the dashboard.
- Settings → My Profile → Sign-in methods: Connect Apple / Google work and
  don't move you to another company; Verify it's you offers them.
- "Hey Siri, clock me in with WorkBench" answers with the job's title;
  "Next job in WorkBench" opens the job.
- With the app swiped away, call the business line from another phone: the
  iPhone shows a WorkBench call on the lock screen; Answer connects the
  customer; the caller's ringback ran ~35 s at most before the cell would
  have rung. Decline goes to voicemail. Then the same with the app open.
- An outbound call from the Calls page shows on the system screen, keeps
  talking with the phone locked, and Mute there mutes the call.

**Android tier 3 is NOT in this release** — see the Play section.

---

## Keeping this list honest

When you hit something that needs a native change, add it here **with the
reason it can't ride a web deploy** — that one line is what stops the queue
filling up with things that could have shipped on a Tuesday. Clear items as
they ship and record the version they went out in.

Ideas deliberately *not* queued (no one is waiting on them): an Android
home-screen widget; a Settings help card documenting the Shortcuts recipe for
users who won't wait for the Siri build (that one is web — ship it any time).
