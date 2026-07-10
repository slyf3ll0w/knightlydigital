# Mobile App Plan — App Store / Play Store via Capacitor

*Drafted 2026-07-08. Status: PHASE 1 (web push) SHIPPED 2026-07-09. PHASE 2
green-lit 2026-07-09 — everything doable without a Mac/device is DONE and
committed (Capacitor scaffold, icons/splash, NativeShell integration, FCM
send path env-gated on FIREBASE_SERVICE_ACCOUNT, native register UI —
UNTESTED on device). Continuation lives in
docs/plans/mobile-app-runbook-mac.md for Claude Code on David's Mac (he has a
Mac, no Android phone → iOS on his iPhone first, Android via emulator).
Prereq that blocks real strangers using the app either way: Gemini paid-tier
flip.*

## Goal

Streamflaire Hub downloadable from the Apple App Store and Google Play Store,
while staying exactly as accessible on the web. One codebase.

## Architecture decision: Capacitor in remote-URL mode

Capacitor normally bundles static web files inside the native binary. This app
can't be bundled — it's server-rendered Next.js 15 (server components, API
routes, NextAuth cookie sessions on Railway). A static export would mean
rebuilding the client as an SPA: rejected as a huge rework for zero user value.

Instead the native app is a thin shell whose webview loads
`https://streamflaire.com` directly (`server.url` in `capacitor.config.ts`),
with native plugins layered on top.

- **Upside:** every web deploy instantly updates the mobile app. No store
  re-review for feature work. One codebase forever.
- **Risk:** Apple guideline 4.2 ("minimum functionality") rejects apps that are
  just a wrapped website. Mitigation = real native integration (below). Google
  Play doesn't care.
- Auth just works: the webview is a real browser hitting the real site, so
  NextAuth cookies + Turnstile behave normally.

## What already exists (don't redo)

- PWA manifest: `app/manifest.ts` — standalone display, scope `/app`, icons in
  `public/pwa/`. Home-screen installs open as a real web app. **Working.**
- In-app account deletion (Settings → Danger Zone) — an App Store REQUIREMENT
  (Apple 5.1.1(v)). Done.
- No third-party social logins → "Sign in with Apple" is NOT required.
- Payments: Apple IAP rules don't apply — payments here are for real-world
  services (guideline 3.1.5(a) exemption). If we ever sell the SOFTWARE via
  in-app subscription, that changes.

## Phase 1 — Web Push — ✅ SHIPPED 2026-07-09 (commit 03debd2)

Built as planned, all items below. Implementation notes for Phase 2:
- `lib/push.ts` — `notifyUser`/`notifyUsers` + audience helpers
  (`companyManagerIds`, `requestNotifyUserIds`); env-gated on
  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (both set on Railway).
- `PushSubscription` model (endpoint unique, pruned on 404/410) — Phase 2
  adds the `platform` column + FCM/APNs tokens here.
- Subscribe UI: per-user toggle on My Profile (`PushToggleCard`) +
  dismissible dashboard nudge (`PushNudge`), both in
  `components/PushNotifications.tsx`; `public/sw.js` handles show + click.
- Send points live: new requests → owners/lead assignee (+ client's
  salesperson from the hub), self-scheduled bookings → managers, team chat →
  thread recipients (tag-collapsed per thread), payments → owners minus
  whoever recorded it, hour-before appointment reminder → assigned member.
- Notification prefs: all-on to start (per open question) — revisit if noisy.

## Phase 1 — original build list (kept for reference)

Push is the single biggest win and it works TODAY for the existing home-screen
install. It also builds the exact server plumbing the native app reuses.

- iOS 16.4+: web push works ONLY for standalone home-screen installs (ours
  qualifies thanks to the manifest). Permission prompt must come from a user
  tap. Delivery is decent but below native APNs; deleting the icon kills the
  subscription.
- Android/Chrome + desktop: web push works even without install.

Build list:
1. Service worker (`public/sw.js` or next-pwa) — `push` + `notificationclick`
   handlers (click → deep link to `/app/requests/[id]`, `/app/chat`, etc.).
2. VAPID keypair (env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), `web-push` npm.
3. `PushSubscription` model: `id, userId, endpoint @unique, p256dh, auth,
   userAgent, createdAt` — cascade on user delete; prune on 404/410 send errors.
