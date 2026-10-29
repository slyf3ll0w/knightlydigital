# Plan gating live, sign-up through Square, and a fuller Payments section

Status: **BUILT on branch `plan-gating` 2026-10-28** (parts 1 and 2 as one
release, part 3 alongside) — see "What shipped" at the end. David's decisions
(same day): WorkBench's own Square account; grant from the census (no blanket
grandfathering); the seat cap ships with the Plans page in the same release;
gated items stay visible with a Pro chip; monthly + annual from day one; Max is
one Square plan; build all three without pausing. David asked for three things
on the same day:

1. **Plan gating live.** Test accounts (`Company.isTest`) have everything
   open except Voice by default. Live accounts are gated unless David grants
   them a plan in the superadmin console.
2. **Sign-up / billing.** Pick the channel for paid plans now that payments
   are live: Streamflaire (Livery, paywithlivery.com — the channel Voice uses
   today) or WorkBench's own Square account.
3. **Payments section.** Grow `/app/payments` so a Square-connected company
   gets the Square dashboard's capabilities inside WorkBench, in WorkBench's
   shape.

Companion docs: `pricing-plans-2026-09-25.md` (the catalog, the whitelist,
and the "Not done" list this plan closes), `square-oauth` notes in
CLAUDE.md, `tap-to-pay-*`.

---

## 1. Plan gating

### What exists

- `lib/plans.ts` — catalog, `hasPlan(company, id)` (planGrants whitelist, or
  `addonActiveAt` for Voice), `featureAllowed(company, feature)` for three
  ids: `routes`, `task_assign`, `team_notes`. `planGatingLive()` is
  `PLAN_GATING === "1"`; dark = everything allowed.
- `lib/plan-gate.ts` — `checkFeature` → 402 `{ code: "PLAN_REQUIRED", plan: "SHOP" }`.
  Call sites: route-plan (3), schedule/suggest, tasks (2), notes (2),
  on-my-way, Atlas field tools (4), routes + tasks pages.
- Superadmin company page → Controls tab already edits `planGrants`
  (DISPATCH / SHOP / JOBSITE) and flips `isTest` (`mark-test`).
- e2e tenant A is provisioned with `planGrants: ["SHOP"]`; tenant B is Core.
- Seats: `INCLUDED_SEATS` 2 / `EXTRA_SEAT_CENTS` $10 are copy only; the team
  POST says so and refuses nothing. `hasUnlimitedSeats` is only read by
  `lib/active-device.ts`.
- **Nobody handles the 402 on the client.** Only the route-plan GET names
  `PLAN_REQUIRED`; everywhere else the user would see a generic error toast.

### Rules to build

```
featureAllowed(company, feature):
  if (!planGatingLive()) return true
  if (company.isTest && feature !== "voice") return true     // NEW: test accounts open
  return hasPlan(company, planFor(feature))
```

Voice is not a `GatedFeature` — it gates on a provisioned line + `hasAddon`
in `lib/business-line.ts`, so a test account still needs a Voice grant (or a
subscription) to get a number. That is exactly "everything open except
Voice". `PlanHolder` grows an `isTest: boolean` field; every select that
feeds it adds the column (plan-gate.ts, active-device.ts, Atlas field.ts,
the two pages).

### Gate coverage — the Pro list vs what is gated

