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

## Tap to Pay — iOS build 14 + Android versionCode 6 (tree ready 2026-10-22; Mac steps: mobile-app-runbook-mac.md § RELEASE 1.4 — build 14; pbxproj bumped to build 14 on 2026-10-23 because build 13 was never uploaded)

Square's Mobile Payments SDK inside both shells so a tech takes a card by
holding it to the back of the phone. Design + decisions:
`checkout-tap-to-pay-2026-10-22.md`. The web side ships dark behind
`TAP_TO_PAY=1` (Railway) and needs no build; everything below does.

**Apple entitlement request submitted 2026-10-22** (David, Account Holder).
Expect the development grant first; the distribution one comes from
replying to Apple's approval email (see § David — consoles, step 1).

### Talk to Atlas — the phone's own speech recognizer (both shells, 2026-10-27, branch `android-parity`)

Rides the same iOS build 14 / Android versionCode 6. Inside the apps the
voice mode's turn-taking fallback used to record the mic and ship the clip
to `/api/app/assistant/transcribe` (a second or two of lag, no words while
you talk) because neither webview has a usable Web Speech API. Now a local
plugin, **WorkBenchSpeech**, runs the OS recognizer and streams the words
to the page as they are said:

- `ios/App/App/SpeechPlugin.swift` (SFSpeechRecognizer on an AVAudioEngine
  tap; registered in `ShellViewController`; pbxproj entries `0B20261027…`)
  + Info.plist `NSSpeechRecognitionUsageDescription` and a mic string that
  mentions Atlas. Apple's recognizer never ends on silence, so the page
  stops it after a pause in the words (`NATIVE_END_SILENCE_MS`).
- `android/app/src/main/java/com/streamflaire/hub/SpeechPlugin.java`
  (Android `SpeechRecognizer`, dictation mode, partials on; registered in
  `MainActivity`) + the manifest `<queries>` for
  `android.speech.RecognitionService` — without it Android 11+ reports no
  recognizer and the page silently records instead.
- Web (ships with any deploy, inert in older shells): `lib/native-speech.ts`
  (bridge, reached through `window.Capacitor.Plugins` like Tap to Pay),
  `lib/voice-chat-client.ts` `speechInputKind()` = `"native"` →
  `listenWithNative`; `requestMicrophone` also asks the plugin's permission
  (iOS: Speech Recognition) after the mic — declining it just means that
  device records from then on. The voice diary logs `turns: listening native`.
- The community npm plugin was NOT used: it has no Swift Package manifest
  (CapApp-SPM cannot link it) and loses Android errors on an
  already-resolved promise. Shape adapted from it (MIT).
- **Verify on the phone** (voice mode falls back to turns when Gemini Live
  cannot connect — airplane the socket or use "Report a problem" to read the
  diary): Home → Talk to Atlas → the first open asks Microphone then (iPhone)
  Speech Recognition → words appear on screen AS you talk → a pause of about
  a second sends the turn → "Say stop" ends it. Decline Speech Recognition
  once on a test phone → the hint reads "Speak, then pause" and recording
  still works. The emulator cannot test this (no recognition service).

### Sandbox test build (Android, 2026-10-23) — try Tap to Pay before Square activates production

David: "I'd like to see a sandbox test build so it's ready to go when we get
production live." A DEBUG build of the same tree, pointed at staging, with
Square's sandbox and its Mock Reader:

- `android/app/src/debug/res/values/square.xml` overrides
  `square_application_id` with the SANDBOX id (public; the same one staging's
  pay page uses). The plugin refuses a production token in this build.
- `debugImplementation com.squareup.sdk:mockreader-ui:2.6.1` — Square's
  floating mock reader. `TapToPayPlugin` shows it by reflection after a
  sandbox authorize (and on status() when already authorized), hides it on
  deauthorize, and reports `capable` in the sandbox even without NFC. Release
  builds do not ship the class, so nothing changes there.
- `capacitor.config.ts` reads `WB_SHELL_URL` at sync time (unset = production).
- Build (this PC, worktree-safe):
  `WB_SHELL_URL=https://streamflaire-staging.up.railway.app npx cap sync android`
  → `cd android && gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`
  → then `npx cap sync android` again (no env) so the gitignored
  `assets/capacitor.config.json` points back at production, and revert
  `android/capacitor.settings.gradle` + `android/app/capacitor.build.gradle`.
  Built 2026-10-23: `~/Downloads/workbench-android-SANDBOX-tap-to-pay.apk`
  (debug-signed, same package id → uninstall the Play build first; reinstall
  it from Play afterwards).
