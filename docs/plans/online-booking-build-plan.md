# Online Booking — build plan (written 2026-07-02, for a future session)

The #1 gap vs Jobber per the 2026-07 trial research (`docs/jobber-research/jobber-research-2026-07-02.md`).
Jobber ships self-scheduling even on its $29 Core plan; Streamflaire's BOOKING forms only collect a
request and make the client wait for a callback. This plan turns them into true self-scheduling with
an owner-approval loop. Companion phase list: `docs/plans/jobber-parity-plan-2026-07.md`.

Status at time of writing: CRUD/cohesion overhaul complete (all 4 batches shipped 2026-07-02,
commits 614f3d3 / eed2e0a / 1652b45 / e822b2b). Resend + Turnstile configured. Cron endpoint built
but scheduler wiring unverified (see Phase 0).

## Phase 0 — verify/wire the daily cron (prerequisite, ~5 min)

`app/api/cron/recurring/route.ts` already exists: POST with `Authorization: Bearer $CRON_SECRET`
runs (1) due-subscription billing and (2) payment reminders. Both idempotent. Booking reminder
emails (below) will ride the same endpoint, so it must actually fire daily.

Checklist:
1. Confirm `CRON_SECRET` is set in Railway env vars (endpoint returns 503 if unset).
2. Confirm something POSTs it daily — Railway cron service, cron-job.org, or a GitHub Actions
   schedule. Nothing in the repo does this today; David may have configured it in a dashboard.
3. Verify: active subscription's `nextRunDate` advances after a run, or curl the endpoint and
   check the JSON counts.

## Phase 1 — the booking build (~1–2 weeks)

### 1. Schema deltas (Prisma migration — this repo migrates safely; the PostDragon
`db push` warning does NOT apply here, but still use `prisma migrate dev`)

- `Company.businessHours Json?` — `{ mon: [{start:"08:00", end:"17:00"}], ... }`, null = closed.
- `Company.serviceZips String[]` (or Json) — empty = no restriction. Consider per-WebForm override later.
- `Company.defaultArrivalWindowMinutes Int @default(120)` — how wide the promised window is.
- `WorkItem.durationMinutes Int?` — how long the service takes; null = not self-bookable.
- `User.bookable Boolean @default(false)` — which team members accept online bookings.
- `enum RequestStatus` += `NEEDS_APPROVAL` (currently NEW/CONVERTED/ARCHIVED).
- `Appointment.confirmedAt DateTime?` — null until the owner accepts (tentative).
- `WebForm` (BOOKING type): add config keys in its Json for "enable self-scheduling",
  which services are offered, and lead-time rules (e.g. earliest slot = now + 4h, horizon = 30 days).

### 2. Slot engine (`lib/booking-slots.ts`, pure + unit-testable)

Inputs: company (hours, timezone, arrival window), service duration, bookable users with their
existing jobs + appointments in the horizon, lead-time rules.
Algorithm: for each day in horizon → business hours → 30-min-increment candidate starts →
a slot is open if ≥1 bookable user has no overlapping job/appointment for [start, start+duration].
Output: arrival windows ("Tue Jul 8, 8:00–10:00 AM"), timezone-aware via `Company.timezone`
(now editable in Settings). Cap displayed slots per day (~6) like Jobber.
Edge cases: DST transitions (compute in company TZ, store UTC), concurrent double-booking
(re-check availability inside the submit transaction; degrade to NEEDS_APPROVAL-without-slot if lost).

### 3. Public booking wizard (extend `/book/[slug]` + `/embed/[slug]` for BOOKING forms)

Steps: contact info → service + details/photos → **address (ZIP service-area check here — fail
fast with a friendly "outside our service area" message)** → slot picker → review → submit.
Submit (one transaction): upsert Contact (existing dedupe logic) → Request status NEEDS_APPROVAL →
tentative Appointment (IN_PERSON, `confirmedAt: null`, assigned to the matched bookable user).
Confirmation page: "awaiting confirmation" + .ics Add-to-Calendar. Keep Turnstile anti-spam.
Embed protocol: keep `jobflow:height` messages working.

### 4. Approval loop (business side)

- Needs-you feed (dashboard) + requests list get a "Needs approval" section/stamp.
- Request detail: **Accept and Schedule** (sets `confirmedAt`, request → NEW or straight to
  CONVERTED if it also creates work, emails client confirmation) and **Decline** (archives request,
  cancels tentative appointment, optional message in the email).
- Schedule views: tentative appointments render dashed/hollow until confirmed.

### 5. Emails (Resend, templates in the existing mail lib)

- Client: "booking received (awaiting confirmation)" → "confirmed" or "declined".
- Reminders: 1 day before + 1 hour before confirmed appointments. Daily one rides the Phase 0 cron;
  the 1-hour one needs the cron to run hourly instead of daily (same endpoint, gate each sweep by
  frequency) — simplest: run cron hourly, let the daily sweeps no-op via their idempotency guards.

### 6. Settings UI

`/app/settings/booking` gains: business hours editor (per-day ranges), service durations
(inline on Products & Services rows), bookable toggle on Team page, service-area ZIPs,
arrival-window width, lead-time/horizon.

### Build order within Phase 1
schema → slot engine (+tests) → settings UIs → wizard slot step → submit transaction →
approval actions + feed → emails/reminders → embed + polish pass.

## Later phases (from the parity plan — see jobber-parity-plan-2026-07.md for detail)

- **Phase 2 — Automations made visible**: `/app/settings/automations` toggleable recipes page
  (quote follow-ups 2d/5d, invoice follow-ups, request auto-archive, review request, visit
  reminders, receipts). Email now; SMS column greyed "coming soon".
- **Phase 3 — Money & insights**: payment schedules on quotes (N named payments), win/loss
  reasons on quote archive + report, insights widgets (conversion rate, aged receivables 30/60/90,
  projected income, re-engagement), work settings presets.
- **Phase 4 — Polish parity**: per-item images on quote lines, consent checkboxes + custom
  confirmation/redirect on forms, referral links in portal, "Free Assessment" seeded in price books.
- **Phase 5 — Finix/BotPay**: online deposit collection at approval, card-on-file, auto-charge
  subscriptions.
- **Deliberate skips**: routing/maps, QuickBooks, AI suite, timesheets, chemical tracking.

## Non-goals for Phase 1
No payment at booking time (Phase 5), no SMS (future paid wedge), no multi-visit/recurring
booking, no client rescheduling from the portal (they reply to the email; maybe later).
