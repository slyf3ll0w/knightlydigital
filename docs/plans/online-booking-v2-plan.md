# Online Booking v2 — Calendly-grade scheduling for Workbench

> **[BUILT 2026-09-02]** Phases A–C shipped in three commits (types + calls, per-member
> day start, services + pay-at-booking + form migration + old engine retired).
> Migration applied to prod 2026-09-02 (34 types / 14 companies; Knight Detail + demo
> forms converted). e2e online-booking.spec 10/10 vs prod. Embed finix check done — see §9.5.

Design written 2026-09-02 after a full read of the existing booking build, the
Route Manager, the payments layer, and a market pass over Calendly, Jobber,
Housecall Pro, ServiceTitan and Zenbooker. Nothing here is built yet. The
companion record of what shipped in July is `online-booking-build-plan.md`.

David's ask, verbatim in spirit:

1. Appointment booking that works like Calendly for phone and video calls.
2. In-person estimates whose offered times respect the drive to the address.
3. Requests go to a pool of people; assign whoever is free, round-robin when
   several are; hide the time when nobody can make it (drive time included).
4. The same thing for services, with pay-online-now for flat-rate work, only
   if it is safe to take a card through a form on the customer's own website.
5. Stay consistent with the rest of the product; an overhaul is fine.

---

## 0. Recommendation in one paragraph