- Staging side: `TAP_TO_PAY=1` on the staging service (David sets it), log in
  on the phone as the owner of **Brightwire Electric** (`e@e.com`, the staging
  company already connected to David's sandbox test seller), Settings →
  Online Payments → **Reconnect Square** once from a desktop browser with the
  sandbox seller dashboard open in another tab (the grant needs the in-person
  scope), then Settings → Online Payments on the phone → Set up, and Tap to
  Pay on any invoice: Square's prompt opens, tap the floating mock reader →
  connect a contactless reader → tap → Payment details → approved. The
  invoice is marked paid through the same server route production will use.
- When production is live: the Play build (release, production id, no mock
  reader) is the one to upload; nothing in this section ships to the store.

### Sandbox test build — iPhone (2026-10-23, David has no Android phone)

Same idea as the Android section above, but iOS cannot be built on the PC:
the sandbox test on David's iPhone is the **first thing the Mac session
does**, before the release archive. Everything is wired so it is one run:

- **Debug configuration = sandbox test build.** `project.pbxproj` carries two
  user-defined build settings on the App target: `SQUARE_APPLICATION_ID`
  (Debug = the sandbox id, Release = the production id) and `WB_SHELL_ORIGIN`
  (Debug = `https://streamflaire-staging.up.railway.app`, Release = empty).
  `Info.plist` reads both (`SquareApplicationID`, `WBShellOrigin`), and
  `ShellViewController.instanceDescriptor()` points the webview at that
  origin when it is set. The staging host was added to `WKAppBoundDomains`
  (the bridge cannot inject itself into a non-app-bound origin).
- **Mock reader.** The package's second product, `MockReaderUI`, is in the
  target (SPM cannot link per configuration, so the framework ships in
  Release too — but only Debug imports it: `#if DEBUG import MockReaderUI`).
  `TapToPayPlugin.swift` creates `MockReaderUI(for: MobilePaymentsSDK.shared)`
  after a sandbox authorize (and on status() when already authorized),
  `present()`s the floating button, `dismiss()`es it on deauthorize. In the
  sandbox the plugin reports `capable: true` and `appleLinked: true` and
  skips Apple's terms sheet — the mock reader stands in for NFC and Tap to
  Pay on iPhone, which the sandbox does not run.
- **Mac, in order:** `git pull`, `npm ci`, `npx cap sync ios`, open
  `ios/App/App.xcworkspace` (or .xcodeproj), let SPM resolve (two products
  from `mobile-payments-sdk-ios` 2.6.0; if the hand-edited pbxproj upsets
  Xcode, remove the `5Q2026…` entries and add the package through File →
  Add Package Dependencies with BOTH products ticked, then the "Square SDK
  setup" run-script phase LAST and User Script Sandboxing = No). Signing:
  the App ID must have **Tap to Pay on iPhone** enabled (Additional
  Capabilities) — with the key in App.entitlements and automatic signing the
  development profile regenerates by itself; if signing fails, that toggle
  is the first thing to check. Scheme **App**, configuration **Debug** (the
  default for Run), destination = David's iPhone by cable → Run. Fix any
  SDK name drift in `TapToPayPlugin.swift` (never compiled before).
- **On the phone:** the app opens the STAGING site. `TAP_TO_PAY=1` must be
  set on the staging service (David). Sign in as `e@e.com` (Brightwire
  Electric, the staging company connected to David's sandbox seller;
  Reconnect Square once from a desktop browser with the sandbox seller
  dashboard open — the grant needs the in-person scope). Settings → Online
  Payments → **Tap to Pay on this phone → Set up** (location prompt; no
  Apple sheet in the sandbox) → the floating mock reader appears → any
  unpaid invoice → **Tap to Pay** → Square's prompt → tap the floating
  button → connect a contactless reader → tap → Payment details → approved
  (and once declined). The invoice goes PAID through the same route
  production will use. Recipes 7–14 in the plan doc apply with the mock
  reader in place of a card.
- **Then the real build:** Product → Scheme → Edit → Archive uses Release
  (production id, no origin override) → Distribute → TestFlight = build 14.
  Nothing from the Debug configuration reaches that archive.

### While you wait for Apple — in this order, nothing here needs the entitlement

- [x] **Try the quick charge on staging** — DONE 2026-10-23 by Claude: e2e/specs/quick-charge.spec.ts (API + form + pay page) passes against staging.
      `quick-charge-tap` merged into `staging` at d9271ac2): sign in at
      https://streamflaire-staging.up.railway.app → Create → `Request
      payment`. Plan doc recipes 1–6. Anything off → tell Claude before the
      release.
- [x] **Release the web half** — production db:push done 2026-10-23 (QUICK_CHARGE enum); released to main the same day (see the build log in the plan doc).
      charge looks right: `npm run db:push` against PRODUCTION first (new
      `InvoiceKind.QUICK_CHARGE`), then `git push origin <green sha>:main`.
      Tap to Pay stays dark on prod (`TAP_TO_PAY` unset), so releasing is
      safe before any build exists. The two new Help guides go live with it.
- [ ] **Square Developer Console → the WorkBench app → Mobile Payments SDK →
      Add Signature** (production app): iOS = bundle id
      `com.streamflaire.hub` + your Apple **Team ID** (developer.apple.com →
      Membership details); Android = package `com.streamflaire.hub` + the
      SHA-256 of the current **Play app signing key** (Play Console → Test
      and release → App integrity → App signing; the four known
      fingerprints are listed under § Picking this up cold). One signature
      per platform; add the other Android fingerprints too if the form
      allows several. **Format gotcha (2026-10-23):** the form rejects the
      Play Console / keytool form ("Enter a valid SHA-256 certificate") —
      paste the 64 hex characters with NO colons, lowercase:
      current classical key = `1a2b78058d44c6921efc9b82552061d7cb57e49d798e6463e881bab49bcaab52`,
      post-quantum = `54bbaa773189e158375ae0c6de6d6859e35f7fccbbcc155150cfa0383e5e7f16`,
      previous = `001c3dc1b6703a38edc00dff8000b7f0fdc9625c9bb63e76b9ce2f6992e62f96`,
      upload key = `dedf69374c20a2fa9e68b63636835859a595eb9df0ae70f5c4957aebd771c6fd`.
- [x] **Production `SQUARE_APPLICATION_ID` written into both shells** 2026-10-23 (taken from Railway production; commit "Tap to Pay: production Square application id in both shells").
      public value Railway holds) so it can be written into
      `ios/App/App/Info.plist` → `SquareApplicationID` and
      `android/app/src/main/res/values/strings.xml` →
      `square_application_id`. Or paste it in yourself; both are empty
      strings today. Nothing shows in the apps until this is set.
- [x] **Square production activation** — done: /api/health on workbenchfsm.com reports processor=square (checked 2026-10-23).
      Square activates the production app (health endpoint says
      `processor`). Tap to Pay needs the processor to be Square in
      production, so chase the Square payments contact if that is still
      pending — it gates Tap to Pay as much as Apple does.
- [x] **Android bundle BUILT 2026-10-23** on David's PC from d051f79f (cap sync + gradlew bundleRelease, signed with the upload key, versionCode 6 / 1.4; Square SDK + TapToPayPlugin + app id verified inside the AAB): `~/Downloads/workbench-android-vc6-tap-to-pay.aab`. **HELD** — ships with iOS build 14 (David 2026-10-23), see § Google Play below. When that day comes: upload to internal testing, install, then David sets the Railway flag (Claude's CLI write was blocked by permissions). Old shells without the plugin render nothing, so the flag is safe to set before everyone updates.
- [ ] ~~Android does not need Apple at all.~~ Once the signature and the
      application id are in: on this PC, `npx cap sync android` (revert
      `capacitor.settings.gradle` if run from a worktree), `cd android &&
      gradlew bundleRelease`, upload versionCode 6 to the Play **internal
      testing** track (runbook § PLAY STORE), install it, then set
      `TAP_TO_PAY=1` on Railway production, reconnect Square once from
      Settings → Online Payments (the card asks), and run recipes 7–14 with
      a real card for $1.00. If Android proves the server side, the iOS
      build is only the plugin + entitlement.
- [ ] **Reconnect Square on your own company** after the release — the
      grant needs the new in-person permission; the Settings card says
      **Reconnect Square to turn on Tap to Pay** until you do. Every other
      connected seller sees the same prompt.
- [x] **Apple entitlement APPROVED 2026-10-23**; key uncommented in App.entitlements (d051f79f). Still for David: enable Tap to Pay on iPhone on the App ID (Identifiers → com.streamflaire.hub → Additional Capabilities), reply to Apple's email for the distribution grant, Mac build 14.
- [ ] ~~When Apple's development grant arrives:~~ Certificates, IDs &
      Profiles → Identifiers → the app → **Additional Capabilities** tab →
      enable **Tap to Pay on iPhone** → Save; uncomment the key in
      `ios/App/App/App.entitlements`; Mac session per § Mac below. Then
      reply to Apple's email for the distribution grant before the
      TestFlight / App Store build.

Things Claude can do meanwhile, on request: a debug-only MockReaderUI
hookup so the Android and iOS flows can be exercised against the Square
sandbox without a card; a debug shell pointed at staging
(`capacitor.config.ts` `server.url`) for testing Tap to Pay there before
prod; the Invoices-list kind chip and job-page button left out of the plan.

**What the tree carries**

- iOS: `ios/App/App/TapToPayPlugin.swift` (registered in
  `ShellViewController`), SDK init in `AppDelegate` from Info.plist
  `SquareApplicationID`, the `mobile-payments-sdk-ios` package (exact
  2.6.0) + a **"Square SDK setup" run-script phase, last** + User Script
  Sandboxing off + **deployment target 15.0 → 16.0** (the SDK package's
  platform floor is iOS 16; Tap to Pay itself needs iOS 16.7, iPhone XS+.
  This drops only phones stuck on iOS 15 — iPhone 6s/7/SE 1st gen),
  `NSBluetoothAlwaysUsageDescription`, the location
  usage string now mentions Tap to Pay, and the entitlement key is in
  `App.entitlements` **commented out**.
- Android: `TapToPayPlugin.java` + `HubApplication.java` (SDK init from
  `strings.xml` `square_application_id`), registered in `MainActivity`,
  `com.squareup.sdk:mobile-payments-sdk:2.6.1` + Square's Maven repo,
  **minSdk 24 → 28** (Android 9+; Play will show the dropped device count on
  upload), location / Bluetooth / phone-state / NFC permissions (NFC
  hardware `required=false`).
- Neither plugin has run on a device. iOS was written on Windows against
  Square's docs — expect a handful of renames when Xcode first compiles it
  (the SDK's `Payment` / `OnlinePayment` / `TapToPaySettings` names are
  the likely spots). Android compiles clean against SDK 2.6.1 (javac,
  2026-10-22) but has not run on a phone.

**David — consoles, BEFORE the Mac session**

1. **Apple: request the Tap to Pay on iPhone entitlement** (account holder,
   Organization account): developer.apple.com → Account → Additional
   resources → Tap to Pay on iPhone → request for `com.streamflaire.hub`.
   Days to weeks. When granted: add the capability to the App ID in
   Certificates, Identifiers & Profiles, regenerate the provisioning
   profile, and **uncomment the key in `ios/App/App/App.entitlements`**.
   Until then the key must stay commented or signing fails.
2. **Square Developer Console → the WorkBench app → Mobile Payments SDK →
   Add Signature** (production): iOS = bundle id `com.streamflaire.hub` +
   the Apple team id; Android = package `com.streamflaire.hub` + the
   SHA-256 of the **Play app signing key** (the four fingerprints are under
   "Picking this up cold" below — register the current one, add the others
   if Square accepts more than one). Debug builds that take production
   payments need their own signature; sandbox needs none.
3. **Application id into the native projects**: the production
   `SQUARE_APPLICATION_ID` (same value as Railway) goes into
   `ios/App/App/Info.plist` → `SquareApplicationID` and
   `android/app/src/main/res/values/strings.xml` → `square_application_id`.
   Empty = Tap to Pay stays off in that build (the page never shows the
   button). For a sandbox test build use the sandbox id instead — the
   plugin refuses a token from the other environment with a clear message.
4. Every seller connected before this release must **Reconnect Square**
   once (Settings → Online Payments → the Tap to Pay card says so) — the
   grant needs `PAYMENTS_WRITE_IN_PERSON`.

**Mac — in addition to `mobile-app-runbook-mac.md`**

- Open the project; Xcode resolves the new package. If it complains about
  the hand-edited `project.pbxproj`, remove the `5Q2026…` entries and add
  the package through File → Add Package Dependencies →
  `https://github.com/square/mobile-payments-sdk-ios`, Exact Version
  2.6.0, product `SquareMobilePaymentsSDK`; then Build Phases → + Run
  Script (LAST): `"${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}/SquareMobilePaymentsSDK.framework/setup"`;
  Build Settings → User Script Sandboxing = No.
- Compile; fix any SDK name drift in `TapToPayPlugin.swift`.
- TestFlight → on the phone: Settings → Online Payments → "Tap to Pay on
  this phone" → Set up (location → Apple terms sheet) → an invoice → Tap to
  Pay. Recipes 7–14 in the plan doc.
- Android: `npx cap sync android` (revert `capacitor.settings.gradle` if run
  from a worktree), `gradlew bundleRelease`, internal testing track first.

**After both builds are out**: set `TAP_TO_PAY=1` on Railway (staging
first), run the device pass, then production.

## NEXT BUILD — launch screen + icon (iOS 1.4 / build 13) — tree ready 2026-10-10

> **2026-10-10, David:** this round is **iOS only**. The Android half
> (icon, solid splash, versionCode 6) is committed and harmless; it ships
> whenever the next Play build is cut. Phone-contacts sync is **archived**
> (see the bottom of this file), not riding along.

Everything below is committed; nothing has been archived or uploaded yet.
Build it per the runbook (`npx cap sync ios`, then archive + upload in
Xcode). Versions are already bumped in the tree: pbxproj
`MARKETING_VERSION 1.4` / `CURRENT_PROJECT_VERSION 13` (build.gradle is
also at `versionName "1.4"` / `versionCode 6` for whenever Android goes).

**Why a build:** David's three asks of 2026-10-09 — the iOS icon had a
white border and was not filled in, a checkered pattern showed on launch,
and he wants the launch to be only the animation. Root cause of the first
two: the old `assets/icon-only.png` and `assets/splash.png` were AI
renders of an icon with a fake transparency checkerboard painted INTO the
pixels (RGB, no alpha); iOS masked that into its squircle and the painted
corners showed as a border.

**What this build carries:**

1. **Icon** — `assets/icon-only.png` is now David's official icon
   (`Workbench OFFICIAL App Icon.png`, blue #0065FC) extended to a
   full-bleed 1024 square; Android adaptive layers are the same artwork in
   the safe zone over solid blue. Regenerated with
   `npx @capacitor/assets@3 generate --ios --android` (both platforms).
2. **Launch screen = the animation's first frame.** iOS cannot skip its
   launch screen, so it is made invisible: `assets/splash*.png` are solid
   #0065FC, `LaunchScreen.storyboard` is blue + scaleAspectFill (no white
   letterbox), `capacitor.config.ts` sets the webview `backgroundColor` and
   the SplashScreen plugin to the same blue with no fade, and the web
   animation (`components/LaunchSplash.tsx`, live on prod since
   2026-10-09) starts from a solid-blue frame and calls
   `SplashScreen.hide()` the moment it paints. `launchShowDuration: 6000`
   is only the safety net (offline → `native-shell/error.html` also hides
   it; `NativeShell.tsx` hides it as a backstop on every page).
3. **Android 12+ system splash** — `styles.xml` sets
   `windowSplashScreenBackground` #0065FC and a transparent
   `windowSplashScreenAnimatedIcon`, so Android shows the same solid blue
   instead of the launcher icon in a circle.

4. **Siri expansion** (`ios/App/App/Intents.swift`, 2026-10-10). Apple
   caps an app at ten spoken shortcuts and 1.3 had nine, so related actions
   now share one shortcut and the spoken word picks (App Enums). New:
   **"Directions to my next job"** (Apple Maps to the job/client address),
   **"What's my next job"** and **"What's my time on this job"** (spoken,
   no app), **"Complete my job"** (the job I'm on → Requires Invoicing via
   the same status route as the button, checklist gate included),
   **"Call / Text my next client"**. Changed: "Clock me in/out" is one
   shortcut; "What's my next job in WorkBench" now *answers* instead of
   opening the job ("Next job in WorkBench" / "Open my next job" still
   open it). **Calls and texts now match the app's own buttons**
   (`/api/app/siri/line`): a company with a business line calls/texts from
   it; one without gets the phone's dialer or Messages app with the number
   and text filled in (`ForegroundContinuableIntent`, which is why the
   Siri floor moved from iOS 16.0 to 16.4). "On my way" without a line
   hands the template text to Messages the same way. Web routes
   (`/api/app/siri/line`, `next-job` now returning `when`, `onClock`,
   `address`, `contactPhone`; `on-my-way` handoff reply) ship with the web
   deploy — the old 1.3 intents keep working against them.

**After it's live — verify on the phone:** home-screen icon is a full blue
squircle with no border; force-quit and relaunch → solid blue, then the
animation, with no white flash, no checker, no second splash; airplane mode
→ the offline page still appears (splash released); dark mode launch is
also blue. Siri: "Clock me in with WorkBench" / "Clock me out with
WorkBench"; "Directions to my next job in WorkBench" opens Maps; "What's my
next job in WorkBench" answers in words; "Complete my job in WorkBench";
"Text my next client with WorkBench" → Siri asks what to say, then sends
from the line (or, for a company with no line, brings the app forward and
opens Messages with the text filled in); "Call my next client with
WorkBench"; the Shortcuts app lists ten WorkBench shortcuts.

---

## iOS — queued for build 14

0. ~~**Talk to Atlas: native speech recognition**~~ **DONE 2026-10-27** — see
   § Talk to Atlas under Tap to Pay above (local plugin on both shells, not
   the community package). Original note: the web voice mode (`components/AssistantVoice.tsx`) uses
   the browser's Web Speech API, which neither WKWebView nor the Android
   WebView has, so inside the apps it falls back to recording the mic and
   transcribing server-side (`/api/app/assistant/transcribe`) — tap to
   start, tap to stop, a second or two of lag. Add
   `@capacitor-community/speech-recognition` (iOS `NSSpeechRecognitionUsageDescription`
   + the existing mic string; Android `RECORD_AUDIO`) and have
   `lib/voice-chat-client.ts listenOnce` prefer the plugin when
   `Capacitor.isPluginAvailable("SpeechRecognition")`, so the apps get
   live, interim, hands-free recognition like Safari. Web keeps working
   either way.

1. **Calling engine: the phone must say which credential it holds**
   (`ios/App/App/VoipPlugin.swift`, found 2026-10-21). A pushed call for
   another company on the login races the page: `SoftphoneNativeEngine`
   probeCompany gets `switch` and re-points the session BEFORE the engine
   posts /ready, so the engine asks as the new membership while it is still
   registered as the old one, and its leg dies at Telnyx with 480. The
   server now covers build 13 (lib/voice.ts dialWokenPhone dials every iOS
   credential of the login, and redials on 480). For the engine itself:
   - remember the membership (user id) and SIP username the grant was issued
     for, and send that membership in every /ready — the ready route then
     dials the credential the phone actually holds, or answers `switch`;
   - on `register()` from the page (every page load, so also right after a
     company switch), re-fetch the grant and reconnect when its SIP username
     differs from the one registered — an outbound call placed right after
     a switch otherwise dials a credential the phone is not on.

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

**Tap to Pay (Square Mobile Payments SDK) — HELD to ship together with iOS
build 14 (David 2026-10-23: "it is behind Apple so I want to do it all at the
same time").** The tree is ready (see the Tap to Pay section above): plugin, SDK,
minSdk 28, production app id in strings.xml, Square signatures registered.
A signed vc6 AAB from d051f79f sits at
`~/Downloads/workbench-android-vc6-tap-to-pay.aab`; if anything else lands in
`android/**` before the upload, rebuild (`npx cap sync android`, revert the two
generated gradle files in a worktree, `cd android && gradlew bundleRelease`);
versionCode stays 6 until something is actually uploaded. Upload to internal
testing the same day as the TestFlight build, then `TAP_TO_PAY=1` on Railway
production (David sets it), reconnect Square, recipes 7–14. Real cards need
Square PRODUCTION credentials activated on David's account — the sandbox never
moves money and has no physical readers (Mock Reader UI only).

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

**Calls ringing the phone when the app is closed — Android half — BUILT 2026-10-27 (branch `android-parity`, rides versionCode 6).** iOS shipped it in 1.3 (PushKit + CallKit); Android now mirrors it: `lib/voip.ts` sends an FCM high-priority DATA message (`lib/push.ts sendVoipFcm`, platform `android-voip`) → `WbMessagingService.kt` (replaces the push plugin's service in the manifest, extends it) → `VoipEngine.kt` (the Telnyx Android SDK 3.7.3 via JitPack; same grant → register → `/softphone/ready { device: "android" }` dance, own credential `User.sipUsernameAndroid`) → `CallService.kt` (foreground service, type phoneCall|microphone: CallStyle notification with Answer / Decline, ringtone + vibration honouring the ringer switch, full-screen `IncomingCallActivity.kt` over the lock screen that doubles as the in-call screen) → the web page mirrors it through the same `WorkBenchVoip` bridge as iOS (`lib/native-voip.ts` now answers on Android; `SoftphoneNativeEngine.ts` sends the device). The app's native code is Kotlin from here (Kotlin Gradle plugin 2.4.21). Design + decisions: `business-line-voice-2026-09-18.md` § Tier 3 (Android). **Schema:** `User.sipCredentialIdAndroid` / `sipUsernameAndroid` — `npm run db:push` on production BEFORE the web release. **Not yet compiled or device-tested** (2026-10-27: the Kotlin release build was cut off by memory pressure on David's PC with the emulator running; re-run `cd android && gradlew assembleRelease` with the emulator closed, fix any SDK name drift in VoipEngine.kt, then the superadmin test ring on the emulator and recipes 1–9 in the plan doc § Tier 3 Android on a real phone).

**Code shrinking / R8 — DONE 2026-10-27 (branch `android-parity`, rides versionCode 6).**
`minifyEnabled` + `shrinkResources` on the release build type with
`proguard-android-optimize.txt`; keep rules in `android/app/proguard-rules.pro`
(everything under `com.streamflaire.hub` and `com.getcapacitor`, every
`@CapacitorPlugin`, `@JavascriptInterface` members, Square's SDK; line
numbers kept so Play's traces read). The mapping file is inside the AAB
(`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`) — Play
picks it up on upload, nothing to attach. Verified on the Android 15
emulator (`wb35`, Pixel 7, Google APIs): the release APK launches and
renders, the plugin classes and bridge names survive R8. **The bundle to
upload is `~/Downloads/workbench-android-vc6-parity.aab`** (re-cut
2026-10-27 from branch `android-parity`: R8 + speech plugin + calling
engine); the 2026-10-23 `workbench-android-vc6-tap-to-pay.aab` is
superseded. Upload only after the web side with the Android columns is on
production (db:push first), or the engine registers against a server that
does not know `android-voip` yet. Original note: Play's release dashboard flags
"DEX code optimization is below our threshold — Obfuscation 2%", fix by
**Feb 2027**, and every upload warns about the missing deobfuscation file
and native debug symbols. Turn on `minifyEnabled` + `shrinkResources` for
the release build type, keep the Capacitor/plugin keep-rules, and upload
the mapping file with the bundle. Needs a build because it changes the
compiled APK; test the webview bridge on a device first (obfuscation can
break `@CapacitorPlugin` reflection if the keep-rules are wrong).

**Edge-to-edge deprecations** (queued 2026-09-25) — nothing to do: the
tree is on Capacitor 8 (`@capacitor/status-bar` 8.0.2 only calls
`setStatusBarColor` below SDK 35; core's `SystemBars` uses
`WindowInsetsControllerCompat`). Check the vc6 upload's warnings; if Play
still names one, it comes from a plugin, not this project.

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

Ideas deliberately *not* queued (no one is waiting on them): **phone
contacts export/import** (archived 2026-10-10 by David — when it comes
back: `@capacitor-community/contacts`, verify Capacitor 8 support,
`NSContactsUsageDescription`, Android READ/WRITE_CONTACTS, "Contacts" data
type on both stores' privacy forms; UI = "Save to phone" on the contact
card and "Import from phone" → the existing `/api/app/contacts/import`
route; vCard download as the web fallback); an Android
home-screen widget; a Settings help card documenting the Shortcuts recipe for
users who won't wait for the Siri build (that one is web — ship it any time).
