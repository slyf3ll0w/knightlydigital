# Native release queue

Store builds are expensive (review latency, a Mac for iOS, a version bump, a
staged rollout), so we batch them. **Anything that cannot ride a web deploy
gets parked here until the next submission.** When you cut a build, work the
platform's section top to bottom, then clear it.

Build mechanics live in `mobile-app-runbook-mac.md` (§ PLAY STORE for the
Android/Windows path, § Mac steps for iOS). This file is only *what is
waiting* — not how to build.

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
status-bar, biometric-auth, app-shortcuts, badge.

> Worked example, 2026-09-16. The App Links deep-link fix *looked* native —
> intent filters, universal links. It needed no build: the intent filter and
> `@capacitor/app` both shipped in versionCode 3, and the missing piece was a
> JS `appUrlOpen` listener in `NativeShell.tsx`. Web deploy, live immediately.
> When in doubt, check whether the native half already shipped.

## Shipped now

| | Version | State |
|---|---|---|
| Google Play | versionCode 3 / 1.2 | Live since 2026-09-14 |
| App Store | 1.2 (build 5) | **Never submitted** |

Bump `versionCode` in `android/app/build.gradle` on every Play upload (Play
rejects reuse; `versionName` is cosmetic). Next upload is versionCode 4.

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

**Native Google sign-in.** `lib/sign-in-options.ts` hides the Google button
whenever the user agent is the shell, because Google refuses OAuth in embedded
webviews and a hop to the system browser would leave the session cookie in the
wrong browser. Web Google sign-in is already live (35ac856).
- Plugin: `@capgo/capacitor-social-login` — *this is a new plugin, hence the
  build*. The page posts the ID token to a second Credentials-style provider
  that verifies it and calls `resolveSocialSignIn`.
- Register the SHA-1 of **both** the upload key and the Play app-signing key
  as Android OAuth clients, or sign-in fails only in the released build.
- Full design: `social-login-2026-09-14.md` § Next.
- Drop the shell check in `googleSignInAvailableFor` in the same release.

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

**3. Siri App Intents** (queued 2026-08-22). "Hey Siri, clock me in" / "next
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