Add a **Booking Type** entity (Calendly's "event type") with four kinds —
Phone call, Video call, In-person estimate, Service — each carrying its own
duration, timing rules, **pool of team members**, confirmation mode and (for
Service) payment rule. Replace the day-level "drive limit" filter with a
**per-slot drive-time feasibility check** ported from the staff-side Find a
Time engine, using the free haversine estimate for the sweep and one metered
Mapbox matrix call to verify the chosen slot at submit. Assign by
**availability first, then least-recently-assigned round robin per pool**,
decided inside the existing Serializable submit transaction. Paid service
bookings reuse the quote → job → deposit-invoice machinery that already
exists (FULL deposit type = pay in full), charged through the same finix.js
hosted fields and `/api/public/pay` logic the pay page uses, with the charge
made *after* the booking commits and unwound if the card declines. Public
surface: `/book/[slug]/schedule` (menu of types) and
`/book/[slug]/schedule/[type]`, styled by the company's existing form
appearance so embeds match what customers already have. Existing
self-scheduling forms migrate onto Service booking types with a script;
nothing customers embedded today changes URL or behavior.

---

## 1. What exists today, and where it falls short

| Area | Built (file) | Gap vs the ask |
|---|---|---|
| Public slot picker | `lib/booking-slots.ts`, `lib/booking-availability.ts`, `app/book/[slug]/BookingForm.tsx` — 30-min steps, business + per-member hours, busy = appointments (tentative included) + assigned jobs + unassigned jobs (block everyone) + time blocks, arrival windows, even-sampled 6/day cap, lead/horizon per form, Serializable re-check + 409 on race | In-person only (`type: "IN_PERSON"` hardcoded); services must have a price-book `durationMinutes`; no phone/video; no buffers; no exact-time mode |
| Drive time | `bookingDriveFilter` — Jobber-style "drive limit": only offers a member days where an existing visit (or the shop) is within N estimated minutes of the client. Haversine only. | **Day-granular.** Does not check the gap before/after the candidate slot, so a 9:00 slot can be offered when the tech's 8:00 job is 40 minutes away. |
| Drive-aware engine (staff) | `lib/find-a-time.ts` — per-gap feasibility: `prev.end + drive(prev→here) ≤ start` and `end + drive(here→next) ≤ next.start`, Mapbox matrix with haversine fallback, ranked by added drive | Staff-only (one user, one day). This is the logic to generalize. |
| Geo | `lib/geocoding.ts` (Mapbox v6, global `GeocodeCache`), `lib/routing.ts` (matrix ≤25 pts, budget-capped, 10-min cache), `Company.lat/lng`, `ContactAddress.lat/lng` | No per-user start location (day starts at the shop pin). `MAPBOX_TOKEN` is not in `.env.local.example`; unverified whether prod has it. |
| Who gets it | `pickUserForSlot` sorts by `busy.length` — but the submit route fetches busy for only the slot's own window, so every free candidate ties at 0 and DB order wins. Candidate set = every `User.bookable`. | **No pools, no round robin.** Same person wins every time. `Slot.userIds` is computed then discarded by `groupSlotsByDay`. |
| Approval loop | `Request.NEEDS_APPROVAL` + `Appointment.tentative`, `BookingApprovalBanner`, `/api/app/requests/[id]/booking` accept/decline, dashboard "Bookings to approve", dashed chips on the schedule | No instant-confirm option. Accept does not create a job. |
| Payment | `/pay/[token]` + `PayPage.tsx` (finix.js hosted fields), `/api/public/pay/[token]` (charge lock, amount caps, idempotency, surcharge, buyer-identity reuse, receipt), deposits (`lib/deposits.ts`, `DepositType NONE/PERCENT/FIXED/FULL`, per-WorkItem + company default), quote approval mints a deposit invoice | **Nothing on the booking path.** finix.js mount is copy-pasted in 4 places, no shared component. `fraud_session_id` accepted by `createTransfer` but never passed. |
| Public form gate | `resolveWebForm` 404s unless the company is Finix-approved (`paymentsGateStatus`) and not suspended; Turnstile (`lib/captcha.ts`), honeypot + 3 s speed gate, 10/hr public bucket, 200 requests/company/day | Turnstile token is not action-bound for booking. |
| Client side | Hub Visits tab shows appointments; reschedule is a *request* into the message thread (deliberate, July); `.ics` is a client-side data URI on the success screen only | No self-serve reschedule/cancel; no `.ics` in email; no video-link generation |
| Settings | `/app/settings/booking` = Forms list + `SchedulingSettingsCard` (hours, arrival window 60–240, drive limit 0–60, ZIPs); per-form "Online scheduling" card in `BookingFormBuilder.tsx` (services, lead 2–48 h, horizon 7–60 d); Team page `bookable` + working hours; Products page `durationMinutes` | Configuration is split across three pages and has no concept of "a thing people book". |

Dead weight noticed on the way: `BookingRequest` model is only ever
`deleteMany`'d (retire in the same schema pass); `roadmap.md` §3c still lists
self-scheduling and reminders as deferred.

---

## 2. Market notes that shaped the design

- **Calendly round robin** has two modes: *maximize availability* (show a slot
  if any host is free; assign by priority → fewest recent meetings → random)
  and *equal distribution* (hide a host once they are >3 ahead). Buffers
  before/after, minimum notice, rolling date range, per-host meeting limits,
  Stripe/PayPal at booking. We adopt the first mode with least-recently-
  assigned as the tiebreak, plus optional priority and per-day limits.
- **Jobber** (Connect+, ~$119/mo): two modes — *Assessment* (request + on-site
  visit, optional approval) and *Job booking* (instant one-off job). Its
  drive-time limit is powered by TravelTime and assignment is random among
  available members. Multiple booking forms per purpose since Mar 2026.
- **Housecall Pro** (all plans): arrival windows, service areas by ZIP/city
  with trip charges, "require full payment" or "require deposit" at booking,
  card on file. No drive-time awareness in booking.
- **ServiceTitan** doesn't model drive time in Scheduling Pro; it tells you to
  pad job duration. Capacity buckets, not feasible slots.
- **Zenbooker** is the drive-time reference: pads each existing job by typical
  travel time and drops slots that don't fit; optional max distance between
  jobs; territories as polygons/radius/ZIP; auto-assign Balanced/Prioritized/
  Nearest. Card required at booking, charge after the job.
- **What sells**: instant confirmation over "we'll call you"; deposits cut
  no-shows sharply (vendor numbers: 18–24% → 3–6%); a Google "Book online"
  button. **What people complain about**: double bookings, no buffers, can't
  restrict who does what, customers booking the wrong service, no-shows
  without a deposit.
- **Drive-time data**: Mapbox Matrix is 100k elements/month free then
  $2/1k — already wired and budget-capped here. Haversine × 1.3 ÷ 45 km/h is
  fine for the sweep; verify the one chosen slot with a real call.
- **Reserve with Google** is viable for small SaaS (500+ LSA partners as of
  Aug 2026) but needs an availability feed + booking server with <1 s
  lookups and a Google review. Phase-later item; design the engine so a
  `BatchAvailabilityLookup` could sit on top of it.

---

## 3. The design

### 3.1 Booking types

A `BookingType` is the thing a customer picks. One company has many. Kinds:

| Kind | Time promised | Location | Creates | Default confirmation |
|---|---|---|---|---|
| `PHONE_CALL` | exact start (Calendly style) | none; we call the number they enter | Request + Appointment(PHONE_CALL) | Instant |
| `VIDEO_CALL` | exact start | none; meeting link from the assigned member's saved link (or the type's) | Request + Appointment(VIDEO_CALL) | Instant |
| `IN_PERSON` (estimate / consult) | arrival window | customer address, service-area + drive check | Request + Appointment(IN_PERSON) | Instant (approval optional) |
| `SERVICE` | arrival window | customer address, service-area + drive check | Contact + Quote(APPROVED, snapshot) → Job(scheduled, assigned) [+ deposit invoice + charge] | Instant (required when paid) |

