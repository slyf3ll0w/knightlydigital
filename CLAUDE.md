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
**`lib/payments.ts`** — Payment processor stub. Swap functions here when integrating Stripe/Finix/Square.
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
- **Refunds:** payment row ↺ button (managers) → `POST
  /api/app/payments/[id]/refund` → Finix reversal, then the payment amount
  drops and invoice status recomputes. Manual payments have nothing to
  reverse — edit/delete the record instead.
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
```

## Recurring subscriptions

Services in the price book (Settings → Products & Services) can be marked recurring
(monthly / quarterly / every 6 months / annually). Selling a recurring service —
through a quote→job conversion, a direct invoice, or a web-form service request —
creates a `Subscription` on the client. The engine in `lib/subscriptions.ts` then
generates the next invoice (and optionally a job) each cycle. See the
Subscriptions page (`/app/subscriptions`) to pause/cancel or bill a cycle now.

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

**The engine needs a daily trigger.** `POST /api/cron/recurring` runs two sweeps —
(1) generate due subscription cycles, and (2) send escalating payment reminders for
unpaid/overdue invoices (on the due date, then 3/7/14 days overdue; one email per
stage via `PaymentReminder`, stops when paid; reminders are Resend-gated and cover
both subscription and one-off invoices — see `lib/reminders.ts`). It's authed by
`Authorization: Bearer ${CRON_SECRET}`. Wire it up one of two ways:

- **Railway cron service (recommended):** add a new service in the Railway project
  with a cron schedule (e.g. `0 8 * * *`) whose command is:
  `curl -fsS -X POST "$NEXTAUTH_URL/api/cron/recurring" -H "Authorization: Bearer $CRON_SECRET"`
- **External pinger:** point cron-job.org (or a GitHub Action) at the same URL/header daily.

Until a trigger is set up, owners can use the **Run due now** button on the
Subscriptions page. The endpoint is idempotent — running twice a day won't double-bill.

**Auto-charge:** billing is built against the `PaymentProcessor` seam in
`lib/payments.ts`. When a processor is `live` AND the client has a saved card
(`Contact.processorCustomerRef`), the engine auto-charges via `chargeStored()` and
records the payment; otherwise it emails a pay-by-link. Implementing a real
`FinixProcessor.chargeStored()` + saving cards is the only work needed to turn on
true silent auto-charge — no recurring code changes.

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