| Pro feature (lib/plans.ts includes) | Gated today | Entry points to gate |
|---|---|---|
| Route Manager | yes (`routes`) | — |
| Tasks to your team / team sticky notes | yes | — |
| Estimator + Library | **no** | `/app/estimator*` pages, `/api/app/estimator*`, Atlas estimator tools |
| Automations | **no** | `/app/automations`, `/api/app/automations*`; existing automations keep FIRING (never silently break a shop's reminders) — gate the builder, not the runner |
| Agreements and contracts | **no** | agreements routes + the quote "requires signature" switch |
| Live team map | **no** | `/app/schedule/map`, presence API |
| Timesheets and labor costing | **no** | `/app/time*`, clock-in/out API; crews already clocking in keep their data, the page shows the upsell |
| QuickBooks Online sync | **no** | `/app/settings/quickbooks`, connect + sync routes (a connected company keeps syncing until it disconnects; grandfather) |
| Unlimited users | **no** | team POST: refuse the 3rd+ active user unless `hasUnlimitedSeats` or the company pays seats (part 2) |
| Atlas Full tokens | separate (`atlasPlanActiveAt`) | grant Atlas Full when SHOP is granted/paid (`lib/assistant-billing.ts`) |

New `GatedFeature` ids: `estimator`, `automations`, `agreements`, `team_map`,
`timesheets`, `quickbooks`, `seats`. `FEATURE_LABEL` names each for the
refusal copy.

### Client side — one upsell, everywhere

- `components/PlanRequired.tsx`: the card a gated PAGE renders instead of its
  content (feature name, the Pro one-liner from the catalog, price, "See
  plans" → Settings → Plans, and for owners the upgrade button from part 2).
  Phone version is the same card, full width, iOS style.
- `lib/fetch-json` (or wherever the app's fetch helper lives): on 402
  `PLAN_REQUIRED` show one toast — "Route Manager is part of Pro" with a
  "See plans" action — instead of the generic failure. Atlas tools already
  answer with words; keep that.
- Navigation: gated items stay VISIBLE with a small "Pro" chip (people should
  see what Pro has), the page itself is the upsell. (David to confirm; the
  alternative is hiding them, which also hides the upsell.)

### Pre-launch accounts

Live accounts already using Pro features will lose them at switch-on unless
granted. A census script (`scripts/plan-census.mjs`, read-only, run through
`run-with-prod-db.mjs`) lists every live company with: users > 2, estimator
docs, automations, agreements, time entries, QBO connection, route plans.
David grants SHOP (or Max) to the ones he wants kept, then flips the switch.
No automatic grandfathering column — the grant list IS the record, and the
console shows it.

### Roll-out order

1. Build the rules + coverage + PlanRequired + seat cap, `PLAN_GATING`
   still unset. Unit: `scripts/test-plans.ts` (isTest bypass, every id,
   Voice excluded). e2e: tenant B hits `/app/routes` → upsell card,
   `/api/app/route-plan` → 402; tenant A unchanged. Staging runs with
   `PLAN_GATING=1` from this release on.
2. Help: `/help/plans-and-pricing` (what's gated, what test accounts are),
   each Pro guide gets a "Part of Pro" line. ASK David before writing.
3. Release to main (gate still dark in prod).
4. David runs the census, grants, then sets `PLAN_GATING=1` on the
   Streamflaire service in Railway — a variable, no deploy. Announce in the
   app's What's new.

Effort: ~2 days build + Help.

---

## 2. Sign-up and billing: Square, in-app, on WorkBench's account

### The two channels

**Streamflaire / Livery** (what Voice uses today): hosted checkout link with
`?ref=<companyId>`, signed webhooks → `addonActiveAt`. Pros: already wired,
one webhook handler. Cons: Livery settles through Finix, the processor
WorkBench has already stepped away from for clients (onboarding closed,
Square is the platform); the recurring-billing cron is a Railway service we
run ourselves (`docs/runbook.md`); card updates, dunning, receipts and
statements are ours to build and support; Pro/Max/seats/annual each need a
Livery product plus new webhook paths; and WorkBench revenue lands in a
different company's books.

**WorkBench's Square account**: Square Subscriptions API + Catalog plan
variations. Square charges the card on file every period, retries, emails an
invoice on a failed charge, handles card updates, and the Square dashboard
David already uses becomes the subscriber list. One payment stack across
clients' money and ours. Recommendation: **this one**, and specifically
WorkBench's account rather than Streamflaire's — the Square developer
application WorkBench uses for seller OAuth belongs to the WorkBench account,
and SaaS revenue then reads cleanly in one place.

### Why in-app checkout, not Square payment links

Square can mint a hosted payment link for a subscription plan variation, but
that link cannot carry a customer id or a reference back to the company —
we would be matching subscriptions to companies by buyer email. The app
already loads Square's Web Payments SDK for client card entry
(`lib/square-js.ts`, `lib/pay-client-config.ts`), so the owner can enter a
card on Settings → Plans without leaving WorkBench and we create the
subscription ourselves with an exact company link:

```
CreateCustomer (our account; reference_id = companyId, email = owner)
CreateCard     (source = Web Payments SDK token)
CreateSubscription (location, plan_variation_id, customer_id, card_id)
```

Payment links stay as a zero-code fallback David can send by hand (we grant
manually when one is used).

### What David sets up in Square (dashboard, once)

Subscription plans, each with STATIC-priced variations (RELATIVE pricing is
not supported through checkout links; keep it static everywhere):

| Plan | Variations | Price (lib/plans.ts) |
|---|---|---|
| Voice | monthly, annual | $35 / $350 |
| Pro | monthly, annual | $89 / $890 |
| Max | monthly, annual | $109 / $1,090 (→ $129 / $1,290 after Gallery; existing subscribers keep their variation) |
| Extra seat | monthly | $10 per seat (quantity on the subscription phase, or one subscription per seat block) |
| Voice setup | one-time payment, not a subscription | $25, charged with CreatePayment at number purchase |

The variation ids go in env (`SQUARE_PLAN_VARIATION_DISPATCH_MONTHLY`, …) so
a price change is still a Square edit + a variable. Also from the dashboard:
a webhook subscription for `subscription.created`, `subscription.updated`,
`invoice.payment_made`, `invoice.scheduled_charge_failed`, `payment.updated`,
pointed at a new `/api/public/webhooks/square-billing` (separate from the
seller webhook; different signature key, different account).

### Code

- **Credentials.** `SQUARE_PLATFORM_ACCESS_TOKEN` + `SQUARE_PLATFORM_LOCATION_ID`
  for WorkBench's own account (production access token from the same
  developer application). Never a seller token.
- **Model.** `CompanyPlanSubscription { companyId, planId | "FULL_SHOP" | "SEAT",
  squareSubscriptionId @unique, squareCustomerId, squareCardId, status,
  cadence (MONTHLY|ANNUAL), quantity, currentPeriodEnd, cardBrand, last4,
  canceledAt }`. `hasPlan` reads it alongside `planGrants` and
  `addonActiveAt`; Max satisfies DISPATCH + SHOP (+ JOBSITE when it ships).
- **Entitlement sync.** `subscription.updated` → status (ACTIVE / PAUSED /
  CANCELED / DEACTIVATED); `invoice.payment_made` → extend
  `currentPeriodEnd`; failed `payment.updated` → grace (7 days, banner "card
  didn't go through"), then the gate closes. An hourly sweep re-reads any
  subscription not touched in 36 h (webhooks can be missed; Square's own
  forum confirms pause/cancel sometimes arrive late).
- **Settings → Plans** (`/app/settings/plans`, owners): what you're on,
  cards for Voice / Pro / Max with Add, seat count with +/−, card on file
  (replace), cancel (end of period), receipts link. Replaces the Voice-only
  `/app/settings/addon` page; the pricing site's buttons deep-link here.
  Phone first, per the app UI rules.
- **Seats.** Team POST: Core company at `INCLUDED_SEATS` → "Add a seat for
  $10/mo" sheet → updates the seat subscription quantity, then adds the
  person. Removing a user below the paid count lowers the quantity next
  period.
- **Voice migration.** New Voice sign-ups go through Square. Existing Livery
  subscribers keep working (the Livery webhook stays); the Plans page
  offers "Move your card to Square" which creates the Square subscription
  and cancels the Livery one. When the last one moves, drop Livery.
- **Superadmin.** Company page shows the subscription rows next to the
  grants; a "Comp" grant still overrides.
- Tests: unit on the entitlement reducer (webhook event → row state →
  hasPlan); e2e against the Square SANDBOX with the sandbox plan variations
  (the e2e harness already seeds a sandbox seller; add sandbox platform
  credentials to CI secrets).

Effort: ~4 days build + David's Square setup + Help (`/help/plans-and-pricing`,
`/help/set-up-business-line`, new `/help/manage-your-plan`).

---

## 3. Payments section: Square-dashboard capabilities, WorkBench shape

### Today (Square-connected company)

`/app/payments` lists WorkBench's own online payments with live status,
refunds from the row, CSV export, and a card that says balance, payouts,
fees and disputes live in the Square dashboard. The Finix-era payouts and
disputes sections do not render for Square.

### What the Square dashboard has that we can carry in (seller OAuth)

| Square dashboard | WorkBench version | API / scope |
|---|---|---|
| Transactions (every sale, incl. Square POS / Online sales outside WorkBench) | "All money in": WorkBench payments + other Square payments, with a one-tap "Match to invoice / client" for the outside ones | ListPayments (`PAYMENTS_READ`, have) |
| Balance + deposits | "On its way to your bank": pending payouts, next deposit, history with per-payout entries and fees | Payouts API (`PAYOUTS_READ`, **new**) |
| Fees | Fee column per payment, month-to-date fees tile, fee report | `Payment.processing_fee` (have) |
| Refunds | have; add partial refunds and a reason | have |
| Disputes | Disputes list, evidence upload, accept — mirrors the Finix `DisputeEvidence` component | Disputes API (`DISPUTES_READ`, `DISPUTES_WRITE`, **new**) |
| Customers + cards on file | have (Square customer per contact, saved cards) | have |
| Bank account | have (payout nudge) | `BANK_ACCOUNTS_READ` |
| Reports | Sales / fees / refunds / net by day, week, month; by tech and by job type — the dashboard cannot do those two, WorkBench can | our records + ListPayments |
| Instant transfer, deposit schedule, Square Online, loyalty, gift cards | stay in Square; the page links straight to the right dashboard screen | — |

Adding scopes means **every connected seller re-authorizes once**: a
"Reconnect Square to see payouts and disputes" banner on the page and in
Settings until they do (the connection records its scopes, so the page knows).

### Shape

Tabs that match the app: **Payments · Payouts · Disputes · Reports**, KPI
strip on top (collected this month, fees, on its way to the bank, open
disputes), the same row style as Invoices. Phone: the strip, then a list;
Payouts and Disputes as their own screens. Team roles: `canSeeMoney` as now;
disputes actions manager-only.

Effort: ~4–5 days (payouts 1, disputes 1.5, all-payments + matching 1,
reports 1, mobile + Help). Help: `/help/payments`, `/help/payouts`, new
`/help/disputes`.

---

## What shipped (2026-10-28, branch `plan-gating`)

- **Gating** — `lib/plans.ts`: `PlanHolder` gained `paidPlans` / `paidSeats` /
  `isTest` (`PLAN_HOLDER_SELECT`); `featureAllowed` passes test accounts;
  ten `GatedFeature` ids with labels + blurbs; `seatLimit` / `canAddPerson`.
  `components/PlanRequired.tsx` on every gated page, `checkFeature` 402 on
  every API entry, Atlas tools answer in words, `components/PlanGateToast.tsx`
  for the 402s, Pro chips in the nav (`lockedFeatures`), `lib/seats.ts`
  seat cap in the team routes (402 `SEATS_REQUIRED`), `/api/health.planGating`,
  `e2e/specs/plan-gate.spec.ts`. Still dark until `PLAN_GATING=1`.
- **Billing** — `lib/plan-billing.ts` + pure `lib/plan-subscriptions.ts`
  (`scripts/test-plan-billing.ts`), `lib/square-billing-api.ts`,
  `PlanSubscription` model + `Company.paidPlans / paidSeats /
  squareBilling* / dispatchSetupPaidAt`, `POST /api/app/billing`,
  `/app/settings/plans` (`PlansClient.tsx`), `/api/public/webhooks/square-billing`,
  cron step `planBilling`, `scripts/square-billing-setup.ts` (creates the
  Square catalog plans from lib/plans.ts and prints the env). Seats are one
  SEAT subscription each (Square variations have no quantity). Upgrades use
  `swap-plan` (prorated). The old `/app/settings/addon` redirects.
- **Payments section** — see the commit on this branch for
  `app/platform/payments` (tabs Payments · Payouts · Disputes · Reports,
  `lib/square-seller-reports.ts`, `lib/payments-reports.ts`); new OAuth
  scopes PAYOUTS_READ + DISPUTES_READ/WRITE → connected sellers reconnect once.

**Square-led (2026-10-29).** David made the plans in the Square Dashboard
of WorkBench's own account and wants Square subscriptions to grant the
entitlements with as little WorkBench-side setup as possible. So:
`lib/plan-catalog.ts` reads the catalog and names each variation's product
from the plan / variation name (`productForPlanName`: Voice / Pro / Max /
Seat / Gallery) and its cadence from the last billing phase
(`mapCatalogVariations`, tested) — any variation under "Voice", a
discounted or trial one included, is a Voice subscription; the in-app
checkout sells the list-price variation (`pickVariation`). A subscription
made in the Dashboard is matched to a company by `companyForSquareCustomer`
(our stamped customer id → the customer's `reference_id` = company id → the
one active OWNER whose sign-in email matches) and picked up by
`refreshCompanyFromSquare` on the owner's Plans page load (throttled), the
superadmin **Check Square now** button, the webhook, or the hourly sweep's
discovery pass (every subscription at our location). `SQUARE_PLAN_*` env
ids are now optional overrides; the webhook is optional too (the sweep and
the page-load refresh cover it within the hour / on the next look).

**Through WorkBench's own WorkBench account (2026-10-29, David's ask).**
No Developer Console token: the WorkBench company inside the app is flagged
`Company.isPlatform` (console → "Make WorkBench's account") and connects
Square with the ordinary Connect Square button; `lib/plan-billing-env.ts`
`planBillingCredentials` borrows that connection's token (its grant adds
`PLATFORM_BILLING_SCOPES`) and location, the seller webhook routes that
merchant's `subscription.*` / `invoice.*` events to plan billing, and the
env token stays as an override.

**Prices and sign-ups from WorkBench (2026-10-29, David: "do steps 4–6 from
WorkBench").** Console → Billing (`/superadmin/billing`) shows every price in
the Square catalog and every subscription, and "Add a price" makes a new
variation (any name and amount) under the plan that sells the product. A
company's console Plans card lists those prices: tick one and save
(`Company.planOffers`) and the owner's Settings → Plans sells it at that
price ("Your price · <name>"); "Send by invoice" starts the subscription on
it right away with no card — Square emails the owner the invoice.

David's part before the switch (in order): on production, open the
WorkBench company in the console → **Make WorkBench's account**; on that
company's Settings → Payments, **Reconnect Square** (the grant needs the
new scopes; the card shows the prompt); in the Developer Console add
`subscription.created`, `subscription.updated`, `invoice.payment_made`,
`invoice.scheduled_charge_failed`, `invoice.updated` to the existing
webhook subscription (optional — the hourly sweep and the Plans page
refresh cover it); test by making himself a customer in the Square
Dashboard (email = his owner sign-in) with a discounted Voice variation and
opening Settings → Plans (or console **Check Square now**); run the census
and grant Pro to the live accounts to keep; set `PLAN_GATING=1`. Help
Center revisions were made on this branch 2026-10-29.

## Decisions for David (answered 2026-10-28 — kept for the record)

1. **Square account**: WorkBench's (recommended) or Streamflaire's?
2. **Live accounts at switch-on**: grant the ones over the line yourself from
   the census, or a blanket 30-day Pro grant for every live account that
   exists today?
3. **Seat cap**: enforce with the gating release, or wait for the Plans page
   so there is a way to pay for a seat before anyone is refused?
4. **Navigation**: gated Pro items visible with a "Pro" chip (recommended) or
   hidden?
5. **Annual plans**: offer monthly and annual from day one, or monthly only?
6. **Max**: one Square plan (recommended) or Voice + Pro as two subscriptions?
7. **Order**: gating → Plans/Square → Payments (recommended), or Payments
   earlier because sellers are already asking?