Fields (all per type): `name`, `slug`, `description`, `kind`, `isActive`,
`durationMinutes` (SERVICE: sum of picked services, this is the fallback),
`stepMinutes` (15/30/60 for calls; arrival-window kinds use 30),
`bufferBeforeMinutes` / `bufferAfterMinutes` (calls; for in-person the drive
*is* the buffer, with `bufferAfterMinutes` as the on-site padding),
`leadHours`, `horizonDays`, `maxPerDay` (per member, Calendly's meeting
limit; null = no cap), `maxShownPerDay` (arrival kinds only, keeps the
even-sampled 6), `confirmation` (`INSTANT` | `APPROVAL`),
`arrivalWindowMinutes` override (null = company), `meetingLink` (VIDEO
fallback), `paymentMode` (SERVICE only: `NONE` | `DEPOSIT` | `FULL`),
`clientCanReschedule` / `clientCanCancel` + `cutoffHours` (see 3.8),
`assignment` (`ROUND_ROBIN` | `PRIORITY`).

Relations: `BookingTypeMember { bookingTypeId, userId, priority Int @default(0),
lastAssignedAt DateTime? }` and, for SERVICE, `BookingTypeService {
bookingTypeId, workItemId, sortOrder }`. Service price, duration, deposit and
agreement rules stay on `WorkItem` — no duplication; the form price snapshot
idea from `FormService` goes away for booking types (the price book is the
source of truth, same as quotes).

Why an entity and not more `WebForm` config: a booking type is bookable on
its own URL, shows up in several forms, owns a pool and a rotation cursor,
and is what the schedule, the dashboard and future Reserve-with-Google feeds
refer to. That is an entity in this codebase's terms, like `WorkItem` and
`WebForm`. Forms keep their job (lead capture, styling, custom questions) and
gain a pointer: a BOOKING form's "Online scheduling" card lists which booking
types it offers instead of a private services list.

### 3.2 Availability engine v2 (`lib/booking-engine.ts`, pure, tested)

Generalizes `generateSlots` + `find-a-time`. Inputs: type rules, timezone,
company hours, `members[]` each with hours, `busy[]` intervals **carrying an
optional location** (`lat/lng` or null) and a `kind`, day-start location
(shop pin; per-member start address if set), the target location (in-person
only), `now`. Output: slots with `memberIds` (kept this time — the API still
strips ids before the client, but submit and the settings preview use them).

Per candidate `(member, start)`:

```
fits hours        member's effective hours contain [start, end)
not busy          no busy interval overlaps [start − bufferBefore, end + bufferAfter)
under daily cap   member's bookings of this type that day < maxPerDay
drive-feasible    (in-person only)
   prev = latest busy ending ≤ start that day, else day-start
   next = earliest busy starting ≥ end that day
   prev.end + drive(prev.loc → target) ≤ start
   end  + drive(target → next.loc)    ≤ next.start
   drive(prev→target) ≤ bookingDriveLimitMinutes and drive(target→next) ≤ limit   (if set)
```

`drive()` during the sweep is `estimateDriveMinutes(haversineKm)` — free, no
budget spend, same formula the Route Manager falls back to. A busy interval
with no location contributes only the type's buffer (an unlocated stop can't
be judged, so it is treated as "somewhere near"; the settings card says so).
When the target can't be geocoded (no token, over budget, bad address) the
engine degrades exactly like Find a Time: gap-fit with buffers, no drive
awareness, and the picker footer drops the "near your address" wording.

Slot is offered iff ≥1 member passes. The evenly-sampled per-day cap stays
for arrival-window kinds; call kinds list every step like Calendly.

