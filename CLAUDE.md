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
- Stage `autoAdvanceOn` triggers (request created / appointment scheduled /
  quote sent) move cards FORWARD only — hooks live in the
  request/appointment/quote/booking routes.
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
```

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
days before it expires. NOTE: `chargeStored`'s Finix idempotency id is
minute-windowed — never remove that, or retries replay the original decline.
With no card at all the engine still falls back to the pay-by-link email.

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

## Business details to update (marketing site)

- **Phone**: Replace `(214) 555-0100` / `tel:2145550100`
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
