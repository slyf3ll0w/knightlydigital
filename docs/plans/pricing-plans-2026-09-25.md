# Pricing plans — Bench, Dispatch, Shop, Jobsite, Full Shop

Status: **DECIDED + SITE LIVE-READY 2026-09-25.** The catalog (`lib/plans.ts`),
the marketing site, and the superadmin whitelist are built. Checkout for Shop /
Full Shop and in-app gating of the Shop features are **not** built — see
"Not done" at the bottom. The first users are whitelisted onto everything.

## The model

WorkBench stays free at the core, funded by payment processing (2.9% + 30¢
card, 0.75% ACH). The free plan is **full access, not a trial** — the site says
so everywhere. Three optional add-ons, each one flat price per company, plus a
bundle. Annual billing on any add-on = pay for 10 months, get 12.

| Plan | Price | What it is |
| --- | --- | --- |
| **Bench** (free core) | $0 · 2 users included · $10/user/mo after | Clients, booking, scheduling, quotes, invoices, payments, portal, chat, clock-in, iPhone app, Atlas free tokens (10,000/mo). |
| **Dispatch** | $25/mo ($250/yr) · **$25 one-time** number setup | The business phone line (lib/business-line.ts): local number, 10DLC texting registration, calls ring in the app then the cell, dialer, voicemail, call log, Atlas call notes. **500 texts + 500 minutes/mo included; 3¢ per text or minute after**, billed with the next month. |
| **Shop** | $89/mo ($890/yr) | **Unlimited users** + Estimator & Library, Route Manager, Automations, Agreements, Team map, Timesheets & labor costing, QuickBooks Online, Atlas Full's 150,000 tokens. |
| **Jobsite** | $29/mo ($290/yr) · **coming soon** | CompanyCam-style job photos (`job-photos-companycam-2026-09-25.md`). Shown on the site, not sold. |
| **Full Shop** | **$99/mo ($990/yr) now** → $119/mo once Jobsite ships | Dispatch + Shop today; Jobsite joins at no extra charge. Anyone on it before Jobsite ships keeps $99. |

Extra users at $10/user/mo apply to Bench, Dispatch, and Jobsite. Shop and Full
Shop are unlimited.

### Why these numbers (2026-09-25 research)

- Jobber: $39–49/mo for 1 user, $149/mo for 5, Grow $199–299; extra users
  $19–29. Housecall Pro: $59–79 for 1 user, $149–189 for 5, MAX $299 + $35/user.
  CompanyCam: $79/mo for 1 user, $149 for 3, $29–34 per extra seat. Quo/OpenPhone:
  $15–33 per user. A 6-person crew pays ~$250–300/mo elsewhere before add-ons;
  Shop at $89 flat with unlimited users undercuts that by two thirds and is still
  real revenue on top of processing.
- **Dispatch's allowance was cut from 1,500 to 500** after costing it: Telnyx
  outbound text ≈ $0.008 all-in (platform + carrier surcharge), a ring-through
  minute ≈ $0.01 (two legs), number $1.10 + 10DLC campaign $10/mo fixed. At
  1,500/1,500 the plan cost ~$38/mo before transcription (~$0.025/min more if
  every call is transcribed) — underwater at $25. At 500/500 a typical shop
  (300 texts, 400 min) costs ~$18. Transcription (Atlas call notes) is metered
  through Atlas tokens, not bundled in Dispatch.
- **The $25 setup** passes through the carrier registration (TCR brand $4.50 +
  campaign review $15 + first quarter $4.50 ≈ $24; re-files are free in code).
  Quo charges $19.50 for the same filing, so it reads as normal.
- **2 users on the free plan, not 1** (competitors give 1): owner + one office
  person / spouse is the most common trade-shop shape, the second seat costs us
  nothing, and it keeps invoices flowing through WorkBench (the actual revenue
  engine). The $10 seat paywall hits at the first real hire.
- **Two things moved from free to Shop**: weekly timesheets and agreements.
  The pricing FAQ says so ("moved in September 2026") and promises every
  account opened before then keeps both free. Clock-in/out itself stays free.
- **QuickBooks for accountant referrals**: promised free on Bench when an
  accountant sends the client. Implemented as a plan grant / future QBO-only
  flag, not a separate SKU.

## What's built