Submit re-runs the same function for the one chosen slot inside the
Serializable transaction (existing pattern), then — new — asks
`driveTimeMatrix` for the real road minutes between prev/target/next for the
chosen member and re-checks. If the real number breaks feasibility but the
estimate passed, the next candidate member is tried; if none, 409 with the
existing "that time was just taken" copy and the picker refreshes. One
matrix call of ≤4 points per booking is well inside the free tier.

The existing `bookingDriveLimitMinutes` keeps its column and meaning
("don't send someone more than N minutes out of their way") but becomes a
per-leg limit instead of a per-day cluster. The `userAllowedOnDay` hook and
`bookingDriveFilter` are deleted once the new engine ships.

Busy sources gain locations: `getBookableUsersWithBusy` is replaced by a
`loadMembersWithBusy(pool, from, to)` that selects `address`/`propertyId`
for jobs and appointments and resolves coordinates through the same
property → geocode cache order as `lib/route-plan.ts`. Unassigned jobs and
company-wide blocks still block everyone.

### 3.3 Assignment

Decided at submit, inside the transaction, from the members who pass the
slot check:

1. `PRIORITY` mode: highest `priority` first (Calendly's star ranking).
2. Then **least-recently-assigned** by `BookingTypeMember.lastAssignedAt`
   (null sorts first). This is round robin that self-heals when people are
   added, removed or on vacation — no cursor to keep in step.
3. Then fewest bookings of this type in the next 7 days, then DB order.

Stamp `lastAssignedAt` on the winner in the same transaction. Approval-mode
bookings stamp on creation (the slot is held either way); a decline does not
un-stamp. Managers can reassign after the fact exactly as today (appointment
edit / job crew picker), which does not touch the rotation.

### 3.4 What a booking creates

- **Calls and estimates**: Contact upsert (existing dedupe) → Request
  (`NEW` when instant, `NEEDS_APPROVAL` when approval) → Appointment of the
  matching `AppointmentType`, `tentative` only in approval mode,
  `arrivalWindowMinutes` from the type, `meetingLink` from
  `User.meetingLink` else the type's. Pipeline `enterPipeline` +
  `autoAdvance(REQUEST_CREATED)`, and `APPOINTMENT_SCHEDULED` immediately
  when instant (today it fires on accept).
- **Services**: Contact upsert → Quote built from the picked WorkItems
  (`status: APPROVED`, `approvedAt`, deposit derived by
  `derivedQuoteDeposit`, agreements per `requiresAgreement`) → convert to a
  Job through the same code path `/api/app/quotes/[id]/convert` uses (extract
  the transaction body into `lib/quotes.ts` so both callers share it) with
  `scheduledAt/End`, the assigned member, address, `arrivalWindowMinutes`,
  line items, checklist → Request stays for the record with `source:
  "booking_form"` and `CONVERTED`. `recordLeadWin` runs, so the lead board
  closes the card. Reason for going through a quote: deposits, deposit
  netting on the final invoice, agreements and subscriptions for recurring
  services all key off a quote today, and a booked service is literally an
  approved quote.

The Job gets a `bookedOnlineAt` stamp (schedule chip "Booked online", like
"Awaiting approval") so dispatchers can see what the customer picked
themselves.

### 3.5 Payment at booking

Only for `SERVICE` types with `paymentMode ≠ NONE`, and only when every
service picked is `priceDisplay: FIXED` (a "From $150" or "Get a quote" item
can't be charged a number the customer didn't agree to — the editor refuses
to turn payment on for a type that lists one). Amount is server-derived from
the price book, never from the client. `FULL` = the quote's deposit is
`DepositType.FULL`; `DEPOSIT` = each service's own deposit rule with the
company default as fallback (existing `derivedQuoteDeposit`). Either way the
booking transaction ends with `createDepositInvoice(tx, quote)` — the
existing idempotent deposit invoice, `kind: DEPOSIT`, due now.

Flow on the page: the card step appears after the slot and contact steps,
using finix.js hosted fields (extracted into `components/CardFields.tsx`
from the four current copies; card only, no ACH — a bank debit that can
bounce days later is no way to confirm a visit). The customer's browser
tokenizes with Finix directly; our servers only ever see `TK…`. Submit sends
`paymentToken` with the booking.

Server order, one request:

1. Captcha (now action-bound: `"booking"`), form gate, honeypot, validation.
2. Serializable transaction: slot re-check + assignment + contact/quote/job/
   request/deposit-invoice. Commit. (A card authorization cannot be held
   inside a DB transaction, and a slot must not be consumed by a card that
   then declines, so the two are sequenced.)
3. Charge through the existing `processor.charge` with
   `acquireChargeLock(invoice.id)`, idempotency key `book-${invoiceId}`,
   `fraud_session_id` from finix.js, `metadata.invoiceId`. Surcharge shown and
   applied exactly as the pay page does when `surchargeEnabled`.
4. Decline → compensating transaction deletes the job, quote, deposit
   invoice and request (the contact stays — it is a real person), and
   returns 402 with the slot still offered so they can retry another card.
   Approved → `recordPayment` (receipt email rides along), confirmation email
   with the paid amount, `.ics`.

Safety checklist the implementation must satisfy (all have precedent in
`/api/public/pay/[token]`): Finix-approved merchant + live processor gate
(already enforced by `resolveWebForm`), server-derived amount with the
$10,000 cap, per-invoice charge lock, minute-windowed idempotency, no
merchant/onboarding ids serialized into the page (only the public
application id), `pay` rate bucket (20/hr) on the booking POST when a token
is present, refunds through the existing `/app/payments` ↺ path.

**Embedding on the customer's own website.** finix.js hosted fields are
iframes; inside our `/embed` iframe they are nested iframes on a third-party
origin. PCI scope is unchanged (SAQ A — card data never touches the merchant
page or ours), but browser storage partitioning could interfere with the
tokenizer. Plan: verify in sandbox inside an iframe on a foreign origin first
(one e2e spec). If it works, inline everywhere. If not, paid types in embed
mode show "Continue to secure checkout" which opens the hosted
`/book/[slug]/schedule/[type]` page in a new tab with contact + slot
prefilled via query string, and the customer finishes there. Either way the
hosted page is the reference surface and the embed is a convenience.

### 3.6 Public pages and embed

- `/book/[slug]/schedule` — the company's booking menu: logo, name, one card
  per active booking type (kind glyph, duration, price for services,
  "Instant confirmation" or "We'll confirm" line). `schedule` becomes a
  reserved form slug (`slugifyFormName` refuses it; migration checks no
  company already uses it).
- `/book/[slug]/schedule/[type]` — the booking page. **A stepper**, which
  July deliberately avoided for the inline form; a Calendly-style page is
  step-shaped by nature and the market examples all are: (1) service(s) or
  details, (2) address when in-person, (3) day + time, (4) your info (+ card
  when paid), (5) confirmed. Desktop: two columns, summary rail on the left
  (Calendly's layout), steps on the right; phone: one column, sticky "Next".
  Times shown in the visitor's timezone with a switcher for calls (the
  Calendly tell); arrival windows always in company time.
- `/embed/[slug]/schedule[/[type]]` — chrome-less, same `jobflow:height`
  protocol and `?theme/?accent/?font` params; the Sharing card in settings
  hands out the snippet like forms do.
- Appearance comes from the company's default form (`config.appearance`)
  so a company's booking pages and forms are one family; `ForceLightTheme`
  as on `/book`, or the form's dark theme if that is what they chose.
- Existing BOOKING forms with self-scheduling keep working: the inline
  picker stays but lists the form's booking types (service radio cards
  become type cards; when a type is SERVICE it expands to that type's
  services). Same engine underneath.
