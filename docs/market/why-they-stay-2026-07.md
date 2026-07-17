# Why home-service companies would stick with Jobber / Housecall Pro / ServiceTitan instead of Streamflaire Hub

*Competitive-weakness audit + market research, 2026-07-15. Sources: full codebase audit of this repo, plus web research on Jobber/HCP retention, ServiceTitan stickiness, and "free software + payment processing" business-model perception. Premise: Hub is free, monetized only by payment processing (assumed live).*

---

## TL;DR

Loyalty to incumbents is roughly **70% switching-cost gravity** (data history, stored cards, recurring plans, trained crews, embedded widgets) and **30% genuine feature love** (scheduling UX, SMS automations, QuickBooks sync, time saved). "Free" alone never wins — the learned reflex in this market is *cheap = hidden add-ons*. The realistic wedge: catch 1–8 tech shops at a **billing-betrayal moment** (renewal hike, add-on creep, held funds) with flawless migration, reachable human support, and radically transparent free-plus-processing economics.

Hub's current disqualifiers, in order of damage: **no SMS, no real payments (and no trust architecture around them), no QuickBooks sync, zero-offline mobile, no weekly/biweekly recurring visit series, no GPS/clock-in.**

---

## Tier 1 — Dealbreakers (disqualify Hub before pricing is even discussed)

### 1. No SMS anywhere
Hub is email-only (Resend). Automated appointment reminders, **"on my way"/ETA texts**, quote/invoice follow-up texts, and two-way texting from a business number appear in *every* retention source as table stakes. Homeowners don't read email; they read texts. Jobber gating two-way SMS to its $299/mo Grow tier is a resentment point — i.e., this is both a must-have AND an opening. Current plan treats SMS as a future paid add-on; note that **add-on creep is the #1 stated churn trigger at incumbents** — bundling reasonable transactional SMS free (it costs pennies) and metering only heavy two-way usage is the on-brand move.

### 2. No QuickBooks Online sync
Direct quote from the research: a challenger without reliable QBO sync "is disqualified before pricing is even discussed." The bookkeeper/accountant has veto power over CRM choice. This was a deliberate skip in the parity plan — it needs to be un-skipped. Jobber's sync is criticized as one-way; ServiceTitan's as slow/babysat. Even a solid one-way push (invoices/payments/customers → QBO) clears the bar for 1–8 tech shops.

### 3. Payments aren't real yet — and when they are, the trust architecture matters more than the rate
`lib/payments.ts` ships only a `ManualProcessor` with `live = false`; the customer pay page is a dashed placeholder box. The entire monetization model is inert. Beyond just shipping the processor, the research is emphatic about what decides trust:

- **Fund-hold horror stories are the #1 objection to bundled processing.** Jobber itself: rolling reserves (5% of daily volume held 30 days per their own docs), a reported $68k auto-refund + account suspension that locked an owner out of their customer database, and an F BBB rating. Stripe/Square holds of 90–120 days are a documented genre. A plumber's first $12k job *is* a "suspicious volume spike."
- **Architecturally separate the payments account from CRM access.** "A payments dispute can never lock you out of your data" is a differentiator no incumbent claims. Publish the hold/reserve policy: triggers, max days, human escalation path.
- **Big tickets need non-card rails.** Only ~43% of contractor payment volume is card. On a $10k job, 2.9% = $290. Ship: low ACH (~1%, ideally **capped per transaction** — a genuine innovation vs Jobber/HoneyBook's uncapped 1–1.5%), automated state-aware surcharging (nobody in FSM automates this; HCP makes users hack it as a manual line item), and eventually consumer financing (41% of homeowners want financing; 62% more likely to proceed with a payment plan — HCP's Wisetack integration is called best-in-class).
- **Never penalize cash/check/other-processor jobs** (Shopify's 0.5–2% penalty is the most-hated pricing in SMB software). Never touch the homeowner with a platform fee (Toast's $0.99 fee reversal). Never move an existing free feature behind a paywall (Wave's 2024 export paywall → 83% YoY growth in "Wave alternatives" searches).
- **Free, permanent, one-click data export** is the cheapest trust purchase available.
- Rate structure: 2.9% + 30¢ matches Jobber and is fine to start; add volume tiers before a competitor uses flat-rate against you. Instant payout at +1% opt-in is proven (Jobber's 3.5% instant fee is hated — undercut it).

### 4. Zero-offline mobile
The Capacitor app is a remote-URL webview; `public/sw.js` explicitly does no caching. A tech in a basement, crawlspace, or rural area gets an error page — can't view the job, take notes, or capture photos. Incumbents' apps are mediocre (HCP Android 3.2/5, Jobber Android "crashes constantly"), so the bar is not perfection — but *zero* offline is below the bar. Minimum: cached read access to today's schedule + job details, and queued writes for notes/photos.

---

## Tier 2 — Stickiness you have to actively pry loose

### 5. Data gravity + migration pain
CSV export of customers exists everywhere, but job/visit history, recurring schedules, price books, photos, and open work orders don't move cleanly. **Stored card-on-file tokens are the hardest lock**: a shop with 200 autopay/membership customers effectively cannot leave without re-collecting every card (processor token portability exists but requires a controlled migration process — support it). HCP wins switchers with white-glove migration where a team imports everything; no small challenger gets adopted on CSV-import alone. Hub's Jobber/HCP header auto-mapping importer is a good start — the play is a "we move you for free" concierge service, extended to job history and price books.

### 6. No weekly/biweekly recurring visit series
Hub's recurrence is billing-first (`Subscription`, monthly minimum cadence). Lawn care and cleaning — the *most winnable verticals* — live on weekly/biweekly visit schedules. HVAC techs name service contracts + memberships as "the tools they'd miss most if they switched." This is a schema-level gap (visit-series generation, skip/reschedule handling).

### 7. No GPS / clock-in / timesheets
"Can't see who is clocked in" is cited as a reason people *leave Jobber*. Hub has zero time-tracking or location primitives. Full GPS fleet tracking isn't needed for 1–8 techs; clock-in/out with job-level time (which also unlocks basic labor job-costing) is the 80/20.

### 8. Unknown-vendor trust deficit
Owners evaluate via Reddit peer consensus, Capterra/G2 scores, "can I call a human," and no-contract/easy-cancel proof. Incumbent support is *declining* (both Jobber and HCP show 2025–26 support-quality complaints; HCP has 75 BBB complaints in 3 years dominated by cancellation hostility) — fast human support is an attackable moat. For a free product from an unknown vendor, the default read is "where's the catch": the answer is a public **"How we make money"** page stating the processing rate plainly, month-to-month, one-click export, self-service deletion (already shipped — surface it in marketing).

Related: the 2026-07-12 bug hunt found quote-approval silently dropping a discount ($974 → $1,082 live-proven). For an unknown vendor, a single billing-math bug **is** the betrayal moment that kills word-of-mouth — money-math correctness is a trust feature, not a bug backlog item.

### 9. Single address per client
`Contact` has one flat address; no Property/Location model. Disqualifies property managers, landlords, HOAs, and commercial accounts — disproportionately valuable clients for cleaning/lawn/handyman shops.

---

## What matters LESS than you'd think (don't build yet)

- **Route optimization** — occasional mentions (lawn), HCP gates it to MAX; nice-to-have.
- **Inventory / purchase orders** — even ServiceTitan users abandon theirs as "way too complicated."
- **Payroll / commissions** — Gusto integration territory, not core.
- **Call center / phone integration / marketing attribution** — this is ServiceTitan's moat for 10+ tech shops, which are structurally unwinnable anyway (see below).
- **Multi-location/franchise** — PE roll-ups standardize on ServiceTitan within 12 months of acquisition; not your market.

## The segment reality (from the ServiceTitan research)

- **10+ techs: not addressable.** The phone room is the business; they need call booking, dispatch-at-scale, flat-rate pricebooks with supplier cost feeds, financing in the field, closed-loop ad attribution. Their CFOs negotiate processing to interchange-plus (0.25–0.75% markup) — a flat-2.9% monetization model is exactly what they refuse. ~Half of HVAC transactions now involve PE buyers who mandate ServiceTitan.
- **1–8 techs, sub-$1–2M revenue: the winnable segment.** ServiceTitan's own reps turn them away; Jobber/HCP charge real money ($300–600/mo all-in once processing + add-ons stack) for "80% of the functionality"; these owners don't negotiate interchange and value same-day payout over 30bps.
- Growth ceiling: shops outgrow HCP around 10–15 techs (dispatch complexity, multi-location reporting). Hub will lose graduates the same way HCP does — acceptable; don't distort the roadmap chasing them.

## What actually makes people switch (the openings)

1. **Billing-betrayal events** — renewal hikes, surprise per-user charges, add-on creep, held funds with no human reachable. This is the acquisition moment; steady-state price is tolerated.
2. **Support decline** at incumbents — answer the phone and you beat them.
3. **Flat honest pricing** — QuoteIQ gets Reddit traction purely on all-inclusive pricing vs a $674/mo Jobber stack.
4. **App reliability** — incumbents' Android apps are genuinely bad.
5. **White-glove migration** — the enabler for all of the above.

## Suggested priority order for Hub

1. **Real payments + the trust architecture** (hold policy published, payments/CRM account separation, capped ACH, no cash/check penalty, free export, "How we make money" page). Everything else is moot until money moves.
2. **SMS** — transactional first (reminders, on-my-way, quote/invoice follow-ups), bundled free; two-way business number next.
3. **QuickBooks Online sync** — one-way push MVP (customers/invoices/payments), two-way later.
4. **Recurring visit series** (weekly/biweekly) + **clock-in/out with job-level time**.
5. **Offline-tolerant mobile** — cached today-schedule + queued notes/photos.
6. **Migration concierge** — extend the importer to job history + price books; offer "we move you free."
7. **Multi-property clients** (Property model under Contact).
8. Later: consumer financing (Wisetack-style), surcharge automation, volume-tier processing rates.

---

*Full agent research with all source URLs preserved in the session that produced this doc; key sources include Jobber/HCP pricing + help pages, BBB records, Merchant Cost Consulting (ServiceTitan processing), Helcim payment-trend data, CheckThat/Capterra/G2 review aggregation, and Toast/Wave/Shopify business-model case studies.*