- **`lib/plans.ts`** — the one catalog: ids (`DISPATCH | SHOP | JOBSITE`),
  names, taglines, monthly cents (env-tunable `PLAN_*_CENTS`), `comingSoon`,
  bullet lists, Full Shop (`monthlyCents` now / `monthlyCentsAfterJobsite`),
  seats (`INCLUDED_SEATS`, `EXTRA_SEAT_CENTS`), Dispatch allowance/overage/
  setup, `annualCents`, formatters, and the entitlement helpers `hasPlan`,
  `hasUnlimitedSeats`, `activePlans`, `normalizeGrants`. `hasPlan(c,
  "DISPATCH")` is true for a grant OR a paid Livery subscription
  (`addonActiveAt`). `scripts/test-plans.ts`.
- **`Company.planGrants String[]`** — the whitelist. Additive schema change;
  `db:predeploy` pushes it.
- **Superadmin → company → "Plans (whitelist)"** (`PlanControl.tsx`): a row per
  plan with Grant free / Revoke, and Grant everything (Full Shop) / Revoke all.
  API: `PATCH /api/superadmin/companies/[id] { action: "plan-grant" |
  "plan-revoke", plan: PlanId | "ALL" }`. A Dispatch grant also stamps
  `addonActiveAt` (so the business line unlocks today); a Shop grant also
  starts the Atlas paid plan (its tokens are part of Shop). Revoking clears
  those only when no Livery subscription id is behind them.
- **"Workbench Plus" renamed Dispatch** everywhere (lib/addon.ts `ADDON_NAME`,
  the 402 messages, settings nav, mobile nav, the upsell page's feature list,
  the Livery webhook notifications, the Settings line card, the superadmin
  Livery card). The Livery checkout is the Dispatch checkout.
- **Marketing site**: `components/wb/WBPricing.tsx` is now the plan grid
  (Bench card + Dispatch / Shop / Jobsite-coming-soon / Full Shop with a
  monthly/annual toggle); `/pricing` hero, "essentials free forever" (with the
  grandfathering line), Atlas Full "Included with Shop", a rewritten FAQ (trial?
  what counts as a user, Dispatch extras, annual, paywall history, QuickBooks
  referral); home page rate table + pricing section + FAQ; `SoftwareApplication`
  JSON-LD now lists four offers; /features hero + "Shop" chips on timesheets,
  team map, agreements (`FeatureItem.plan`); the three /vs pages; footer,
  apply, scheduling and time-tracking descriptions; the Atlas feature page.
  Every number comes from `lib/plans.ts`.
- Packaging board starter lanes renamed (fresh boards only — an existing board
  keeps its rows).

## Not done (deliberately — next steps)

1. **Gating.** Nothing but the phone line is gated in the app. Shop features
   (Estimator, Routes, Automations, Agreements, Team map, Timesheets,
   QuickBooks) and the 2-user cap are wide open. Roll-out plan: `hasPlan(company,
   "SHOP")` at each feature's page + API entry (402 like the line), a seat cap
   in the Team invite path (`INCLUDED_SEATS` unless `hasUnlimitedSeats`), and
   a `Company.grandfatheredAt` (or a backfill that grants nothing but marks the
   date) so pre-launch accounts keep timesheets + agreements. Do this AFTER the
   first users are whitelisted, and announce it.
2. **Checkout for Shop / Full Shop / extra seats.** Only Dispatch has a Livery
   checkout link. Shop and Full Shop need their own Livery products + webhook
   handling that writes `planGrants`-equivalent paid state (a
   `planSubscriptions` JSON or per-plan `*ActiveAt` columns — decide when
   wiring). Annual terms are Livery products too.
3. **Dispatch usage billing.** Text/minute counting per company per month and
   the 3¢ overage invoice (Telnyx per-message/per-minute records already flow
   through `lib/platform-costs`). The allowance is copy only until then.
4. **The $25 setup fee** is copy only — charge it at number purchase once
   checkout exists (Livery one-time product).
5. **Jobsite** — build per `job-photos-companycam-2026-09-25.md`; flip
   `PLANS.JOBSITE.comingSoon` and Full Shop's price (`PLAN_FULL_SHOP_CENTS`
   → 11900) when it ships, honouring the "keep $99" promise for existing
   Full Shop rows.
6. **Accountant-referral QuickBooks** — a QBO-only grant (or a fourth grant id)
   rather than handing out all of Shop.
7. In-app "Plans" page for owners (what they're on, what they could add) —
   today the only in-app plan surface is Settings → Dispatch.