- Confirmation screen: what/when/where/who, "Add to calendar" (Google link +
  `.ics`), reschedule/cancel links when allowed, "Pay now" already done.

### 3.7 Business side

**Settings IA.** `/app/settings/booking` becomes "Online booking" with three
groups in the existing `FormsListClient` shape (card + ⋯ actions, Modal for
quick edits, `confirmSheet` for deletes):

1. **Booking types** — list with kind glyph, duration, pool avatars,
   confirmation, payment, on/off, copy link. "New booking type" opens a
   kind picker (the same radio-card idiom as `/app/appointments/new`), then
   the editor.
2. **Forms** — unchanged list.
3. **Scheduling rules** — the existing card, with the drive-limit copy
   changed to "Max drive to a booked visit" and a line explaining what
   happens without Mapbox.

Booking-type editor at `/app/settings/booking/types/[id]`, mirroring
`BookingFormBuilder.tsx` (full page, `card-ledger` sections, autosave with
the Saving…/Saved header used by SettingsClient): Basics · Timing (duration,
step, buffers, earliest, how far out, per-day limit) · **Who takes these**
(team checklist with `Avatar`, priority, "Round robin: whoever is free, then
the person who has waited longest", per-member "not bookable" warning
linking to Team) · Services (SERVICE only, `WorkItemPicker`, red flag on
items without a duration) · Confirmation · Payment (SERVICE only; disabled
with reason until Finix-approved; refuses non-FIXED prices) · Client
options (reschedule/cancel, cutoff) · Sharing (link, embed snippet, which
forms include it) · Preview (next 7 days of slots per member, using the same
engine — the fastest way for an owner to trust the drive-time rule).

