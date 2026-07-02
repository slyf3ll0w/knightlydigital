# Streamflaire Hub × Jobber — Gap Analysis & Build Plan (2026-07-02)

Sources: fresh Jobber trial deep-dive (`docs/jobber-research/jobber-research-2026-07-02.md`), June build spec (`jobber-build-spec.md`), and a full codebase inventory of Streamflaire Hub as-built.

## Honest topline

Streamflaire Hub has already cloned Jobber's **paperwork core** well — quotes (optional items, deposits, discounts, agreements/e-sign), deposit invoices, recurring subscriptions, client portal, multi-form intake, team roles, CSV import, price books, review requests. In several places it's *ahead of Jobber's value line* because Jobber paywalls things Streamflaire ships free (review requests, quote optional items, automations-tier features, SMS-class comms via email).

What it's missing is Jobber's **operating loop**: the client books themselves into your calendar, the business taps "Accept," and everything after that is nudged along automatically (reminders, follow-ups, "close this job?" prompts). Jobber includes online booking in its cheapest $29 plan — a free Jobber alternative isn't credible without it. That's the #1 gap.

The second honest finding: **several shipped features are still switched off in production** (emails need Resend DNS verification, captcha needs Turnstile keys, recurring/reminder cron needs an external trigger, payments blocked on Finix/BotPay). Turning those on beats building anything new.

Where Jobber is heading (AI marketing suite, AI receptionist, website builder, paid Pipeline) is *not* where Streamflaire should chase — those are Jobber's monetization layers. Streamflaire's wedge stays: **the whole FSM core, free, monetized by payments** — with a distinct Paper Ledger identity instead of SaaS-generic.

## Cross-reference table

| Area | Jobber (2026-07 live) | Streamflaire today | Verdict |
|---|---|---|---|
| Intake forms | Multi-form, field palette, embeds, consent language, confirmation msg/redirect | Multi-form WebForms (3 types), embeds, anti-spam, custom-field mapping, auto-quote | **Parity**, minus booking block + consent text + confirmation redirect |
| **Online booking** | Slot picker (arrival windows from duration + business hours + team availability), service areas, needs-approval loop, Accept & Schedule, client reminders | Booking form collects a *preferred date* only; no slots, no availability, no approval loop | **Gap #1 — build** |
| Quotes | Optional items (opt-in), deposit **or payment schedule**, per-item images, templates/AI draft, preview-as-client, signature | Optional items (opt-out), per-service+default deposits incl. FULL, agreements gate, e-sign, client hub view | **Near-parity**; missing payment schedules, per-item images, preview-as-client button |
| Deposits | Set on quote → collect via processor on approval | Auto deposit-invoice on approval + manual collect (built 6/13) | **Parity** (better offline story; needs processor for online) |
| Recurring | Visit-schedule presets on job (weekly/biweekly/monthly/as-needed/custom) | Billing-first Subscription engine (+optional job), needs cron | **Different shape**; Jobber schedules visits, we schedule billing. Add visit-series later; wire cron NOW |
| Requests | KPI strip, needs-approval, assessment w/ reminders, labor on request | Request inbox (NEW/CONVERTED/ARCHIVED), convert to appointment/quote | Partial — add approval status + reminder plan |
| Dashboard | 4-card workflow strip, deep-linked counts, appointments KPI, performance rail | "Needs you" feed + today timeline + performance rail | **Parity-plus** (ours is more opinionated); keep |
| Schedule | Month/week/day, map, route optimization, arrival windows, visit titles | Month/week/day, drag, anytime row, unscheduled drawer, team filter | Parity except map/routing (skip) + arrival windows (cheap, do) |
| Invoices/payments | Terms table (res/comm defaults), collect screen, methods incl. Venmo/Zelle, processor | Manual methods enum, surcharge, deposit netting, terms per client | Parity for manual; **processor still stubbed (Finix)** |
| Automations | 6 visible recipes + custom builder (paid) | Reminders cron + follow-ups partially built, invisible to user | Build the **recipes settings page** (Phase 2 emails) |
| Insights | Goal tracking, heatmap, funnel, conversion rates, P&L/job, cashflow, 23 reports | Revenue/expenses/profit + lead source | Add 4-5 cheap widgets; skip heatmap/AI |
| Reviews | **Paid add-on**: auto-ask on triggers, AI replies, trends | Free auto review request on completion | **Advantage us — market it**; add trigger choice later |
| Checklists | Form builder, 8 question types, auto-attach | None | Later (simple per-job checklist v1) |
| Timesheets | Day/week, approve → payroll, GPS assessment timing | None (labor absent from costing) | Later/optional for 1-5 crews |
| Marketing suite / AI receptionist / Pipeline / website | Paid add-ons | None | **Don't chase.** Pipeline's win/loss reasons = cheap steal. PageBot covers websites as a separate Knightly offer |
| Client hub | Tokenized, per-form access, primary-CTA choice, referrals w/ tracked links, Contact Us | Magic-link portal, quotes/invoices/requests/agreements | Parity core; add referral link + form-access control later |

