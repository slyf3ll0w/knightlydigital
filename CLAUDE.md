# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Commands

```bash
npm run dev        # local dev server at localhost:3000
npm run build      # production build (required before deploy)
npm start          # production server (Railway uses this)
npm run db:push    # push Prisma schema to database (needs DATABASE_URL)
npm run db:seed    # seed initial superadmin user
npm run db:generate # regenerate Prisma client after schema changes
```

To regenerate the Prisma client locally (required after schema changes):
```bash
node node_modules/prisma/build/index.js generate
```

## Architecture

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4. Prisma 5 ORM with PostgreSQL (Railway). NextAuth v4 for authentication. lucide-react for icons.

**Font**: Oxanium (Google Fonts, loaded in `app/layout.tsx` via `<link>` tag).

**Theme**: Black (`#0C0F0C`) + Green (`#22C55E`) throughout both the marketing site and the job manager app.

**Background pattern**: `/public/bg-pattern.svg` (diamond grid). Applied via `.bg-patterned` utility class.

## Project structure

This repo has two distinct products:

### 1. Streamflare Marketing Site (`/`)
DFW digital agency marketing pages. URL structure:
- `app/page.tsx` → Allen, TX home
- `app/[city]/page.tsx` → City homes (20 DFW cities)
- `app/[city]/[service]/page.tsx` → City + service pages
- `app/about/page.tsx`, `app/contact/page.tsx`, `app/services/page.tsx`
- `app/crm/page.tsx`, `app/custom-software/page.tsx`, etc.

### 2. JobFlow — Free Job Manager SaaS (`/app/*`)
Free field service management tool (like Housecall Pro / Jobber).
Multi-tenant: each field service company gets their own account.
Monetized via payment processing fees (processor stub in `lib/payments.ts`).

```
app/app/
  login/                  → Sign in
  register/               → New company signup (creates Company + OWNER user)
  dashboard/              → Overview stats + recent jobs
  contacts/               → Customer database
  contacts/[id]/          → Contact detail + job history
  contacts/new/           → New contact form
  leads/                  → Lead pipeline kanban board (customizable stages, Won/Lost)
  jobs/                   → Jobs list with tab filters
  jobs/[id]/              → Job detail (notes, photos, status, quote/invoice)
  jobs/new/               → New job form
  schedule/               → Monthly calendar view
  quotes/                 → Quotes list
  quotes/[id]/            → Quote detail (line items, send, accept)
  quotes/new/             → Quote builder
  invoices/               → Invoices list with tab filters
  invoices/[id]/          → Invoice detail + payment actions
  invoices/new/           → Invoice builder
  settings/               → Company profile + surcharging + review link
```

**Public pages** (no auth required):
- `/book/[slug]` — Online booking widget (embeddable per company)
- `/pay/[token]` — Invoice payment page (card + ACH)
- `/quote/[token]` — Customer quote acceptance page

**API routes** (`/api/app/*`):
All job manager API routes are scoped to `session.user.companyId` for multi-tenancy.
- `/api/app/register` — Company + owner user creation
- `/api/app/contacts[/[id]]` — CRUD contacts
- `/api/app/jobs[/[id]]` — CRUD jobs
- `/api/app/jobs/[id]/status` — PATCH job status
- `/api/app/jobs/[id]/notes` — POST note to job
- `/api/app/jobs/[id]/photos[/[photoId]]` — POST photo (multipart, bytes stored on JobPhoto), DELETE photo; served authed via `/api/job-photos/[photoId]`
- `/api/app/quotes[/[id]]` — CRUD quotes
- `/api/app/quotes/[id]/send` — POST: email the client their quote link + mark sent
- `/api/app/invoices/[id]/send` — POST: email the client their pay link + mark sent
- `/api/app/invoices[/[id]]` — CRUD invoices
- `/api/app/invoices/[id]/status` — PATCH invoice status
- `/api/app/invoices/[id]/pay` — Record payment (calls payment processor)
- `/api/app/settings` — PATCH company settings
- `/api/public/*` — Public booking, payment, quote acceptance

## Data layer

**`lib/db.ts`** — Prisma client singleton.
**`lib/auth-options.ts`** — NextAuth v4 config. JWT includes `id`, `role`, `companyId`.
**`lib/payments.ts`** — Payment processing layer: `PaymentProcessor` seam (manual/finix, picked by PAYMENT_PROCESSOR), `recordPayment()` single write path, `recomputeInvoiceStatus()`, fee estimators. See "Payment processor (Finix)" below.
**`lib/cities.ts`** — 21 DFW cities.
**`lib/services.ts`** — 2 Streamflare services (custom software, custom web design). Marketing services retired 2026-07.

## Database models

Key multi-tenant models, all scoped by `companyId`:
- `Company` — tenant, has slug for booking URL
- `User` — roles: SUPERADMIN (Streamflare), OWNER, MANAGER, TECH
- `Contact` — customer database
- `Job` — work order, statuses: LEAD → SCHEDULED → IN_PROGRESS → COMPLETE → INVOICED → PAID
- `Quote` / `QuoteLineItem` — estimates with customer acceptance via `publicToken`
- `Invoice` / `InvoiceLineItem` — with `publicToken` for pay-by-link
- `Payment` — payment records with surcharge support
- `ServicePlan` — recurring jobs
- `BookingRequest` — from the /book widget
- `ReviewRequest` — post-payment review requests

## Lead pipeline (Leads board)

`/app/leads` is a kanban over contacts: `Contact.pipelineStageId` set = a card.
Stages are per-company (`PipelineStage`, seeded on first visit, customizable at
`/app/settings/pipeline`). All lifecycle rules live in `lib/pipeline.ts`:

- LEAD contacts always sit on the board (`ensureStages` sweeps strays).
- Stage `autoAdvanceOn` triggers (request created / you call or text them /
  you call and they don't pick up / appointment scheduled / quote sent) move
  cards FORWARD only — hooks live in the request/appointment/quote/booking
  routes, `lib/voice.ts` (`pipelineTriggerForCall`: a bridged or completed
  call in either direction = CONTACT_MADE, an OUTBOUND call ending NO_ANSWER =
  CALL_NO_ANSWER; inbound missed/voicemail say nothing) and the Messages POST
  route (a team text = CONTACT_MADE). The default "Contacted" column claims
  CONTACT_MADE (`scripts/backfill-contacted-trigger.mjs` gave it to existing
  boards whose Contacted column had no automation); a "No answer" column is
  opt-in and belongs BEFORE Contacted.
- Winning (quote approval, first job/invoice/quote-conversion via
  `recordLeadWin`, the Won zone, or dragging into Converted) moves the card
  to the built-in Converted section (`PipelineStage.isConverted`, pinned
  last, undeletable, hideable via `Company.hideConvertedLeads`), stamps
  `wonAt`, makes them ACTIVE.
- ACTIVE clients re-enter on a new request as repeat business (Repeat badge);
  losing them just leaves the board. Lost LEADs archive with `lostReason`.
- **Exception — the client hub never puts anyone on the board.** "Request more
  work" (`/api/hub/requests`) creates the Request and notifies the team, and
  that's all: an existing client asking for more work is repeat business, not a
  lead to re-sell. Only cold intake (web forms, the lead webhook, manual
  creates) calls `enterPipeline`/`autoAdvance`.
- Deleting a spam request also deletes its lead when that request was the
  lead's only footprint (see requests/[id] DELETE).
- External intake: `POST /api/public/leads/[Company.leadWebhookToken]` —
  generic JSON webhook for Zapier/Make/ad connectors (Meta, Google lead
  forms). Managed in Settings → Lead Pipeline.

## Authentication

NextAuth v4 with Credentials provider. JWT sessions.
- Login URL: `/app/login`
- After login: all routes require `session.user.companyId` (except SUPERADMIN)
- No company → redirected to `/app/register`
- Middleware in `middleware.ts` protects `/app/*` and `/superadmin/*`

**Ways in (all four end in `lib/signup.ts` `createCompanySignup`):**

| Door | Form | Notes |
| --- | --- | --- |
| `/apply` | `components/ApplyForm.tsx` | Marketing site. Full application. |
| `/app/get-started` | same form, `appearance="app"` | In-app door. **The mobile shell only keeps `/app/*` in the webview**, so every signup link shown inside the app must point here — `/apply` gets ejected to the system browser. |
| `/invite` | `components/InviteSignupForm.tsx` | Unlisted, code-only, noindex. |
| `/app/register` | own page | Invite-only; also "New company" for a signed-in account. |

An **invite code** (a minted `WB-XXXX-XXXX`, or the shared tester code
`UNIVERSAL_INVITE_CODE` — default `Workbench123`) IS the approval: no human
review (`accessPendingAt` null) and no Finix underwriting
(`paymentsWaived`), landing on the dashboard instead of `/app/activate`.
Every door takes one, and an owner already stuck at the gate can redeem one
there (`POST /api/app/activate/invite`). What a code does NOT grant is
taking money online — `onlinePaymentsHeld` keeps that off until Finix
approves them (`lib/payments-gate.ts`).

## Offline mode (phase 1 — read-only snapshot)

Field techs can view previously loaded pages without a connection; writes are
still online-only. Four pieces:

- **`public/sw.js`** — the one service worker (also owns web push). `/app/*`
  navigations are network-first with cached fallback → `public/offline.html`;
  `_next/static` + Google Fonts cache-first; same-origin images (job photos,
  avatars, logos) stale-while-revalidate. Any navigation landing on
  `/app/login` wipes the snapshot (sign-out / session expiry / user switch).
  Bump `VERSION` in sw.js to invalidate all caches on deploy.
- **`components/OfflineSupport.tsx`** — mounted in the platform layout
  (signed-in branch). Registers the SW (production only), shows the
  offline/back-online pills, forces full-page navigations while offline
  (client-side RSC fetches die without network), and warms the cache via
  `/api/app/offline`.
- **`/api/app/offline`** — role-scoped warm list: core pages + today's/
  tomorrow's + recently active job detail pages.
- **`components/ForegroundRefresh.tsx`** (platform layout, signed-in) —
  `router.refresh()` when the app returns to the foreground after ≥15s away
  (and on Safari bfcache restores), so a phone that sat in a pocket doesn't
  keep showing pre-refund/pre-payment data. Skips while offline.
- **iOS shell**: service workers in WKWebView require App-Bound Domains —
  `WKAppBoundDomains` in `ios/App/App/Info.plist` +
  `ios.limitsNavigationsToAppBoundDomains` in `capacitor.config.ts`. Changing
  the domain means updating both and shipping a new store build. Android
  WebView needs nothing special.

## Time tracking (clock-in/out + timesheets)

Techs clock in/out on a job from the job page (`ClockCard.tsx`); each punch
optionally captures a one-shot GPS stamp (never continuous tracking, only
while clocking). Data model: `TimeEntry` (open entry = `endedAt` null; one
open entry per user, auto-closed on the next clock-in). Engine bits:

- **`lib/time-entries.ts`** — duration/GPS helpers shared by UI + API.
- **`POST /api/app/jobs/[id]/clock`** — `{action: "in"|"out", clientKey,
  occurredAt, lat/lng/accuracy}`; idempotent on `clientKey` (safe for the
  future offline outbox), drops "Clocked in/out" JobNotes.
- **`/api/app/time-entries[/id]`** — manager-only manual add / edit / delete
  (fix forgotten clock-outs); edits stamped with `editedById`.
- **`/app/timesheets`** — weekly view (Sun–Sat, company TZ), techs see their
  own, managers see everyone + edit; `?week=YYYY-MM-DD`.
- **Dashboard "On the clock" card** (owners/admins) — live open entries with
  map-pin links to the clock-in stamp.
- **Labor costing**: `User.hourlyCost` (set on the Team page, $/hr input) ×
  logged time appears as a Labor line on the job Profit margin card.
- **Team map** (`/app/team-map`, owners/admins): Leaflet + OSM map of everyone
  currently clocked in. `TeamLocationReporter` (platform layout) posts a
  position every ~3 min while clocked in AND foregrounded — it checks
  `GET /api/app/location` (am I on the clock?) BEFORE reading geolocation, and
  the server drops pings with no open TimeEntry (`LocationPing` model), so
  location is structurally never collected off the clock. 30-day retention
  prune rides the daily cron. iOS shell needs
  `NSLocationWhenInUseUsageDescription` (already in Info.plist) — ships with
  the next store build.

## Portal messaging (client ↔ company thread)

Two-way chat per contact (`PortalMessage`, INBOUND = from client, `via`
portal|sms), distinct from `ClientMessage` (one-off tracked emails). Client
side: hub Messages tab (`/hub/[token]/messages`, unread badge in HubNav,
polls while open) posting via `/api/hub/messages`. Team side: `/app/messages`
inbox (one row per conversation, unread counts, sidebar badge via
nav-counts) + `/app/messages/thread/[contactId]`, replies via
`/api/app/messages/[contactId]`. Notification fan-out lives in
`lib/portal-messages.ts`: client message → team push + company email
(first-unread-only throttle); team reply → client web push
(`ContactPushSubscription` + `notifyContact` in lib/push.ts, subscribe at
`/api/hub/push`) + SMS mirror when Telnyx is live + email fallback. Inbound
conversational texts land in the thread through the Telnyx webhook (contact
matched by phone digits; multi-match prefers latest thread activity).

**Hub PWA:** per-company manifest at `/hub/[token]/manifest.webmanifest`
(company name + brand color, scope /hub/[token], generic icons until a
server-side logo resizer exists); `components/HubPwa.tsx` registers /sw.js
on hub pages; the messages page carries the notifications/install nudge
(iOS needs Add to Home Screen first). sw.js honors `payload.icon` and
routes notification clicks to the matching surface (/app vs /hub/<token>).

## Business line (per-tenant phone number: texting + calls)

Design + the why: `docs/plans/business-line-2026-09-15.md` (texting, number
rights) and `docs/plans/business-line-voice-2026-09-18.md` (voice tiers;
`docs/plans/README.md` indexes every plan). Built 2026-09-18.
Carriers register A2P texting per business (two-party opt-in), so the old
shared WorkBench toll-free sender could never clear — Telnyx rejected it
2026-09-14. Each company now buys its own local number and registers its own
10DLC brand + campaign. **Voice needs no registry**, so calls work the minute
the number provisions; texting waits for the campaign (3–7 business days). The
free `sms:`/`tel:` deep links (`lib/messaging.ts`) stay free and untouched.

- **Data**: `Company.lineNumber` (E.164, `@unique` — a `pending:<companyId>`
  claim token sits there while an order is in flight, so a double-click can't
  buy two numbers), `lineNumberId` (Telnyx id), `lineForwardTo`,
  `lineProvisionedAt`; `MessagingRegistration` (one per company: the filed
  business details, brand/campaign ids, Telnyx statuses, `status`
  BRAND_PENDING → CAMPAIGN_PENDING → ACTIVE | REJECTED + `rejectionReason`).
- **`lib/telnyx.ts`** — REST client: number search/order/release, per-number
  voice (call forwarding) + messaging-profile settings, 10DLC brand /
  campaignBuilder / phone_number_campaigns / sole-prop OTP. Errors surface
  Telnyx's own `detail` (a TCR rejection is only useful verbatim).
- **`lib/business-line.ts`** — `provisionLine` (gated on `hasAddon`; searches
  the area code, orders onto the WorkBench messaging profile, forwards
  calls), `setLineForwarding`, `submitRegistration` (creates the brand; an
  EIN brand usually verifies on the spot, so the campaign is created and the
  number bound in the same call), `refreshRegistration` (re-reads Telnyx and
  advances — run by the hourly cron step `lineRegistrations`, the card's
  "Check now", and `POST /api/public/webhooks/telnyx/10dlc`, whose payload is
  never trusted: it only names a brand/campaign we then re-read),
  `releaseLine` (superadmin `line-release`). `deriveRegistration` is the
  pure state machine — `npx tsx scripts/test-business-line.ts`.
- **Send path** (`lib/sms.ts`): `sendSms` sends `from` the company's line and
  refuses without one, without an ACTIVE registration, or without
  `smsAcknowledgedAt`. Templates name the business, never "WorkBench".
  `TELNYX_ALLOW_UNREGISTERED=1` (staging) lets an unregistered line send to
  the account's verified test numbers.
- **Inbound** (`/api/public/webhooks/telnyx`): the `to` number resolves the
  company FIRST, the contact match is scoped to it, and an unknown texter
  becomes a contact ("Unknown caller · (214) 555-0100") so nothing is lost.
- **UI**: Settings → Phone & texting `BusinessLineCard.tsx` (get a number →
  forwarding → registration form → status chip / rejection + resubmit / OTP
  entry for sole props); routes `/api/app/line` (GET, PATCH forwardTo),
  `/line/provision`, `/line/register`, `/line/refresh`, `/line/otp`.
  Superadmin company page: `LineControl.tsx` (raw Telnyx statuses + Release).
- **Toll-free numbers** (`Company.lineType = "toll_free"`, chosen at Get a
  number, or inferred from the 8xx prefix): no 10DLC at all. One toll-free
  verification request (`MessagingRegistration.kind = "TOLL_FREE"`,
  `verificationId`/`verificationStatus`) filed via `createTollFreeVerification`
  in `lib/telnyx.ts`; free, 1–2 weeks; needs a website + EIN and public
  opt-in evidence (the business's live form URL + its `/book/<slug>/sms-terms`, both cited in the
  request). `deriveTollFree` maps Verified → ACTIVE,
  Rejected / Waiting For Customer → REJECTED with the reviewer’s reason
  (from `status_history`); resubmitting a Waiting-For-Customer request
  PATCHes it, a Rejected one files fresh, a Verified one is adopted. Status
  webhook: `/api/public/webhooks/telnyx/tollfree` (trigger only). Default
  for tenants stays local — home-service customers answer local numbers and
  toll-free inbound bills per minute.
- **Attach an existing number**: superadmin **line-attach** (`LineControl`)
  hands a company a number the Telnyx account already owns (Streamflaire’s
  own +1 833-495-0229, ported numbers) instead of buying one.
- **Entitlement**: Workbench Plus (`hasAddon`). Comp a company with the
  superadmin **addon-grant** action — never ship the gate open.
- **The number is theirs** (`Company.lineReleaseAt`, cron step `lineReleases`,
  `runLineReleaseSweep` / `lineReleasePlan`): when the add-on lapses the sweep
  stamps a release date 30 days out and pushes the owner; the Settings card
  shows a resubscribe / “ask us to port it” notice; the number is released
  only once the date passes with no add-on; resubscribing clears it.
  Superadmin **line-keep** calls a release off. Port-outs themselves are a
  Telnyx support process (not API) — /terms §8 promises cooperation.
- **Voice** (`lib/voice.ts`, Telnyx Call Control; env `TELNYX_VOICE_APP_ID`
  from `scripts/telnyx-voice-setup.ts`, one app per environment): numbers on
  the app are answered by us instead of number-level forwarding. Inbound: answer
  → ringback (`public/ringback.wav`) → dial the owner's cell FROM the business
  number → `gather_using_speak` whisper ("… call from Maria Lopez. Press 1 to
  accept") → bridge; no 1 → TTS greeting (`Company.lineVoicemailGreeting` or
  the default) → `record_start` → `call.recording.saved` keeps the recording
  id + pushes OWNER/ADMIN. Outbound (`startOutboundCall`, `POST
  /api/app/line/call`, "Call from line" on the contact page): ring the user's
  cell (`User.phone`, else the ring-through number) → "Press 1 to call …" →
  dial the customer → bridge. `Call` rows: `telnyxCallId` = customer leg,
  `agentCallId` = cell leg, status RINGING → IN_PROGRESS → COMPLETED |
  MISSED | VOICEMAIL | NO_ANSWER | FAILED (`statusAfterCustomerHangup` is the
  pure table; our side hanging up on / cancelling an outbound call whose
  customer leg was already dialed is NO_ANSWER too — `unansweredOutboundStatus`;
  `npx tsx scripts/test-voice.ts`). Webhook
  `/api/public/webhooks/telnyx/voice` is acted on directly (the call is live),
  so its Ed25519 check (`lib/telnyx-webhook.ts`, shared with the SMS route)
  is mandatory. Dials and the voicemail transition are guarded with
  conditional `updateMany` — Telnyx retries and reorders webhooks. `/app/calls`
  (nav next to Messages) lists calls and plays voicemails through
  `/api/app/calls/[id]/voicemail` (302 to a fresh Telnyx URL; recordings stay
  at Telnyx). Cron step `staleCalls` closes rows whose hangup never arrived.
  Migration: `Company.lineVoiceAppAt`; `routeNumberToVoiceApp` on
  provision/attach, `ensureVoiceRouting` when the tenant saves the
  ring-through number or superadmin runs **line-voice-sync**. Unset env var =
  plain forwarding, exactly as before.
- **Caller ID name** (`Company.lineCallerIdName`, `setCnamListing` in
  `lib/telnyx.ts`): a CNAM listing on the number — ≤15 uppercase
  alphanumerics/spaces (`defaultCallerIdName`), applied from the company name
  at provision/attach (best effort — Telnyx may decline, e.g. toll-free) and
  editable in the Settings card (`PATCH /api/app/line { callerIdName }`).
  Carriers look it up on their side: days to propagate, mobiles uneven.
- **Softphone — calls in the browser** (tier 2, `lib/softphone.ts` +
  `components/Softphone.tsx` + `lib/softphone-client.ts`; built 2026-09-21):
  every call STILL runs through Call Control — a signed-in browser is just one
  more destination we dial, as `sip:<User.sipUsername>@sip.telnyx.com`. One
  credential connection per company (`Company.lineSipConnectionId`, created on
  first use, deliberately **no outbound voice profile** so a browser can never
  originate a call → no 911 → no E911 address) and one telephony credential per
  user; `GET /api/app/line/softphone` mints the login JWT per page load (or
  `{ off }`). Presence = heartbeat every 30 s → `User.softphoneSeenAt`
  (`POST …/softphone/presence`), online within 100 s. Inbound: `ringPlan`
  (pure) rings every online browser first (`CallLeg` rows, `Call.appRingAt`
  fan-out lock, 15 s), first answer claims `agentCallId` + `answeredByUserId` +
  `via: "app"`, the rest are hung up; the cell rings only after the last
  browser leg ends (`dialCell`). Outbound `via: "app"` dials the caller's own
  browser (`X-WB-Call-Id` header, tab auto-answers, no whisper) then the
  customer (`dialCustomer`). `findCallByLeg` adopts a SIP leg from its
  `client_state` when its webhook beats our insert. UI: the fixed call card
  (`Softphone.tsx`, mounted in the platform layout when the line is routed),
  "Call in app" on contacts, the `/app/calls` dialer (`DialFromApp.tsx`), My
  Profile → Calls in the app (`User.softphoneEnabled`). The iPhone app runs
  a NATIVE engine instead (tier 3, 2026-09-23: `ios/App/App/VoipPlugin.swift`
  = PushKit + CallKit + the Telnyx iOS SDK; the page only mirrors it through
  `components/SoftphoneNativeEngine.ts`), because iOS freezes a background
  web page; the Android shell still stays a cell. The phone has its OWN
  credential (`User.sipUsernameIos`, `?device=ios`, `CallLeg.device`) — a
  shared one had the phone's login bumping the desktop off the line. Two
  Telnyx rules that cost a live test: the credential connection needs
  `sip_uri_calling_preference: "internal"` (else SIP 403 on every browser
  dial; `ensureSipUriCalling` heals old ones) and `from_display_name` is
  `A-Za-z0-9 -_~!.+` only (`sipDisplayName`; "(469) …" is a 422). One tab per
  browser (Web Locks); mic requested before the server dials the tab.
  **Microphone (2026-09-23, after a day of one-way audio — they heard
  nothing, the legs bridged fine, rows said COMPLETED):** the server cannot
  see a capture-side failure, so the browser watches itself.
  `lib/softphone-mic.ts` is the pure watchdog (`MicWatchdog.next(sample)` →
  dead / silent / ok / unknown from the local track's `muted`/`readyState`,
  the outbound-rtp `packetsSent` counter and an AnalyserNode peak; nothing is
  judged while muted, held, or an outbound call is still ringing;
  `scripts/test-softphone-mic.ts`). `Softphone.tsx` runs it once a second on a
  live call (`micWatchStart`), feeds `MicMeter` ten times a second through
  the separate level store (`useMicLevel`, so dialers don't re-render), and
  puts the verdict in `micWarning`. The input is a choice: `MicPicker`
  (`micDevices` from `enumerateDevices`, `devicechange` refreshes, an
  unplugged choice falls back) → `localStorage wb-softphone-mic` → our own
  getUserMedia constraint, and `call.setAudioInDevice` on the live one.
  Before every answer the mic is opened for real (`stageMic`: names the
  device, flags an OS-muted track) and the stream is KEPT and handed to the
  SDK as `call.options.localStream` (`answerWith`) — the first cut released
  it and let the SDK reopen the device a second later, and that reopen
  failed on David's PC: every outbound leg died two seconds in
  (normal_clearing, customer never dialed). The SDK's `setAudioSettings` is
  not used. Call screen: after a hangup in this tab the row is shown as
  "Call ended" until its webhook lands (it used to say "Ringing your cell
  first…" with an amber pulse); outbound `via: "app"` rows read "Calling
  from the app…". UI: `components/MicControls.tsx` — `MicRow` (meter +
  device + picker) and `MicWarning` on the call card and the call screen,
  `MicCheck` (picker + 4 s "Test it") on the Calls page LineCard. Console
  trail: `[softphone] microphone:` / `mic track:` / `mic <verdict>`.
  Diagnose from a laptop with `scripts/diag-with-public-db.mjs` /
  `scripts/diag-telnyx-events.mjs` (see the plan doc). `/app/calls` =
  `LineCard.tsx` (number, where it rings now, the keypad, stat strip) + day-grouped
  `CallRow.tsx` with `VoicemailPlayer.tsx` (custom controls — never the
  native `<audio controls>`, its ⋮ menu is browser chrome) and Call back
  (`CallFromLineButton` with `to`); filters `?f=missed|voicemail|out`.
- **Call screen + keypad** (2026-09-22): `/app/calls/[id]` is one call and
  the person on it — `CallScreenLive.tsx` (the phone when the softphone in
  this tab is on that call: timer, mute, hold, touch-tones via
  `softphone.sendDigits` → SDK `call.dtmf`, hang up; otherwise the row's
  status, polled while live) + `CallActions.tsx` (unknown number → Save as a
  lead / client with the number prefilled, or pick an existing client;
  lead → Make a client = `PATCH stage { action: "won" }` (the route also
  answers POST — a caller that forgot the method got a bare 405 the form
  showed as "Something went wrong"); then Quote /
  Appointment / Job / Invoice links with `?contactId=`). The floating call
  card links to it (and hides itself while on it); every row's name opens
  it; the keypad navigates to it when a call is placed. `DialPad.tsx` is the
  keypad (dial mode on the Calls page — inline on desktop, a Modal on
  phones, softphone when registered else the cell flow; tones mode on the
  call screen; DTMF beeps, hold 0 for +, `GET /api/app/contacts/lookup?phone=`
  names the number as it's typed). Live log: `CallsLive.tsx` polls
  `GET /api/app/calls/pulse` (max updatedAt + count) and `router.refresh()`es
  on change or on softphone call transitions — no reload needed. Names on
  old rows: `linkCallsToContact` (contacts POST/PATCH) + `resolveCallContacts`
  (the page self-heals unmatched rows by `customerDigits`) +
  `PATCH /api/app/calls/[id] { contactId }` (explicit link from the call
  screen). Lead/client is a quiet word after the name, never a badge. What
  got done on the call = `lib/call-events.ts`: quotes/appointments/jobs/
  invoices/contact saves for the same person stamped between 2 min before
  the call and 30 min after it ended attach to the latest such call
  (`assignCallEvents` is pure; `npx tsx scripts/test-call-events.ts`);
  nothing is written to the Call row.
- **Call notes + Atlas notes** (2026-09-24, `lib/call-notes.ts`,
  `app/platform/calls/[id]/CallNotes.tsx`): every Call row carries `notes`
  (typed on the call screen, autosaved via `PATCH /api/app/calls/[id]
  { notes }`). "Let Atlas take notes" → `POST /api/app/calls/[id]/notes
  { action: "start" }` → `startAtlasNotes` (lib/voice.ts): on a RINGING
  call the row is **armed** and `bridgeLegs` starts transcription at the
  bridge (whole conversation on record); on a connected call it starts now.
  `beginTranscription` = Telnyx `transcription_start` on the CUSTOMER leg,
  documented shape (`transcription_engine: "Telnyx"` +
  `transcription_engine_config { transcription_engine, language: "en",
  transcription_model: "openai/whisper-large-v3-turbo" }`, `transcription_tracks:
  "both"`: inbound = them, outbound = you). Each `call.transcription`
  segment (anything not `is_final: false` — Whisper sends finals without
  the flag; every event is logged `[voice] transcription …`) appends one
  "Them: … / You: …" line to `Call.transcript` (`appendTranscript`, capped).
  When the customer leg hangs up (or Stop, or the stale sweep)
  `finishAtlasNotes` decides: a saved contact → `summarizeCallNotes` claims
  listening → summarizing and writes `atlasNotes` through `meteredOneShot`
  (kind "call-notes" — Atlas tokens, same gate as the drawer; locked/off
  accounts can't start); **no contact → `awaiting_contact`**: the
  transcript is held, the card prompts "save them as a lead or client",
  and `advanceLeadForLinkedCalls` summarizes once they are (Discard
  drops it — tokens are never spent on a stranger). States: null | armed |
  listening | awaiting_contact | summarizing | done | failed (+
  `atlasNotesError`). The card polls `GET …/notes` while the call is live
  or Atlas is working; "every call from this browser" (localStorage
  `wb-atlas-notes-every-call`) arms it on its own. The UI carries the
  consent hint (some states require telling the other party).
  Tests: `scripts/test-call-notes.ts`.
- **Two timing bugs fixed 2026-09-24**: `CUSTOMER_RING_SECS` was 30, which is
  exactly when carrier voicemail answers — the customer leg timed out as the
  greeting began ("No answer" in the headset, no way to leave a message);
  now 60. And `runStaleCallSweep` treated IN_PROGRESS rows like RINGING ones
  (5 min) and hung up their legs at Telnyx, so the hourly cron dropped any
  real call older than five minutes at the top of the hour — IN_PROGRESS now
  waits `STALE_IN_PROGRESS_MS` (4 h + 5 min, past Telnyx's own leg cap) and
  the sweep never sends hangups for a bridged row. The browser path also no
  longer hears the "No answer." TTS (its card says it); the cell path keeps it.
- **A linked call moves the lead** (`advanceLeadForLinkedCalls`): the
  bridge/hangup hooks ran while the row had no contact, so a lead saved from
  the call screen after hanging up stayed in "New". `linkCallsToContact`
  (contacts POST / phone edit) fires the trigger for the latest call of the
  last 24 h; the explicit `PATCH /api/app/calls/[id] { contactId }` fires it
  for that call. Board columns still decide where the card goes.
- **Keypad** (`lib/dial-format.ts`, `scripts/test-dial-format.ts`):
  `normalizeDialed` turns any pasted US dressing ("+1 (469) …", "tel:…")
  into ten digits and `dialDisplaySize` steps the font down so a full number
  fits the 236 px desktop column (it used to run past the field's edges).
  When the softphone is down for a fixable reason (`softphoneRecoverable`:
  status connecting/error) the keypad and `CallFromLineButton` say so, call
  `softphone.reconnect()` (fresh grant now, not after the backoff) and wait
  up to 8 s (`waitForSoftphone`) before falling back to the cell flow — and
  the fallback is announced under the number, never silent
  (`softphoneFallbackNote`). When another tab of the same browser holds the
  Web Lock (`other_tab`), "Ring here instead" / the Call button ask it to
  hand over on the `wb-softphone` BroadcastChannel (`softphone.takeOver()`):
  the holder disconnects, releases the lock and queues behind — unless it
  is on a call, in which case it answers "busy" and the dialer refuses
  rather than ringing the cell. Every status change logs
  `[softphone] status …`, and a cell fallback logs why.
- **Caller ID name on cells**: CNAM only reaches landlines; the Settings card
  now points at freecallerregistry.com (Hiya + First Orion + TNS, the
  analytics behind AT&T/T-Mobile/Verizon) — free, and the only lever there is.
- **Not built yet**: Android tier 3 (native ringing with the app closed;
  iOS shipped 2026-09-23), voicemail transcription, missed-call text-back,
  business-hours routing, port-in, call transfer.

**Out of funds (2026-09-22).** Telnyx refuses every mutation — number purchase,
brand/campaign filing, placing a call, even the free SIP credential — once the
platform's prepaid balance is gone. `isInsufficientFunds` (lib/telnyx.ts) spots
it. Tenants get a calm "paused on our side" message (never Telnyx's billing
text), the operator is emailed by `alertTelnyxFunds` (lib/ops-alert.ts; deduped
6 h through the rate-limit store; recipient PLATFORM_ALERT_EMAIL →
RECONCILE_ALERT_EMAIL → oldest superadmin), and a texting registration is
parked as `QUEUED` with the form stored — the hourly sweep and Check now re-file
it, and a real rejection on re-file becomes REJECTED with the reason. Planned
follow-up for launch: `docs/plans/telnyx-balance-watch-2026-09-22.md`.

**No unplanned carrier fees (2026-09-22, relaxed 2026-09-23).** TCR charges per
submission ($4.50 brand, $15 campaign review + $4.50 first quarter), so nothing
is ever re-filed by itself. `needsOperatorReview`: a submit over an
AWAITING_REVIEW row, over a REJECTED row that already has a campaign (the
platform's template is what failed), and every first submit when
`LINE_REGISTRATION_REVIEW=1`, is stored as `AWAITING_REVIEW` — nothing sent to
Telnyx — and the operator gets an email with the form, the previous reason and
the fees. A **brand-stage** rejection (email, EIN, legal name, address — the
tenant's own details) re-files straight away: the failed brand is edited in
place for free, and the campaign fee only fires once the brand verifies, which
was going to happen anyway (worst case: Telnyx refuses the edit and a fresh
brand costs $4.50). Every status change the sweep/webhook sees notifies the
owners (push + `lineRegistrationEmail`: approved / needs a fix with the reason /
sent back on our side) and the operator (`brand-rejected:<companyId>`,
`campaign-rejected:<companyId>`), so nobody learns of a rejection by opening
Settings. The pre-flight also refuses group mailboxes (`isGroupMailbox`:
contact@, info@…) under TCR's "personal, free and group email IDs" rule, and
the form shows `REGISTRATION_CHECKLIST` (also published at
`/texting-registration`) before anything is typed. Superadmin "Approve and file"
(`line-file` → `approveRegistration`) is the one click that spends money; it
re-uses a VERIFIED brand (same entity/legal name/EIN) and files only the
campaign. A campaign-stage rejection emails the operator and shows the tenant
"we're sorting it out" with no resubmit button, because the campaign copy is
the shared template (`campaignCopy`), not their form. **Fixing a campaign
rejection (2026-09-24):** Telnyx failed the Lessly Holdings campaign
(TELNYX_FAILED) because the message flow described the booking form without
linking it. The flow now carries the company's real form URL
(`optInFormUrl`: `/book/<slug>/<first listed item with a phone field>`), the
screenshot (`public/sms-opt-in.png`, rendered by
`scripts/sms-opt-in-shot.mjs` from `smsConsentLabel` — re-run it whenever the
label changes) and the checkbox wording verbatim, which follows Telnyx's
opt-in template (use case, sender, frequency, rates, STOP/HELP, no
third-party sharing; `/privacy` states the same). The way back from
TELNYX_FAILED / MNO_REJECTED is superadmin **Appeal with current copy**
(`line-appeal` → `appealCampaignRegistration`: `PUT /10dlc/campaign/{id}`
with the new flow + samples, then `POST …/appeal`), which Telnyx compliance
re-reviews by hand for free — never Re-file first, that is a new campaign
and a new $15. The PUT alone re-queues a failed campaign (the appeal after
it came back "Only campaigns in TELNYX_FAILED or MNO_REJECTED state can be
appealed"), so the action re-reads the campaign, appeals only if it is still
failed, and stores whatever status Telnyx reports; `refreshRegistration`
also re-reads campaign-stage rejections (portal edits re-queue silently). Because a new company has no booking items until it makes
one, `submitRegistration` and `approveRegistration` pre-flight the form
(`requireOptInForm` → `findOptInForm().ready`): no listed item with the
phone field on = refused with `OPT_IN_FORM_MESSAGE`, and the checklist
(`REGISTRATION_CHECKLIST`, `/texting-registration`) says so up front.
**Second TELNYX_FAILED (2026-09-24, same day — the reviewer first submitted the
live booking form as "Jim Smith")** named five things, all now enforced in
code. (1) *Brand name ≠ the form*: the brand was "David Lessly", the page and
checkbox said "Lessly Holdings". The brand name is now ALWAYS `Company.name`
(`pinIdentity`, read-only "Brand name" on the form); a re-file over a
verified brand PUTs the brand first (`brandInputOf` → `updateBrand`).
(2) *Website with address, phone, email, About, services*: every hosted
booking page carries `app/book/[slug]/BusinessFooter.tsx`
(`lib/business-profile.ts`: `loadBusinessProfile`, `aboutLine`,
`profileGaps`), and `/book/<slug>` is filed as the brand's website when the
tenant has none. Registration refuses while `profileGaps` finds a missing
phone/email/address/service (`profileGapMessage`). (3) *Privacy policy must
be the brand's*: `/book/<slug>/privacy` and `/book/<slug>/sms-terms`
(`LegalPage.tsx`, Telnyx's required no-sharing sentences) are what the
campaign, the consent checkboxes and the HELP reply link; the checkbox no
longer says "via WorkBench". `privacy`/`sms-terms` are reserved item slugs.
(4) *Quotes = marketing*: quote links are no longer texted (email only),
and no copy mentions quotes/estimates. (5) *STOP/START/HELP replies per
support.telnyx.com/en/articles/10645338*: `campaignCopy(identity)` files
brand-named replies, and `ensureKeywordProfile` gives the line its own
messaging profile (`Company.lineMessagingProfileId`, custom
`autoresp_configs`) so the number actually sends them — replies live on the
PROFILE, and the shared `TELNYX_MESSAGING_PROFILE_ID` can only answer
generically. `sendSms` sends through the line's profile. Superadmin
**line-keywords** re-runs it. No screenshot any more (the reviewer opens the
live form). **`campaignLint` runs before every campaign filing** and in
`scripts/test-business-line.ts`: marketing words, brand-first samples with
STOP, keyword-reply templates and the 255-char limit, the flow linking form +
the business's own privacy/terms, no screenshots. Change the copy → the test
tells you what a reviewer would say. An appeal can only change flow, samples
and HELP text: `appealCampaignRegistration` refuses when
`immutableCampaignDrift` finds a changed description, opt-in/out reply or
privacy/terms link — that is a **Re-file** (new campaign; the failed one is
retired with `deactivateCampaign`). The EIN is typed twice
and checked against the IRS prefix list (`einIssue`, lib/business-line-shared.ts,
form + server) so a typo never reaches the registry. Same idea for the rest
of the form (2026-09-22): the street address comes from Mapbox autocomplete
(`GET /api/app/line/address-suggest` → `suggestAddresses`, USPS-form, metered
like every geocode), the legal name warns when it lacks an entity suffix and
the form needs an "exactly as on my IRS letter" tick, the contact email flags
gmial.com-style typos, and the website is loaded server-side at submit
(`lib/website-check.ts`: public hosts only, redirects re-checked, must answer
2xx and mention the business) — a bad site is refused with the reason instead
of being filed. A registered business's contact email can't be a free/personal
domain (`isFreeMailDomain`; TCR: "Personal, free and group email IDs are not
supported"). Telnyx's `failureReasons` is a string OR a list of
`{ fields, description }` — always read it through `failureText()`. A brand
whose registration failed is edited in place on re-file (`updateBrand`, PUT)
and only replaced if Telnyx refuses the edit or it stays REGISTRATION_FAILED.

**Calls list (2026-09-22):** rows show the time on the line (talk time, or
ring time when nobody picked up) instead of "Answered" / "No answer" — a
carrier's voicemail answering is an "answer" to the network, so the verdict
was misleading. Missed and Voicemail keep their words. Inbound callers hear
`ringback.wav` while the browsers and the cell ring (music there sounds like a
pickup — the line answers the caller's leg at once so it can ring the app,
whisper and take voicemail, so their phone shows "connected" from the first
second by design); the pause button in the browser plays `public/hold-music.mp3`
to the other party (`PATCH /api/app/line/call` → `setHoldMusic`), since the
SDK's hold alone leaves them in silence. Decline in the browser goes straight
to voicemail (`POST /api/app/line/call/decline` → `declineCall`, claimed before
the SIP leg drops); a browser that merely times out still hands the call to
the cell. The browser ringer unlocks
its AudioContext on the first gesture (autoplay policy) and falls back to an OS
Notification when audio is still locked. A known caller gets a Text button on the
row once the line's registration is ACTIVE (it opens the message thread, which
sends from the business number).

## Payment processor (Finix)

Two processors implement the `PaymentProcessor` seam in `lib/payments.ts`,
selected by `PAYMENT_PROCESSOR`: `manual` (records payments, moves no money)
and `finix` (real card/ACH charges — Streamflaire Payments). The Finix REST
client lives in `lib/finix.ts` (all amounts in CENTS at that boundary).

How the Finix flow hangs together:
- **Merchant onboarding:** Settings → Online Payments card → owner clicks
  "Set up payments" → `POST /api/app/settings/payments` creates a hosted Finix
  onboarding form (white-labeled KYC/underwriting) and returns a session link
  (links expire hourly — mint fresh ones, never store them). Form completion →
  merchant `PROVISIONING` → `APPROVED`; state lands on
  `Company.finixMerchantId`/`finixOnboardingState` via the settings GET
  (re-syncs on card mount) and the webhook.
- **Charging:** `/pay/[token]` mounts the finix.js tokenization form (CDN
  `js.finix.com/v/2/finix.js` — must never be self-hosted/bundled, PCI) when
  the platform processor is live AND the company is APPROVED; otherwise the
  old "contact the business" fallback. Token → `POST /api/public/pay/[token]`
  → buyer identity (reused via `Contact.finixBuyerIdentityId`) → payment
  instrument → transfer → `recordPayment()` with `processorRef` = transfer id.
  ACH transfers stay PENDING for days — recorded immediately, pulled back by
  the webhook if the bank later returns them.
- **Webhooks:** `POST /api/public/webhooks/finix` (register once per env with
  `scripts/finix-register-webhook.mjs`). Payloads are hints only — the handler
  re-fetches the resource from Finix before acting, so forged posts are inert.
  Not required for correctness: settings-load re-sync self-heals missed events.
- **Refunds:** ↺ button on invoice payment rows AND /app/payments rows
  (managers; buttons always visible on touch, hover-revealed at a desk) →
  RefundDialog (components/RefundDialog.tsx) → `POST
  /api/app/payments/[id]/refund` → Finix reversal. The Payment's `amount`
  drops in place (every balance/status computation keys off it), a `Refund`
  row records what moved (amount + reversalRef; original charge = amount +
  Σrefunds), fee estimates (feeCents/estCostCents) recompute from the
  remaining amount, and invoice status recomputes. A reversal that later
  FAILS at the processor is unwound by the webhook: amount restored, Refund
  row deleted, owners notified. Manual payments have nothing to reverse —
  edit/delete the record instead. (scripts/backfill-refunds.mjs backfilled
  Refund rows from the legacy "Refunded $X (id)" details notes.)
- **Fees:** our take (card 2.9% + 30¢, ACH 0.75%; `WORKBENCH_*_FEE_*` env
  overrides in `processingFees()`) is deducted at settlement by a Finix **fee
  profile** — configured in the Finix dashboard, NOT the API (`POST
  /fee_profiles` is certification-gated: "forbidden by Fee Profile Settings").
  Keep the dashboard profile and the env rates in sync; app-side numbers are
  estimates, settlements carry the real `total_fees`.
- **Payouts:** automatic — transfers become settleable ~1 business day after
  the charge (`ready_to_settle_at`), accrue into a settlement, and Finix
  approves + funds per the merchant's payout profile (daily/net/next-day ACH).
  Settlement approval is NOT platform-API-accessible (`PUT /settlements/{id}`
  only takes `action: STOP_ACCRUAL`). "Send to bank now" on /app/payments →
  `POST /api/app/payments/payout` just closes the accruing settlement early
  via `POST /identities/{id}/settlements` (body needs `currency` + `processor`).
- **Sandbox:** `FINIX_ENVIRONMENT=sandbox` uses processor `DUMMY_V1`, merchants
  auto-approve in ~2 min, raw card `POST /payment_instruments` is allowed, and
  the app's per-transaction cap is $10,000. Amount-triggered outcomes (cents):
  102 decline, 193 insufficient funds, 888888 dispute. `/terms` + `/pricing`
  are the ToS/fee URLs baked into onboarding forms — keep both published.

## Environment variables required

```
AUTH_SECRET=     # generate: openssl rand -base64 32
DATABASE_URL=    # PostgreSQL connection string from Railway
NEXTAUTH_URL=    # deployed URL (e.g. https://jobflow.streamflaremedia.com or https://streamflaremedia.com)
CRON_SECRET=     # shared secret for the recurring-billing cron (generate: openssl rand -base64 32)
PAYMENT_PROCESSOR=manual  # "finix" turns on real payments (needs the FINIX_* vars below)
# Finix (Streamflaire Payments) — keys from dashboard.finix.com → Developers → API Keys
FINIX_ENVIRONMENT=sandbox   # "live" + live keys at launch (sandbox keys only work on the sandbox host)
FINIX_API_USERNAME=
FINIX_API_PASSWORD=
FINIX_APPLICATION_ID=       # public (finix.js uses it client-side)
# Optional — QuickBooks Online sync (lib/quickbooks.ts); feature is hidden until set
QBO_CLIENT_ID=       # Intuit app keys from developer.intuit.com
QBO_CLIENT_SECRET=
QBO_ENVIRONMENT=sandbox  # "production" once Intuit grants production keys
# Optional — Google Calendar push (lib/google-calendar.ts); the "Google
# Calendar" half of My Profile → Calendar sync is hidden until both are set.
# Redirect URI to register: ${NEXTAUTH_URL}/api/app/integrations/google-calendar/callback
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
# Optional — per-company custom sending domains (lib/email-domains.ts). Needs a
# paid Resend plan (extra domains); Settings card + API stay hidden until set.
EMAIL_DOMAINS_ENABLED=   # "1" to enable
# Optional — the Workbench Plus premium add-on, sold through Livery
# (lib/addon.ts; webhook receiver at /api/public/webhooks/livery). Both must
# be set or the upsell page shows "not available yet". Visibility is
# per-company (Company.addonEnabled, superadmin console); entitlement is
# Company.addonActiveAt, managed by the Livery webhooks.
LIVERY_ADDON_CHECKOUT_URL=  # e.g. https://paywithlivery.com/l/workbench-plus
LIVERY_WEBHOOK_SECRET=      # whsec_… from Livery → Settings → Developers
# Telnyx — provider texting + business lines (lib/sms.ts, lib/business-line.ts).
# All three needed: without API key + profile every send is a no-op and the
# Business Line card is hidden; without the public key the inbound webhook
# fails closed (no replies land, no STOPs recorded).
TELNYX_API_KEY=
TELNYX_MESSAGING_PROFILE_ID=   # every purchased number joins this profile; its webhook URL = ${NEXTAUTH_URL}/api/public/webhooks/telnyx
TELNYX_PUBLIC_KEY=             # Mission Control → Account → Keys & Credentials → Public Key (webhook signatures)
TELNYX_10DLC_MOCK=             # "1" on staging: brands/campaigns register as mocks (no TCR fees)
PLATFORM_ALERT_EMAIL=          # optional: who gets platform alerts (Telnyx out of funds, …); falls back to RECONCILE_ALERT_EMAIL, then the oldest superadmin
LINE_REGISTRATION_REVIEW=      # "1": every FIRST texting registration also waits for superadmin approval (re-files always do)
TELNYX_ALLOW_UNREGISTERED=     # "1" on staging: a line may text before its campaign clears (verified numbers only)
TELNYX_VOICE_APP_ID=           # Call Control application id (scripts/telnyx-voice-setup.ts, one per environment); unset = plain call forwarding
```

## Job crew + titles (`lib/job-crew.ts`)

Two things every job-creating path used to leave to whoever was typing:

- **Crew.** `resolveCrew(db, companyId, requestedIds, { outsourced })` filters
  ids to the company's active members and, when nothing is left, lands the
  job on the **one member of a one-person company** (`soloMemberId`). Used by
  `POST /api/app/jobs`, `PATCH /api/app/jobs/[id]` (also heals an older
  unassigned job on any edit), `convertQuoteToJob`, and both subscription
  job generators. A **scheduled** job with nobody on it is refused
  (`400 { code: "NEEDS_CREW" }`, `NEEDS_CREW_ERROR`) by the create route and
  by a PATCH that schedules it or changes its crew — it would be on nobody's
  schedule, calendar sync, or booking availability. The schedule's drag/drop
  catches that code and opens the place sheet at the drop spot instead of
  erroring. The one legitimate empty crew is **`Job.outsourced`** (+ optional
  `outsourcedTo` name): a subcontractor is doing it. Toggle lives in the
  place sheet, New Job, and the job page's Team card; outsourced jobs stay
  off everyone's calendar sync. Multi-person companies see an
  **Unassigned** badge on scheduled crew-less jobs (`ScheduleJobDTO.needsCrew`).
  `scripts/backfill-solo-crew.mjs` (in `db:backfill`) assigned every
  pre-existing unassigned job in one-person companies to that person.
- **Title.** Optional everywhere (`deriveJobTitle`): typed title → the
  services on the job ("Mow", "Mow + Edge", "Mow + 2 more") → the request's
  title → `"Service visit"`. The place sheet shows price-book **service
  chips** (one tap names, prices, and times the job); New Job auto-names
  from the line items until a title is typed. Atlas `create_job` no longer
  requires one. Job *edit* still requires a title (a job always has one).
- Tests: `npx tsx scripts/test-job-crew.ts`.
- **Service chips** (`components/ServiceChips.tsx`, `lib/service-title.ts`
  `titleFromServices`): the shared tap-to-pick price-book row. Used by the
  place sheet, New Request (title optional once a service is picked), and
  New Series (one tap = name + visit length + price; name optional).

## Solo-operator defaults (one-person companies)

A one-person company should never have to remember a switch that only
matters with a team. Beyond crew auto-assign above:

- **Takes bookings**: `User.bookable` is off by default for added members,
  but signup (`lib/signup.ts`) creates the owner **bookable**, and switching
  a member ON from the Team page (`PATCH /api/app/team/[id]`) joins them to
  every existing booking item (items only snapshot the bookable members
  present at creation, so a later switch used to be bookable in name only —
  customers got a request form instead of open times). Remove them per item
  in the item editor. `scripts/backfill-solo-bookable.mjs` (in
  `db:backfill`) did this for pre-existing one-person companies.
- **Timezone**: signup and the apply form send the browser's zone
  (`lib/timezone.ts` `browserTimezone` / `isValidTimezone`) and
  `createCompanySignup` stores it — before this every company started on
  America/Chicago until someone found the setting. Pre-existing companies
  keep whatever they have; Settings → timezone still edits it.

## Calendar sync (ICS feed + Google Calendar push)

Design: `docs/plans/google-calendar-sync-2026-09-11.md`. Per USER, any role,
from My Profile → **Calendar sync** (`components/CalendarSyncCard.tsx`).
Both halves render the same events — `lib/calendar-events.ts`
`loadUserCalendarEvents`: jobs the user is assigned to (plus, for the one
member of a one-person company, scheduled jobs nobody was assigned to —
never outsourced ones; `jobCrewFilter` is shared with the reconcile
loader so the deleter can't undo the pusher), appointments assigned to
them, their personal + company-wide time blocks; pure mappers +
fingerprints in `lib/calendar-event-shape.ts`.

- **Subscribe link** (`lib/calendar-feed.ts`, `CalendarFeed` table): a
  32-byte token IS the credential. `GET /api/public/calendar/<token>.ics`
  (no auth, 60 d back / 365 d ahead, bare 404 on anything else);
  `/api/app/profile/calendar-feed` GET/POST (create or rotate)/DELETE.
  Multi-event ICS via `buildIcsCalendar` in `lib/ics.ts`.
- **Google push** (`lib/google-calendar.ts`, `GoogleCalendarConnection` +
  `GoogleCalendarEvent`): OAuth like QuickBooks (signed state, AES-GCM
  tokens off AUTH_SECRET), routes under `/api/app/integrations/google-calendar/`
  (connect / callback / status / sync / disconnect). Sync is a RECONCILE —
  `syncUserGoogleCalendar` diffs events vs link rows by fingerprint and
  inserts/patches/deletes only changes; missing links adopt prior events by
  the `workbench` private property so reconnects don't duplicate. Triggers:
  the Prisma `$use` middleware in `lib/db.ts` (any Job / JobAssignment /
  Appointment / TimeBlock write → `scheduleGoogleCalendarSync`, 4 s debounce
  per company, lazy import, no-op with no connections), the hourly cron step
  `googleCalendar`, and "Sync now". One way only. Disconnect deletes the
  pushed events, revokes, forgets the tokens.
- **Google → Workbench** (`lib/google-calendar-pull.ts`): the account's
  busy events become personal `TimeBlock` rows with `source: GOOGLE` +
  `externalId`, so booking availability / Find a Time / conflicts / the
  route engine respect them for free. Read-only here (time-block routes 409
  on them), never pushed back out, titles "Busy" unless
  `GoogleCalendarConnection.shareTitles`. Incremental via Google
  `syncToken`; polled every 5 min from `instrumentation.ts`, hourly cron
  step `googleCalendarPull`, and on connect / "Sync now".
  `PATCH /api/app/integrations/google-calendar/settings` takes
  `pullEnabled` / `shareTitles` (re-reads the window).
- Tests: `npx tsx scripts/test-calendar-sync.ts` (needs a placeholder
  DATABASE_URL), `npm run e2e -- calendar-feed`.

## Recurring subscriptions

**The user-facing model (2026-08-11 redesign) is TWO products** on the
/app/subscriptions page (nav label "Recurring"): a **Monthly plan** (flat
auto-charge: first invoice + charge at creation, then anchored to the day the
first payment SUCCEEDS — `Subscription.anchoredAt`, set once by
`anchorPlanFromFirstPayment` in lib/payments.ts, which re-points nextRunDate)
and **Per-job billing** (per-visit price; completed visits either bill on
completion or wait in the **Ready-to-bill queue** — pool = completed + no
direct invoice + no consolidatedInvoiceId — billed by `billAllReadyWork` via
POST /api/app/subscriptions/bill-ready, per-series "Bill now", or the legacy
monthly cursor). Queue mode = `billPerVisit + consolidateMonthly + nextRunDate
null` (the cron consolidation sweep requires a cursor, so it never touches
queue series). The dashboard "Needs you" list surfaces the queue total. The
machinery below (interval billing, billPerVisit, consolidateMonthly cursor,
autopay/retries) is unchanged plumbing under this two-product surface.

Services in the price book (Settings → Products & Services) can be marked recurring
(monthly / quarterly / every 6 months / annually). Selling a recurring service —
through a quote→job conversion, a direct invoice, or a web-form service request —
creates a `Subscription` on the client. The engine in `lib/subscriptions.ts` then
generates the next invoice (and optionally a job) each cycle. See the
Subscriptions page (`/app/subscriptions`) to pause/cancel or bill a cycle now.

**Per-visit billing (`Subscription.billPerVisit`).** The third billing shape,
alongside scheduled billing (`interval`) and visits-only (neither): completing
one of the series' visit jobs calls `billCompletedVisit` (lib/subscriptions.ts,
hooked into the job status route), which mints that visit's invoice
(unitPrice × quantity, sent/charged or drafted per `invoiceMode`), archives the
job (same convention as manually invoicing a completed job), and auto-charges
the card on file / emails the pay link. Idempotent via the one-invoice-per-job
unique constraint. `billPerVisit` and `interval` are mutually exclusive;
per-visit requires a visit series. Created from New Series ("Bill after each
visit") — price-book recurring services still only create interval billing.

**Monthly consolidation (`consolidateMonthly`, only with `billPerVisit`).**
Per-visit pricing but ONE invoice a month: completed visits skip
`billCompletedVisit` and join the unbilled pool (completed + no direct
invoice + `Job.consolidatedInvoiceId` null); `runMonthlyConsolidations`
(hourly cron + Run-due-now + "Bill now") bills each due series' pool as a
single invoice with a dated line per visit (`InvoiceLineItem.serviceDate`),
stamps `consolidatedInvoiceId` on the visits, archives any still in
REQUIRES_INVOICING, then settles through the same auto-charge path.
`nextRunDate` is the cursor (the 1st, advancing monthly via
`firstOfNextMonth`) — which is why `runDueSubscriptions` filters
`interval: { not: null }`: the flat sweep must never claim a consolidated
series' cursor. Manually invoicing a pooled visit removes it from the pool
(its direct invoice exists). "Bill now" on a consolidated series invoices
the pool immediately; pause stops the sweep (pool keeps accruing until
resume/cancel — bill before cancelling).

**Visit series (weekly/biweekly visits, billed on their own cadence).** A
subscription can carry a visit schedule (`visitFrequency` weekly/biweekly/
monthly/quarterly/annually + `nextVisitDate`, time window, default assignees)
set from the Subscriptions page edit form. `generateDueVisits` in
`lib/subscriptions.ts` materializes the next ~4 weeks of visits as ordinary
Jobs (subscriptionId set, Repeat glyph on the calendar) so dispatchers can
drag/reschedule or delete individual visits; deleting one skips it for good.
Billing stays on `interval`/`nextRunDate` — the classic "weekly mows, monthly
invoice". Pause/cancel (or clearing the frequency) deletes untouched future
visit jobs; resume rolls the series forward on-cadence. When a subscription
has a visit series, the billing cycle's `createsJob` path is skipped — the
visit engine owns job creation. (The old dormant `ServicePlan` model was
removed in favor of this.)

**The engine needs an HOURLY trigger.** `POST /api/cron/recurring` sweeps:
(1) due subscription cycles, (2) visit-series job generation, (3) escalating payment
reminders for unpaid/overdue invoices (due date, then 3/7/14 days; one email per stage
via `PaymentReminder`, stops when paid), (4) quote follow-ups (3/7 days after send via
`QuoteReminder`), (5) appointment reminders (day-before AND ~1 hour out — **the 1-hour
stage only fires if this cron runs hourly**; on a daily cron it never lands), plus QBO
nightly sync, location-ping pruning, and storage rollups — see `lib/reminders.ts` /
`lib/subscriptions.ts`. It's authed by `Authorization: Bearer ${CRON_SECRET}`. Wire it
up one of two ways:

- **Railway cron service (recommended):** add a new service in the Railway project
  with an hourly cron schedule (`0 * * * *`) whose command is:
  `curl -fsS -X POST "$NEXTAUTH_URL/api/cron/recurring" -H "Authorization: Bearer $CRON_SECRET"`
- **External pinger:** point cron-job.org (or a GitHub Action) at the same URL/header hourly.

Everything is idempotent — hourly runs won't double-bill, double-remind, or
double-generate (each sweep claims its work atomically). Until a trigger is set up,
owners can use the **Run due now** button on the Subscriptions page.

**Auto-charge + retries (`lib/auto-charge.ts`):** engine-generated invoices
settle through `attemptAutoCharge`, which resolves the card at charge time —
the series' pinned card (`Subscription.savedCardId`, set from the edit form's
"Autopay card" select), else the client's default `SavedCard`, else the legacy
`Contact.processorCustomerRef` mirror — and charges via the `PaymentProcessor`
seam. Declines are classified hard vs soft from the Finix `failure_code`
(surfaced on `ChargeResult.code`): soft declines retry on a +1d/+3d/+7d
schedule (max 4 attempts — `runAutoChargeRetries` on the hourly cron; retry
state lives on the Invoice `autoCharge*` columns); hard declines (lost/stolen/
invalid/expired/closed) stop immediately. Dunning: first failure → client
"payment didn't go through" email with a hub card-update link, owner push,
ActivityLog (`auto_charge_failed`, userName "Autopay"); give-up → owner push
again. Saving a new card (hub, staff, or /pay checkout) calls
`reviveAutopayForContact` so stalled invoices retry on the next cron pass.
`runCardExpiryNudges` (same cron) emails autopay clients once per card ~30
days before it expires. NOTE: `chargeStored`'s Finix idempotency id is keyed
by invoice + amount + a hash of the INSTRUMENT + the autopay ATTEMPT number
(`metadata.attempt`, passed by `attemptAutoCharge`): re-running the same
attempt after a processor outage (`transient` → `processor_down`, no attempt
burned) replays the original transfer instead of charging twice; a new
attempt after a decline, a bank return (the Finix webhook bumps the count),
or a new card (different instrument) is a fresh request, so a decline is
never replayed. Staff "charge card" sends no attempt and keeps the old
minute window. Keep all of that. After a transient failure
`findUnrecordedTransferForInvoice` checks Finix for a transfer tagged with
the invoice before giving up; `processor_down` is bounded — three days
running and autopay stops with an owner push (`MAX_PROCESSOR_DOWN_DAYS`).
"Not enabled for this business" is `code: "not_enabled"` → `not_live` →
the pay-link email, not a retry. With no card at all the engine still falls
back to the pay-by-link email.

## Unit tests (no framework — plain `tsx` scripts)

Each is `npx tsx scripts/<name>.ts`; the ones that import Prisma-backed
modules need a placeholder `DATABASE_URL=postgresql://u:p@localhost:5432/unused`
(never queried). Run them all before a push that touches money, scheduling
or booking: `test-money` (refund split, deposit credit, due dates),
`test-ops-guards` (quote expiry, geocode acceptance, serialization retry),
`test-subscriptions` (billing/visit cursor math, decline classification),
`test-sms-keywords`, `test-route-plan`, `test-booking-engine`,
`test-job-crew`, `test-calendar-sync`, `test-business-line`, `test-voice`. The Playwright suite in `e2e/` runs
against the deployed app (see `e2e/README.md`) and is the post-deploy check.

## Database setup (Railway)

1. Create PostgreSQL database in Railway
2. Set `DATABASE_URL` in Railway environment variables
3. Run `npm run db:push` to push the schema (required after the recurring-services
   schema change — adds Subscription, WorkItem recurring/agreement fields,
   subscriptionId on Invoice/Job, etc.)
4. Run `npm run db:seed` to create the initial superadmin user (admin@streamflaremedia.com / ChangeMe123!)
5. **Change the admin password immediately after first login**

## Deployment

Railway detects Next.js automatically and runs `next start`. GitHub remote: `https://github.com/slyf3ll0w/knightlydigital`

**Two Railway environments, two branches (set up 2026-09-16):**

| Branch | Railway env | URL | Database |
| --- | --- | --- | --- |
| `staging` | staging | https://streamflaire-staging.up.railway.app | its own Postgres (empty at birth; `db:predeploy` builds the schema) |
| `main` | production | https://workbenchfsm.com | production |

Both run Finix in **sandbox** mode. Staging has its own `AUTH_SECRET`,
`CRON_SECRET` and `SUPERADMIN_PASSWORD` (rotated at creation), its own hourly
cron service pointed at the staging URL, and otherwise a copy of production's
variables (Resend, Telnyx, Mapbox, R2, Sentry — so real emails send from
staging; keep tester traffic there, not on prod).

**The release flow:** push to `staging` first. GitHub Actions runs `CI`
(tsc, `npm run test:unit`, `next build`) on every push, and `E2E (staging)`
waits for that commit to be live on staging (`/api/health` reports
`commit`), provisions the two e2e tenants, and runs the Playwright suite
against it. Green → fast-forward `main` (`git push origin staging:main`) and
production deploys. Secrets the e2e job needs live in GitHub Actions secrets;
`scripts/set-ci-secrets.sh` copies them from Railway without printing them
(re-run when a staging secret rotates). Known staging gaps: the Turnstile
site key must have the staging hostname added in Cloudflare before public
forms render the captcha there; Google OAuth redirect URIs don't include
staging (Calendar connect won't complete there).

**Cloudflare sits in front of workbenchfsm.com** and replaces any origin
`502`/`504` response body with its own HTML error page, so a JSON
`{ error }` sent with those statuses never reaches the browser (the client
falls back to "Something went wrong"). API routes report upstream failures
(Telnyx, Finix, QuickBooks, Resend, the model) as **424**, never 502/504.
Found 2026-09-22 when a Telnyx brand rejection showed as a blank failure.

**Mobile**: the shell is thin — the webview loads the live site, so a Railway
deploy updates the apps too, `components/NativeShell.tsx` included. Only the
native project (`android/**`, `ios/**`, `capacitor.config.ts`, or adding a
Capacitor plugin) needs a store build. Park anything that does in
`docs/plans/native-release-queue.md` rather than cutting a build for one item;
build mechanics are in `docs/plans/mobile-app-runbook-mac.md`.

## Business details to update (marketing site)

- **Phone**: `(833) 495-0229` — one constant, `WB_PHONE` in `lib/wb-site.ts` (nav, footer, CTA band, JSON-LD, agency header/footer)
- **Email**: `info@streamflaire.com` (real contact address as of 2026-07-09; Resend still SENDS from streamflaremedia.com)
- **Contact form**: `components/ContactForm.tsx` currently fakes submission. Wire to Formspree, Resend, or an API route.
- **Social links**: Header social icons link to `#` — update when accounts are set up.

## Online booking (items + booking page)

One list, one page. Designed in `docs/plans/online-booking-v2-plan.md` (§10
records the 2026-09-03 merge of web forms into it). A **`BookingType`** is an
*item* on the company's booking page: kinds `PHONE_CALL` / `VIDEO_CALL`
(exact start) / `IN_PERSON` visit / `SERVICE` (price-book services) /
`MESSAGE` (contact form). Each has a `mode`: **SCHEDULE** (customer picks a
time from the engine) or **REQUEST** (they ask, the business follows up — the
old web-form flow; MESSAGE is always REQUEST, paid items always SCHEDULE).
Every item carries its own **intake** (`BookingType.intake` JSON,
`lib/booking-intake.ts`: standard fields, "what do you need?" question,
message box, ≤10 custom questions incl. save-to-client-field, heading, button
label, quoteMode draft|send, allowMultiple) — `effectiveIntake` applies the
kind/mode rules (scheduled → email required; PHONE_CALL → phone required;
needsAddress → address is its own step) and BOTH renderers and BOTH submit
routes go through it. `showOnPage` hides link-only items from the menu;
`legacyFormId` remembers the WebForm an item came from (old settings links
redirect). The company's one look lives on `Company.bookingPage`
(`lib/booking-page.ts`: theme/font/size/accent/title/description).

- **Engine** — `lib/booking-engine.ts` is pure and unit-tested
  (`npx tsx scripts/test-booking-engine.ts`). `checkSlot` = hours → busy
  (with buffers) → daily cap → drive feasibility (`prev.end + drive ≤ start`,
  `end + drive ≤ next.start`, per-leg `Company.bookingDriveLimitMinutes`).
  Drive = haversine estimate during the sweep; `lib/booking-runtime.ts`
  `assignMemberForSlot` re-checks the winner against real Mapbox road
  minutes at submit (falls through the ranking, then 409). No
  `MAPBOX_TOKEN` = gap-fit only. Pools: `BookingTypeMember`
  (`lastAssignedAt` = least-recently-assigned round robin; `priority` only in
  PRIORITY mode).
- **Runtime** — `lib/booking-runtime.ts`: `toPublicBookingType` (what the page
  may know, intake already effective, heading/buttonLabel resolved),
  `resolvePublicBookingType(slug, item, {includeInactive, skipGate})`,
  `listPublicBookingTypes`, `menuTypes` (active + showOnPage + bookable),
  `loadPoolWithBusy`, `rulesFor`, `slotsForType`. `lib/booking-public.ts`
  adds the owner **preview** (`?preview=1` + a signed-in manager of that
  company: inactive items render, approval gate skipped; nothing submits).
  `lib/public-company.ts` is the suspended/pre-approval gate.
- **Writes** — scheduled: `lib/booking-submit.ts` (calls/visits → Request +
  Appointment, `.ics` mail, manage token) and `lib/booking-checkout.ts`
  (SERVICE → approved Quote → `convertQuoteToJob` → Job; card charged AFTER
  commit, `unwind()` on decline). Request mode: `/api/public/book/[slug]`
  POST `{ item, … }` → contact + Request (+ draft/sent Quote for SERVICE).
  `lib/booking-answers.ts` validates the service question + custom answers
  for both paths; mapped answers land on `Contact.customFields`.
- **Public** — `/book/[slug]` = the booking page: one visible item renders
  directly (so the old default-form URL still shows a form), several → the
  menu (`ScheduleMenu`). `/book/[slug]/[item]` = `ItemView` → `BookingStepper`
  (SCHEDULE) or `RequestForm` (REQUEST) inside `ScheduleFrame`. Embeds mirror
  it at `/embed/[slug][/[item]]` (resize key = `slug` or `slug/item`, legacy
  `jobflow:height` message). The v2 `/schedule[/type]` paths permanently
  redirect; `/book/[slug]/schedule/manage/[token]` stays (it's in sent
  emails). APIs: `/api/public/schedule/[slug]/[item]/slots` (GET, `?preview=1`),
  `/api/public/schedule/[slug]/[item]` (POST, captcha action `booking`),
  `/api/public/schedule/manage/[token]`. Paid embeds hand off to the hosted
  page with `lib/booking-prefill.ts` (finix.js refuses foreign iframes).
- **Settings** — `/app/settings/booking`, nav label "Booking & forms" (`BookingHome`: page link/embed,
  Look, Scheduling rules, then the item list — ledger rows, one New button);
  `/app/settings/booking/[id]` (`ItemEditor`: autosave, sections How it
  works / Services / Timing / Who takes these / Confirmation / Payment /
  Questions / Words / After they book / Open times / Sharing; the right pane
  is an iframe of the real page in preview). API: `/api/app/booking-types
  [/[id]]` (PATCH takes `intake`, `mode`, `showOnPage`, members, services,
  slug). `/api/app/settings` PATCH takes `bookingPage`. Team page: bookable
  master switch, meeting link, start address.
- **Client hub** — `Company.hubBookingTypeId` picks ONE item (any kind) that
  existing clients see under "Get work done" in their hub instead of the
  built-in title + details form (null = plain form; the item's DELETE clears
  it). `lib/hub-form.ts`: `loadHubForm`, `hubFormWords`, `hubFormAppearance`
  (hub chrome, not the booking-page look), `hubSubmitter`. Both public POST
  routes accept `hubToken`: a valid token of THAT company skips captcha +
  honeypot, fills name/email/phone/address from the contact (and fills the
  contact's blanks from the form), writes `source: "client_hub"`, and never
  touches the Leads pipeline (repeat business, not a lead). `RequestForm` /
  `BookingStepper` take `hub` and hide fields already on file. Settings: the
  "In the client hub" row on Booking & forms and "Use as the client hub form"
  in the item's Sharing card. e2e: `e2e/specs/hub-form.spec.ts`.
- **Migrations** — `scripts/migrate-booking-types.mjs` (v2, done) and
  `scripts/migrate-forms-to-items.mjs [--apply]` (v3: every WebForm → an
  item with the form's slug + questions, default form's item on the page,
  others link-only, look copied to `Company.bookingPage`, sleeping v2
  defaults pruned). `WebForm` + `Company.bookingForm` + `BookingRequest` are
  dead — drop in a later contract step.
- **Retired** — `lib/web-forms.ts`, `lib/booking-form.ts`, `/api/app/web-forms`,
  the form builder/editor, `BookingForm.tsx`, `lib/booking-slots.ts`,
  `lib/booking-availability.ts`, `/api/public/booking-slots`.