**Team page.** `bookable` stays as the master switch ("Accepts online
bookings") — a member unchecked here is skipped by every pool. Add
`meetingLink` ("Video meeting link — your personal Meet/Zoom room") and
optional `startAddress` ("Starts the day from — leave blank for the shop")
beside working hours. The Route Manager picks up `startAddress` for its day
start too.

**Schedule.** Appointments already render blue with type glyphs; jobs get
the "Booked online" stamp; tentative stays dashed. No new view.

**Dashboard.** "Bookings to approve" unchanged; activity feed gains "Booked
online: Gutter cleaning, Tue 8–10 AM, paid $150" rows (instant bookings are
otherwise invisible until someone opens the schedule).

**Emails.** Existing `bookingReceived/Confirmed/Declined` templates, plus:
confirmation for calls (with the phone number or link), paid confirmation
(amount, receipt already sent by `recordPayment`), and a server-side
`lib/ics.ts` (port of the client `icsHref`) attached to confirmations and
reminders. Reminders already cover appointments and jobs day-before and
hour-before (cron is hourly).

### 3.8 Client reschedule and cancel

July's decision was request-only, and it stays the default for anything
in-person (a route was built around it). For calls, Calendly parity means
self-serve: confirmation emails carry signed reschedule/cancel links
(`/book/[slug]/schedule/manage/[appointmentToken]`), governed per type by
`clientCanReschedule`, `clientCanCancel` and `cutoffHours`. Reschedule
re-runs the engine for the same type and pool and keeps the same member when
free; cancel sets `CANCELLED` and notifies the assignee. For paid service
bookings cancel stays a request (money is involved; the refund is the
owner's call through the existing refund dialog). Owners can turn self-serve
on for in-person types if they want it.

---

## 4. Schema deltas

```prisma
enum BookingKind        { PHONE_CALL VIDEO_CALL IN_PERSON SERVICE }
enum BookingConfirmation { INSTANT APPROVAL }
enum BookingPayment     { NONE DEPOSIT FULL }
enum BookingAssignment  { ROUND_ROBIN PRIORITY }

model BookingType {
  id, companyId, name, slug (unique per company), description String?
  kind BookingKind, isActive Boolean @default(true), sortOrder Int
  durationMinutes Int, stepMinutes Int @default(30)
  bufferBeforeMinutes Int @default(0), bufferAfterMinutes Int @default(0)
  leadHours Int @default(4), horizonDays Int @default(30)
  maxPerDay Int?, maxShownPerDay Int @default(6)
  confirmation BookingConfirmation @default(INSTANT)
  arrivalWindowMinutes Int?, meetingLink String?
  paymentMode BookingPayment @default(NONE)
  assignment BookingAssignment @default(ROUND_ROBIN)
  clientCanReschedule Boolean @default(false), clientCanCancel Boolean @default(false), cutoffHours Int @default(24)
  members BookingTypeMember[], services BookingTypeService[]
}
model BookingTypeMember  { bookingTypeId, userId, priority Int @default(0), lastAssignedAt DateTime?  @@id([bookingTypeId, userId]) }
model BookingTypeService { bookingTypeId, workItemId, sortOrder Int  @@id([bookingTypeId, workItemId]) }

User        += meetingLink String?, startAddress String?, startLat Float?, startLng Float?
Appointment += bookingTypeId String?, bookedOnlineAt DateTime?, manageToken String? @unique
Job         += bookingTypeId String?, bookedOnlineAt DateTime?
Request     += bookingTypeId String?
WebForm.config.selfSchedule += bookingTypeIds: string[]   (JSON, no migration)
-  BookingRequest model + BookingStatus enum (dead)       ← contract step, manual drop first (Railway boot runs db push)
```

Expand/contract as usual: additive first, the `BookingRequest` drop and the
removal of `FormService.workItemId` self-scheduling semantics only after the
migration script has run in prod.

---

## 5. Migration and back-compat

Script `scripts/migrate-booking-types.mjs`, idempotent:

- For every company: create a Phone call (30 min) and In-person estimate
  (60 min) type, **inactive**, pool = current `bookable` users — so the
  settings page is not empty and turning on is one toggle.
- For every BOOKING form with `selfSchedule.enabled`: create one SERVICE type
  per form service that has a `workItemId` with a duration (name from the
  service, `confirmation: APPROVAL` to match today's behavior, pool = current
  bookable users), set `selfSchedule.bookingTypeIds`. Forms with no
  qualifying services are left as they are (they already fall back to the
  classic preferred-date flow).
- Refuse to run if any company has a form slugged `schedule`.

Public URLs, the `jobflow:height` message, the 409 slot-taken contract and
the approval loop are unchanged. `test-booking-slots.ts` gets ported to the
new engine and extended with drive and rotation cases;
`public-booking.spec.ts` gains a call booking, a drive-infeasible slot, a
round-robin pair, and (card-tests-enabled) a paid service booking with a
decline rollback.

---

## 6. Build order and sizes

| Phase | Scope | Size |
|---|---|---|
| A. Types + calls | Schema, `BookingType` CRUD + editor + list, engine v2 with buffers/steps/limits, pools + round robin, public menu + stepper for calls and estimates (gap-fit only), instant/approval, `.ics` mail, migration script, reschedule/cancel links for calls | ~1 week |
| B. Drive time | Located busy intervals, per-slot feasibility, matrix verify at submit, settings preview, `startAddress`, remove day-cluster filter | ~3 days |
| C. Services + pay | SERVICE kind, quote→job extraction, deposit invoice at booking, `CardFields` extraction, charge + rollback, surcharge, embed handoff decision, card e2e | ~1 week |
| D. Polish | Dashboard feed rows, "Booked online" stamps, hub "Book again", priority mode, per-day limits UI, Reserve-with-Google spike | as wanted |

A ships value on its own (Calendly for calls) and every later phase is
additive. C is the one that needs a sandbox verification session before
its embed decision.

---

## 7. Decisions David should make before A starts

1. **Default confirmation for in-person estimates**: instant (market lean,
   and drive-time makes it safe) or approval (today's behavior)? Plan says
   instant by default, approval a toggle.
2. **Self-serve reschedule/cancel for calls**: on by default? It reverses the
   July "request only" stance for one kind. Plan says yes for calls, off for
   in-person and paid.
3. **Is `MAPBOX_TOKEN` set in production?** Without it the engine is gap-fit
   only (buffers, no drive awareness) and the settings card will say so.
4. **Is paid booking (or drive-time) a Workbench Plus feature?** `hasAddon()`
   has no consumers yet; this would be the first. Plan assumes not gated.
5. **Embed payment**: inline if the sandbox iframe test passes, else the
   new-tab handoff. Needs a verification session in Phase C.
6. **Per-member start address**: include in A/B (small) or keep the shop pin?
   Plan includes it.

## 8. Risks

- Geocode budget: the engine geocodes one target per address typed; the
  400 ms debounce and ZIP-present rule stay, and the cache makes repeats
  free. Anchor geocoding is already capped at 250 addresses per lookup.
- Haversine underestimates in sprawl (DFW): the 1.3 road factor and the
  submit-time matrix verify cover the chosen slot; owners who see
  over-tight days set the per-leg limit or a buffer.
- Nested finix.js iframes on third-party sites: unverified until Phase C.
- Round robin with approval mode: a declined booking still counts as a
  turn. Acceptable; the alternative (un-stamping) makes rotation depend on
  human latency.

---

## 9. Decisions taken 2026-09-02 (David)

1. In-person estimates: **instant by default**, approval is a per-type toggle.
2. Self-serve reschedule/cancel: **calls only**; in-person and paid stay request-only.
3. `MAPBOX_TOKEN` **is set** in production.
4. **Nothing gated** behind Workbench Plus.
5. Embed payment: **inline by default** — VERIFIED 2026-09-02 that finix.js refuses to
   mount inside an iframe on a non-allowlisted origin ("Finix.PaymentForm() - Cannot be
   run in an iframe: embedding origin not allowed"), so embeds hand paid bookings to
   the hosted page in a new tab with every selection prefilled (`lib/booking-prefill.ts`).
   Hosted pages take the card inline.
6. Per-member start address: **include**.
7. Delivery: **Phases A through C without stopping**, committed per phase,
   deployed at the end.