4. Subscribe UI: settings toggle + one-time nudge card (must be tap-triggered
   for iOS). POST /api/app/push/subscribe, DELETE to unsubscribe.
5. `lib/push.ts` `notifyUser(userId, {title, body, url})` — fire-and-forget like
   `sendEmail`, env-gated the same way.
6. Wire send points (mirror existing emails + chat):
   - new request (booking form / client hub) → owner + defaultLeadUserId
   - team chat: channel message → all other members; DM → recipient
   - booking NEEDS_APPROVAL → managers
   - payment recorded / invoice paid → owner
   - appointment reminders (cron already exists — add push beside email)
7. Per-user notification prefs later if it gets noisy (start with all-on).

## Phase 2 — Capacitor shell (Android first, then iOS)

1. `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`;
   `capacitor.config.ts` with `server: { url: "https://streamflaire.com" }`,
   appId e.g. `com.streamflaire.hub`. Keep `ios/` + `android/` folders in repo.
2. Native shell polish: splash screens + app icons (`@capacitor/assets`
   generates all sizes from one 1024px source), StatusBar plugin (dark rail
   color), safe-area CSS (`viewport-fit=cover` + `env(safe-area-inset-*)` —
   check AppShell mobile tab bar + Atlas bubble).
3. `Capacitor.isNativePlatform()` detection in the web app: hide "install app"
   style UI, register native push instead of web push, handle Android back
   button (App plugin), external links (`/hub`, `/quote`, `/pay` client pages)
   open in system browser via Browser plugin so clients don't get trapped in
   the owner app shell.
4. **Native push** (@capacitor/push-notifications): reuse Phase 1 tables — add
   `platform` column ("web" | "ios" | "android") + FCM/APNs token storage;
   send via FCM (covers both platforms; iOS needs APNs key uploaded to
   Firebase). `notifyUser` fans out to all of a user's subscriptions.
5. **Camera** (@capacitor/camera) wired into job photo upload (input capture
   works in webviews too — plugin gives the nicer native sheet).
6. **Deep links**: universal links (apple-app-site-association) + Android App
   Links (assetlinks.json) so streamflaire.com/app/* opens the app.
7. Offline: friendly retry screen when the webview can't reach the server
   (remote-URL apps show an ugly error page by default).
8. No-connectivity + slow-network QA on real devices.

Apple 4.2 defense = push + camera + deep links + splash/status-bar integration.
If rejected anyway: appeal citing native features, or add haptics/biometric
app-lock as further differentiation.

## Phase 3 — Store shipping

Android (do first — cheap, fast, lenient review):
- Google Play Console account ($25 one-time), signing key (Play App Signing),
  privacy policy URL (need one on the marketing site), data-safety form,
  screenshots, closed testing track → production.

iOS:
- Apple Developer Program ($99/yr; individual OR org w/ D-U-N-S — org looks
  better on the listing). Enrollment takes days — start early.
- Build needs macOS/Xcode. David has no Mac (confirm) → CI build via GitHub
  Actions macOS runner or Codemagic (free tier ok to start); certificates +
  provisioning via fastlane match or Xcode Cloud.
- App Store Connect: listing, 6.7"/6.5"/5.5" screenshots, App Privacy
  questionnaire, age rating, **demo account creds for the reviewer** (use a
  seeded demo company, NOT the real demo co), review notes explaining the
  business tool + native features.
- TestFlight beta first (David + real tester), then App Store review — expect
  1–3 rounds, days each.

## What only David can provide

- Apple Developer Program enrollment ($99/yr) — days of lead time
- Google Play Console ($25 one-time)
- Privacy policy page (required by both stores; also good for the site)
- Decision: individual vs LLC store accounts
- Confirm Mac availability (else we set up cloud iOS builds)
- Firebase project (free) for FCM — 10 min, can be done together

## Order of work when picked back up

1. Phase 1 web push (pure code, ships value immediately to the existing
   home-screen installs on Android; iOS installs get it too)
2. Phase 2 Capacitor + Android internal testing build
3. Play Store listing → production
4. iOS build via CI + TestFlight
5. App Store review

## Open questions

- Notification preferences UI — per-event toggles or all-on to start?
- Badge counts on the app icon (chat unread) — Badging API (web) /
  native badge plugin — nice-to-have, phase 2+.
- Client-facing app later? (Clients currently use /hub links — fine in
  browser; a client app is a separate product decision.)