## The plan

### Phase 0 — Turn on what's already built (David + trivial code, this week)
1. Verify Resend DNS, send test email; flip on the whole email layer.
2. Wire external daily cron (Railway cron or pinger) → `/api/cron/recurring` (subscriptions + payment reminders currently rely on manual "Run due now").
3. Add Turnstile keys; `railway login` re-auth; confirm Postgres backups.
4. Delete dead stubs in `lib/payments.ts` (superseded by lib/email.ts / lib/reminders.ts); retire legacy `ServicePlan`/`BookingRequest` models when convenient.

### Phase 1 — Online booking + approval loop (the headline build, ~1-2 wks)
- Schema: `Company.businessHours` (Json), `WorkItem.durationMinutes`, `Company.serviceZips` (or per-form), `User.bookable`, `Request.status += NEEDS_APPROVAL`, `Appointment.confirmedAt`.
- Slot engine: business hours ∩ bookable-user availability (existing jobs/appointments) → 30-min-increment start times rendered as **arrival windows** (start + duration), timezone-aware.
- BOOKING WebForms become multi-step wizard: contact → details/photos → **slot picker** → review → submit ⇒ Request(NEEDS_APPROVAL) + tentative Appointment; confirmation page with "awaiting confirmation" + Add to Calendar.
- Business side: "Needs approval" in Needs-you feed + requests list; request detail gets **Decline / Accept and Schedule**; accept ⇒ confirm appointment + email client; decline ⇒ archive + optional message.
- Reminder emails: 1h before + 1-day-before (uses Phase 0 cron). ZIP-based service-area check on the address step.

### Phase 2 — Automations made visible (email Phase 2, already roadmapped)
`/app/settings/automations` page of toggleable recipes, Jobber-style wording: quote follow-up 2d + 5d after send · invoice follow-up on due date + 3d after · request auto-archive · review request on job close (already live — show it here) · visit/appointment reminders · quote-approved receipt + payment receipt. All email now; SMS column greyed "coming soon" (future paid wedge).

### Phase 3 — Money & insight upgrades (~1 wk)
- **Payment schedules** on quotes (extend deposit model: N named payments %/$, per-payment required-deposit flag, Remaining tracker; mints sequential invoices).
- **Win/loss reasons** when archiving quotes (+ tiny report) — stolen from paid Pipeline, free with us.
- Insights widgets: quote conversion rate, aged receivables (30/60/90), projected income (due today/<7d), client re-engagement (no job in 12 mo), optional revenue goal.
- Work settings: payment-terms presets (res/comm defaults), default arrival window + style, "use quote/job title as invoice subject."

### Phase 4 — Polish parity (grab-bag, as time allows)
Preview-as-client button on quotes/invoices · per-item images on quote lines · per-client scoped Create menu on client page · consent checkboxes + confirmation message/redirect on forms · referral link in portal (tag referrer on new lead) · "Free Assessment" seeded in all industry price books (Jobber's smartest default).

### Phase 5 — When Finix/BotPay lands
FinixProcessor implementation → online deposit collection at approval, card-on-file, auto-charge subscriptions, payment-methods insight widget. (Everything upstream is already plumbed for this.)

### Deliberate skips
Map/route optimization, QuickBooks sync, AI website/social/receptionist, full checklist builder (simple checklist maybe later), timesheets/payroll, chemical tracking, review-trend/competitor dashboards.

## Positioning line
"Everything in Jobber's $29-199 plans that a 1-5 person crew actually uses — booking, quotes, deposits, invoices, reminders, reviews, client portal — free. We make money when you get paid, not before."
