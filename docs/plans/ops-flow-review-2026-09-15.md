# Operating-flow review — 2026-09-15

Code-level review of the systems a home-service company runs on daily that we
cannot exercise without actually running one: request → appointment → quote →
job → invoice → payment, scheduling/dispatch/routes, recurring billing and the
crons, online booking and the client hub. Repo at `ba27302`. Five reviewers
read the flows end to end; every finding below was re-verified by reading the
exact lines. Nothing has been fixed yet.

CONFIRMED = the causing lines were read. PLAUSIBLE = likely, a runtime detail
could save it.

## Tier 1 — money or customers wronged under normal use

1. **Full refund of a surcharged card payment leaves the surcharge in the balance.** CONFIRMED.
   `app/api/app/payments/[id]/refund/route.ts:59-62` only decrements `Payment.amount`; `surchargeAmount` stays. `lib/payments.ts:620-633` balance = total + Σsurcharge − Σpaid, so after a full refund the client owes total + old surcharge, and /pay surcharges that again. Partial refunds skew the same way.
   Fix: reduce `surchargeAmount` proportionally in the same update (zero on full refund); mirror in the webhook's reversal-failed restore.

2. **Deleting a quote orphans its PAID deposit invoice → client billed the deposit twice.** CONFIRMED.
   `app/api/app/quotes/[id]/route.ts:270-288` DELETE has no invoice check; Invoice.quote relation defaults to SetNull. `app/api/app/invoices/route.ts:153-170` and `lib/deposits.ts:143-165` find deposits by quoteId, so the final invoice gets no "Deposit applied".
   Fix: refuse DELETE when invoices/contracts exist ("archive instead"), same rule as request DELETE.

3. **Partially paid deposit invoice is never credited nor retired.** CONFIRMED.
   `lib/deposits.ts:129-135` counts only `status: PAID` deposits; `invoices/route.ts:152-172` only deletes deposits with zero payments. /pay allows "Another amount" on DEPOSIT invoices (`app/pay/[token]/PayPage.tsx:89-90`). $200 paid on a $500 deposit → final invoice bills full gross and the deposit keeps getting dunned.
   Fix: net Σpayments across deposit invoices and archive the partial one when the final invoice mints, or block partial pay on `kind === "DEPOSIT"`.

4. **Deposit invoice minted before approval goes stale after a quote edit; approval reuses it and skips the pay-link email.** CONFIRMED.
   `quotes/[id]/collect-deposit/route.ts:33-35` allows Collect deposit in DRAFT/AWAITING/CHANGES_REQUESTED; a full edit (`quotes/[id]/route.ts:86-94,190-197`) never touches it; `lib/deposits.ts:69-79` returns the old one with `created:false`; `app/api/public/quote/[id]/route.ts:143-168` emails only when created. Quote revised $1,000→$3,000 collects $500 instead of $1,500.
   Fix: on edit/approval, delete and re-mint an unpaid DEPOSIT invoice at the new amount (or block edits while one is outstanding).

5. **Autopay treats every processor/config failure as a card decline; message regex can hard-stop autopay.** CONFIRMED.
   `lib/payments.ts:282-284` returns `{success:false}` for any FinixError or thrown error; `lib/auto-charge.ts:126,172-228` burns an attempt, emails the CLIENT "your card declined", pushes owners. `classifyDecline` (`auto-charge.ts:48-52`) regex-matches the message, so "invalid credentials"/"not permitted"/"unsupported" errors class HARD and autopay stops permanently on that invoice. A 40-minute Finix outage on the 1st tells every plan client their card declined.
   Fix: return a distinct transient outcome for 5xx/401/429/timeout/non-Finix errors and route it to the existing "processor down → retry +24h, no attempt burned, no client email" branch (`auto-charge.ts:327-331`).

6. **Telnyx webhook eats real customer texts and can opt them out across tenants.** CONFIRMED.
   `app/api/public/webhooks/telnyx/route.ts:27-28` — `STOP_RE` includes `cancel|end|quit` and `START_RE` includes `yes`, both with `\b`. "Cancel Friday's visit please" → `smsOptOut=true` for every Contact with that number in EVERY company, message dropped. "Yes, that works" after a team reply → dropped, never lands in the thread (`:82-91`).
   Fix: only whole-body keywords (`/^\s*(stop|stopall|unsubscribe)\s*$/i`), drop cancel/end/quit/yes, land everything else via `landInboundSms`, scope the opt-out update to the receiving company.

7. **SERVICE booking items set to "Hold for approval" are confirmed instantly.** CONFIRMED.
   `lib/booking-checkout.ts` never reads `type.confirmation`: request `CONVERTED` (:110), job created (:167), "confirmed" email + .ics (:286). `lib/booking-types.ts:223` only forces INSTANT when a payment mode is set; the editor shows the Confirmation card for every scheduled item and the button says "Request this time".
   Fix: force INSTANT for `kind === "SERVICE"` in `sanitizeBookingSettings` and hide the card, or implement the tentative path for service bookings.

8. **Declined booking card unwinds the job but leaves a live recurring Subscription and marks the lead Won.** CONFIRMED.
   `lib/booking-checkout.ts:344-356` unwind deletes quote/invoice/job/request only; `lib/quote-convert.ts:100-108` already ran `ensureSubscriptionsForContact` + `recordLeadWin` in the same tx. The cron then mints invoices/jobs and auto-charges someone who never booked.
   Fix: delete subscriptions created in that tx and restore pipeline status in `unwind()`, or run those two side effects only after a successful charge.

9. **Pause → resume within the 4-week visit horizon leaves a hole in the calendar.** CONFIRMED.
   `app/api/app/subscriptions/[id]/route.ts:306-313` deletes future visits on pause; `nextVisitDate` (already ~28 days ahead, `lib/subscriptions.ts:957-1026`) is never rewound; resume's roll-forward (`[id]/route.ts:236-250`) is a no-op for a future cursor. Weekly mow paused May 1, resumed May 4 → no visits until May 29.
   Fix: on pause/cancel (or resume) set `nextVisitDate` to the earliest deleted visit's date / first on-cadence date ≥ today.

10. **"Ready to bill" lists work that Bill Ready Work never bills.** CONFIRMED.
    `app/platform/subscriptions/page.tsx:43` pools visits for series `status != CANCELLED` (PAUSED included); `billAllReadyWork` (`lib/subscriptions.ts:749-770`), `runMonthlyConsolidations` (:808) and `billSubscriptionNow` (:841-848) bill only `ACTIVE`. Cancelled series' completed visits are invisible and never invoiced.
    Fix: bill pools for PAUSED/CANCELLED series too, or auto-bill the pool on pause/cancel.

11. **A late first payment silently skips a billing cycle.** CONFIRMED.
    `lib/payments.ts:480-512` `anchorPlanFromFirstPayment` sets `nextRunDate = paidAt + interval` ignoring the cycle the issued invoice covered. Plan created Sep 1, paid by link Sep 28 → next bill Oct 28; Oct 1–27 never billed.
    Fix: anchor day-of-month only; `nextRunDate = max(current cursor, next occurrence of anchor day)`.

12. **Archiving a client leaves their series billing, visiting, and being dunned.** CONFIRMED.
    `app/api/app/contacts/[id]/route.ts:133-138` only flips status; `runDueSubscriptions`, `generateDueVisits`, `runDueReminders`, `runAutoChargeRetries` never check `Contact.status`.
    Fix: on archive, pause/cancel ACTIVE subscriptions + delete future visits; exclude ARCHIVED contacts from reminder queries.

13. **"Convert to Job" can create two jobs from one quote.** CONFIRMED.
    `quotes/[id]/convert/route.ts:38` checks `jobId` outside the tx on a pre-loaded quote; `convertQuoteToJob` never re-checks; `withDocNumberRetry` (:74) re-runs with the stale object. Double-tap on a phone (`QuoteActions.tsx:304-311` button not disabled while busy) or two staff → two Job #s, one orphaned on the schedule.
    Fix: inside the tx `updateMany({ where: { id, jobId: null, status: { not: "CONVERTED" } } })` and throw on count 0; disable the button while busy. Same pattern for public approve (`public/quote/[id]/route.ts:52-54,129-140`, PLAUSIBLE second deposit invoice) — add a partial unique index on Invoice `(quoteId) WHERE kind='DEPOSIT'`.

14. **Optimize "Apply" re-times the whole day after a job whose end is on a later day; ignores blocked time; moves already-done jobs.** CONFIRMED.
    `route-plan/optimize/route.ts:171-196` `durationOf` = end − start with no day clamp, so a Mon→Tue install pushes Monday's remaining stops to Tuesday evening (and texts clients if notify is on). `:73-79` filters stops to jobs/appointments, so manual + Google busy blocks never enter the walk (only post-hoc warnings, truncated at 8). Both optimize and `schedule/shift-day/route.ts:70-87` include ACTIVE jobs whose `scheduledAt < now` or that have an open clock entry, so a mid-day "Move the day" reschedules and notifies this morning's finished visits.
    Fix: clamp per-stop duration to the day window; advance the cursor past overlapping blocks/tentative/phone appointments; for today, exclude past-start items or pre-uncheck them in the sheet.

15. **Undo after "Text client" / "Move the day + notify" never tells clients the visit is back.** CONFIRMED.
    `ScheduleClient.tsx:373-377` drag undo commits with no notify; `:768-771` shift-day undo posts without `notify`. Six clients told "Wednesday", owner taps Undo, calendar says Tuesday, nobody is texted.
    Fix: when the toast is in the notified state, send the undo through notify-move / `shift-day { notify: true }`, or warn.

## Tier 2 — workflow dead-ends and drift

16. **Converting a NEEDS_APPROVAL request to a quote/job strands the tentative appointment.** CONFIRMED (found independently by two reviewers). `RequestActions.tsx:131-148` offers Convert for every status; `quotes/route.ts:160-163` and `jobs/route.ts:193-194` set CONVERTED unconditionally; `requests/[id]/booking/route.ts:60-65` then refuses accept/decline; appointment PATCH exposes no `tentative`. Slot blocked forever, no reminders, client's hub says "Awaiting confirmation" indefinitely. Fix: only flip NEW→CONVERTED, or confirm/cancel the tentative appointment in the same tx; hide Convert while NEEDS_APPROVAL.
17. **Deleting an invoice leaves its job "Closed" with no bill and no way back to the invoicing queue.** CONFIRMED. `invoices/[id]/route.ts:229-232` vs `invoices/route.ts:224-231` (create moved the job to ARCHIVED); `JobActions.tsx:221` hides Create Invoice on ARCHIVED. Fix: on delete, set the job back to REQUIRES_INVOICING and clear `closedAt`.
18. **Editing an archived invoice silently resurrects it as PAST_DUE and resumes dunning.** CONFIRMED. `invoices/[id]/route.ts:130-136`; Edit shown for every status but PAID (`InvoiceActions.tsx:421`). Fix: keep ARCHIVED unless the edit makes it fully paid.
19. **"Sales + Tech" (USER) role can complete any job but Create Invoice opens an empty editor.** CONFIRMED. `lib/permissions.ts:179-193` `jobScope(USER)` = all jobs, `viaContactScope(USER)` = assigned contacts only; `invoices/new/page.tsx:16-31` prefill resolves null; POST rejects the contact. Result: unlinked invoice + job stays in Requires Invoicing (double bill later). Fix: scope job-linked invoice creation by `jobScope`.
20. **USER-role dispatcher's appointment reassignment is silently dropped (200 returned).** CONFIRMED. `appointments/[id]/route.ts:101` gates `assignedToId` on `isManager`; board drag (`ScheduleClient.tsx:325`) and map hand-off (`RouteMapClient.tsx:630-656`) let USER do it; time change applies, tech does not. Fix: gate on `isManager || USER` (match jobs PATCH) or 403.
21. **Completing/closing a job does not end the tech's open clock entry; the next clock-in closes it at that later time.** CONFIRMED. `jobs/[id]/status/route.ts` writes no TimeEntry; `jobs/[id]/clock/route.ts:73-76` auto-close = new clock-in time → 16-hour entries, inflated labor cost. Fix: end the actor's open entry on completion; cap the auto-close.
22. **TECH can "Close Job without invoicing".** CONFIRMED. `status/route.ts:15,21` only blocks SALES; `JobActions.tsx:248-256` shows the item to everyone. Job never billed, nobody notified. Fix: require manager/money role for ARCHIVED on an uninvoiced job.
23. **Manual "Collect Payment" has no overpayment or status guard.** CONFIRMED. `payments/route.ts:36-63` only checks `amount > 0`; `recordPayment` flips PAID on any amount ≥ total; payments accepted on PAID/ARCHIVED and the invoice page offers it there (`InvoiceActions.tsx:491`). Fix: reject `amount > invoiceBalance + 0.005` and PAID/ARCHIVED.
24. **A remaining balance under $1.00 can never be paid online.** CONFIRMED. `public/pay/[token]/route.ts:75-83` rejects `payAmount < 1` whenever an amount is sent; `PayPage.tsx:221` always sends one. $0.50 remainder sits PAST_DUE with reminders. Fix: apply the $1 floor only when `payAmount < balance`.
25. **Quote expires at noon on its "valid until" day.** CONFIRMED. `QuoteEditor.tsx:189` stores `T12:00:00`; `public/quote/[id]/route.ts:58` compares as an instant. Fix: compare against end of day in company tz.
26. **Terms-derived due dates are wall-clock, not noon-anchored → PAST_DUE flips the evening of the due day; Net-0 engine invoices get the "due" reminder in the same minute as the invoice.** CONFIRMED. `invoices/route.ts:133-138`, `invoices/[id]/send/route.ts:104-111`, `invoices/[id]/status/route.ts:63-65`, `lib/deposits.ts:100-101`, `lib/subscriptions.ts:365` all do `now + days*86400000` while `lib/due-dates.ts` assumes noon UTC. Fix: one shared helper (UTC day + N at T12:00Z); skip the "due" stage for invoices issued < 24h ago.
27. **Internal "Mark Approved" skips the approval side effects the client path runs (deposit invoice, ON_APPROVAL agreement), and is offered from DRAFT/ARCHIVED.** CONFIRMED. `quotes/[id]/route.ts:225-239` vs `public/quote/[id]/route.ts:143-155`. Fix: route both through one helper; restrict to AWAITING/CHANGES_REQUESTED.
28. **Deposit / booking-accept emails fail silently; the route reports success.** CONFIRMED. `lib/email.ts:366-440` returns false on no key / blocked company / Resend error; ignored by `collect-deposit/route.ts:67-80`, `requests/[id]/booking/route.ts:139-164`, `public/quote/[id]/route.ts:179-187`. (`quotes/[id]/send` correctly 502s.) Fix: return `emailed:false` and show it; log to activity.
29. **Reminder stages are permanently burned while a company's email is blocked.** CONFIRMED. `lib/reminders.ts:58` checks only global `emailEnabled()`, then claims the stage; `lib/email.ts:327-372` returns false per company when Finix state ≠ APPROVED and not `paymentsWaived`. A graduated Workbench123 company in PROVISIONING for 4 days loses every 3/7/14-day reminder that came due. Fix: check `companyEmailBlocked` before claiming, or delete the claim when send returns false.
30. **Cron failures return HTTP 200 `ok:true`; a dead cron is completely silent.** CONFIRMED. `app/api/cron/recurring/route.ts:78-90,147`; `console.error` never reaches Sentry; the "billing behind" alarm lives in reconcile, which runs from the same cron. Fix: `Sentry.captureException` in `step`, non-2xx/`ok:false` on money-step errors, external dead-man check on `ReconcileRun.startedAt`.
31. **Approval bookings never expire and nobody is nudged.** CONFIRMED by absence (no sweep references `tentative`/`NEEDS_APPROVAL`). A spam "hold for approval" at Sat 8am blocks that slot for weeks. Fix: auto-decline N hours before `scheduledAt` / after X days + daily "awaiting approval" push.
32. **Hub tokens are permanent; no revoke/rotate.** CONFIRMED. `hubToken` written only on create; portal-invite re-sends the same token; every hub API incl. saved-card management keys off it. Fix: "Reset portal link" action + `hubTokenRevokedAt`.
33. **Duplicate contacts (and second hub token): email match case-sensitive, phone format-sensitive.** CONFIRMED. `lib/booking-submit.ts:110-115`, `public/book/[slug]/route.ts:119-121`, staff create stores raw. Fix: lowercase email / digits-only phone compare (`mode: "insensitive"` or a `phoneDigits` column), normalize on create/import.
34. **Inbound SMS can land in another company's thread when the same phone is a client at two tenants.** CONFIRMED logic. `webhooks/telnyx/route.ts:108-125` picks by most recent PortalMessage across ALL companies; automated reminders aren't PortalMessages. Fix: record sending company per outbound SMS (to/from pair) and route by it.
35. **Multi-day timed blocks (incl. Google busy) vanish from middle days when company tz is west of the server tz.** CONFIRMED code path. `schedule/page.tsx:151-168` splits at server-local midnight (`setHours`); no `TZ` pinned in nixpacks/railway. Fix: split with `wallTimeToUtc`/`localDayParts` in company tz.
36. **Cron outage catch-up bills one cycle per hourly tick.** CONFIRMED. `lib/subscriptions.ts:1107-1121,330-338` advance one interval per tick; visit generator and resume already fast-forward. Fix: roll the cursor past `now` after one catch-up invoice.
37. **Webhook reversal reopens the invoice with autopay dead; `no_card` retries loop forever with no owner notice.** CONFIRMED. `webhooks/finix/route.ts:153` never re-books `autoChargeNextAt`; `auto-charge.ts:327-331` pushes +24h indefinitely. Fix: set `autoChargeNextAt = now+24h` on reversal; give up + owner push after N days of no card.
38. **Deactivating a tech leaves up to 4 weeks of visits on them and strands `visitAssigneeIds`.** PLAUSIBLE. `team/[id]/route.ts:91-95`. Fix: reassign/unassign future assignments, strip the id from every series, surface affected series.
39. **Booking charge-step exceptions (timeout/5xx) leave a confirmed unpaid job or a paid-but-unrecorded one; autopay timeouts after Finix created the transfer re-charge on retry.** PLAUSIBLE. `lib/booking-checkout.ts:202-247` unwinds only on `!charge.success`; `lib/finix.ts:98` 20s abort + minute-windowed idempotency (`payments.ts:257`) means Saturday's retry is a real second charge; reconcile only verifies transfers we recorded. Fix: unwind on throw; treat abort/5xx as "unknown" and look up transfers by `tags.invoiceId` before retrying, or use a per-invoice-per-attempt idempotency id.
40. **Free-text job addresses geocode with no country/proximity bias and bad results cache forever.** PLAUSIBLE. `lib/geocoding.ts:389-418`. "412 Oak St" in another state inserts a 6-hour drive and reorders the day. Fix: `country=us` + `proximity=<company>`, reject low relevance / other state, don't cache those.
41. **Calendar drive-gap labels use the wrong "from" stop when an Anytime job is in the chain; false red "tight" gaps.** CONFIRMED. `lib/route-plan.ts:107-129` vs `ScheduleClient.tsx:799-816`. Fix: exclude Anytime/all-day stops from the chain server-side (as Find-a-Time does).
42. **"Text client" after a resize-only drag sends "moved … (was …)" with an identical window.** CONFIRMED. `ScheduleClient.tsx:369,484-489`. Fix: require a start change for `canNotify`.
43. **Round-trip toggle in the Optimize preview discards a manual reorder.** CONFIRMED. `RouteMapClient.tsx:614` re-solves instead of passing `preview.stops` order. Fix: pass the current order.
44. **Two different customers booking the same company at the same moment get a false "That time was just taken".** PLAUSIBLE. Serializable txs both read the request-number max + ±24h window; P2034 → 409 with no retry (`lib/booking-submit.ts:233-235`). Fix: retry 2–3× on P2034 before surfacing 409.
45. **Public booking/request POSTs and hub "Request more work" have no per-IP/per-token limiter; captcha fails open until `TURNSTILE_SECRET_KEY` is set.** PLAUSIBLE (env-dependent). `lib/captcha.ts:52-53`, `public/schedule/[slug]/[type]/route.ts:117-121`, `public/book/[slug]/route.ts:100-104`, `hub/requests/route.ts`. Fix: `limit()` on all three, matching hub messages.
46. **Manager can assign an appointment to a TECH who can never open it.** CONFIRMED. `appointments/route.ts:58-66` accepts any active user; pages/PATCH require `canSell`. Fix: filter the picker to `canSell` roles or let a TECH read/complete their own.
47. **Job PATCH accepts `status`, bypassing the checklist gate, timestamps, plan-billed redirect and per-visit billing.** CONFIRMED path, API-only today. `jobs/[id]/route.ts:94-99`. Fix: drop `status` from the PATCH data set.
48. **A quote can be linked to a request belonging to a different client.** CONFIRMED, low likelihood. `quotes/route.ts:57-60` looks the request up by `{id, companyId}` only. Fix: add `contactId` and 400 on mismatch.
49. **Deposit/discount PERCENT unclamped server-side** (150% deposit invoice). `quotes/route.ts:131-135`, `quotes/[id]/route.ts:190-197`; `sanitizeDeposit` exists in `lib/deposits.ts` but isn't used. Fix: use it.
50. **Drafts are payable/chargeable without being issued** (no `issuedAt`/`dueDate` stamped, so a partially paid draft can never go past due). PLAUSIBLE, low. `public/pay/[token]/route.ts:58-66`, `charge-stored/route.ts:65-68`, `payments.ts:397-404`. Fix: stamp on first payment or refuse DRAFT on /pay.

Nits noted, not ranked: `GET /api/app/route-plan` returns every member's `startAddress` (often a home address) to TECH; `resolveDriveLegs` rounds per leg before summing; shift-day's destination conflict scan skips moved appointments.

## Verified solid (so nobody re-audits it)

- Money math: `computeQuoteTotals` shared by quote create/edit/public approval/invoice create; invoice-from-job carries tax rate + discount and skips opted-out lines; final invoice nets PAID deposits and retires unpaid ones.
- Surcharge-aware `invoiceBalance` used everywhere that matters (pay page/route, charge-stored, invoice PATCH, reminders, deposit recompute, PAID checks).
- One invoice per job (`Invoice.jobId @unique` + 409s); doc numbers derived inside the tx and retried on P2002; charge lock + fresh balance re-read on every processor path; refund reservation is a CAS on amount.
- `runDueSubscriptions` keeps `interval:{not:null}`; `generateCycle` claim on exact `nextRunDate`; `chargeStored` idempotency minute-windowed; `RecurringExpense` CAS claim; legacy Contact card columns only written by `syncDefaultCardMirror`; month-end clamps and noon-UTC cursors correct.
- Cron: `CRON_SECRET` + `timingSafeEqual`, in-process overlap guard, 8-minute budget with money first, `take` caps, suspended companies skipped. Reminders use unique-row claims and stop on PAID/ARCHIVED; SMS quiet hours in company tz.
- Booking engine: DST-safe wall-time math, full-sweep re-verification at submit, busy pool covers jobs/appointments (incl. tentative)/manual + Google blocks/unassigned work, Serializable tx + in-tx reload for the slot race, round-robin only over active bookable members, declines unwind (modulo #8).
- Scheduling: tenant + role scoping on every route; optimize preview→apply re-validated against a fresh day (409 on drift); day bounds via `wallTimeToUtc`; conflict detection covers all item kinds; drag engine reverts on failed PATCH; `NEEDS_CREW` opens the place sheet; Google pull loop-guarded and never pushed back.
- Hub: token-scoped reads everywhere, another company's token treated as anonymous, messages rate-limited per token + IP, Telnyx signature fails closed.
- Roles: TECH never sees pricing surfaces; SALES blocked from job status; invoices need `canSeeMoney`; refunds/deletes need managers.

## Fix plan (status: NOT STARTED — pick a batch)

Each batch is one PR-sized commit: fix, unit test where the logic is pure,
e2e where it isn't, `tsc` + `npm run build`, push, Railway auto-deploy,
then the deploy check listed. Re-verify line numbers first; they are at
`ba27302`. Rules that still apply: never ship a column drop before David runs
`scripts/db-push-prod.mjs --accept-data-loss`; never `@unique` a new column
on a table with existing rows (boot `db push` has no `--accept-data-loss`).

### Batch A — money (#1 #2 #3 #4 #23 #24 #26)
- `app/api/app/payments/[id]/refund/route.ts` + `app/api/public/webhooks/finix/route.ts`: scale `surchargeAmount` with `amount` on refund (zero on full), restore both on reversal-failed. Add a pure helper `refundSplit(payment, refundAmount)` in `lib/payments.ts` and unit-test it.
- `app/api/app/quotes/[id]/route.ts` DELETE: 409 when `invoices` or `contracts` exist ("Archive it instead"); `QuoteActions.tsx` copy.
- `lib/deposits.ts`: `paidDepositTotal` → Σ`payments.amount` across DEPOSIT invoices regardless of status; final-invoice mint archives partially paid deposits; `/pay` refuses "Another amount" on `kind === "DEPOSIT"`.
- Stale deposit: on full quote edit and on approval, if a DEPOSIT invoice has zero payments and its total ≠ `quoteDepositAmount`, delete + re-mint and re-send the link (`quotes/[id]/route.ts`, `public/quote/[id]/route.ts`, `lib/deposits.ts`).
- `app/api/app/payments/route.ts`: reject `amount > invoiceBalance + 0.005` and PAID/ARCHIVED; hide "Collect other payment" on those statuses.
- `app/api/public/pay/[token]/route.ts`: $1 floor only when `payAmount < balance`.
- New `lib/due-dates.ts` `dueDateFromTerms(issuedAt, days)` = UTC day + N at T12:00Z; use it in the four manual paths and `lib/subscriptions.ts:365`; reminders skip the "due" stage when issued < 24 h ago.
- Tests: extend `e2e/specs/invoice-money.spec.ts` (refund → balance, partial deposit → final credit, overpay 400, $0.50 remainder pays) + unit tests for the helpers.
- Deploy check: refund a surcharged sandbox payment and confirm /pay shows $0.00.

### Batch B — autopay + recurring (#5 #9 #10 #11 #12 #29 #30 #36 #37)
- `lib/payments.ts` `chargeStored`: return `{ success:false, transient:true }` for FinixError status ≥ 500 / 401 / 429, abort, and non-Finix throws; `lib/auto-charge.ts` routes `transient` to the processor-down branch (no attempt burned, no client email); `classifyDecline` only regex-matches the processor `code`, never the message.
- `app/api/app/subscriptions/[id]/route.ts`: on PAUSED/CANCELLED set `nextVisitDate` = earliest deleted visit's date; on resume roll to first on-cadence date ≥ today.
- `lib/subscriptions.ts`: `billAllReadyWork` / `billSeriesPool` / `billSubscriptionNow` accept PAUSED + CANCELLED series; cancel/pause auto-bills the pool first.
- `anchorPlanFromFirstPayment`: keep the anchor day, but `nextRunDate = max(current cursor, next anchor-day occurrence)`.
- `generateCycle`: after one catch-up invoice, `rollCursorForward` past `now`.
- Contact archive (`app/api/app/contacts/[id]/route.ts`): pause ACTIVE subscriptions + `deleteFutureVisits`; `runDueReminders` / `runAutoChargeRetries` exclude `contact.status = ARCHIVED`.
- `lib/reminders.ts`: check `companyEmailBlocked` before claiming a stage.
- `app/api/cron/recurring/route.ts`: `Sentry.captureException` inside `step`, `ok:false` + 500 when a money step errored; add `GET /api/health?cron=1` that 503s when `ReconcileRun.startedAt` > 30 h old (external dead-man check).
- Finix webhook reversal: set `autoChargeNextAt = now + 24 h`; `no_card` gives up + owner push after 3 days.
- Tests: unit tests for cursor math (pause/resume, late-anchor, catch-up) in a new `scripts/test-subscriptions.ts`; `e2e/specs/recurring.spec.ts` adds pause→resume visit continuity.
- Deploy check: `railway run` a dry cron tick and confirm `ok:true`, then pause/resume the demo series and count visits.

### Batch C — customer-facing (#6 #7 #8 #16 #31 #33 #34)
- `app/api/public/webhooks/telnyx/route.ts`: keyword match = whole body only (`stop|stopall|unsubscribe|start|unstop`), everything else → `landInboundSms`; opt-out update scoped to companies that texted that number (store `companyId` + sender number on outbound `SmsLog`/PortalMessage and route inbound by the `to` number once per-company numbers exist; until then post to every candidate thread and flag ambiguity).
- `lib/booking-types.ts` `sanitizeBookingSettings`: force `confirmation = "INSTANT"` for `kind === "SERVICE"`; hide the Confirmation card for SERVICE in `ItemEditor.tsx`; button copy "Book this time".
- `lib/booking-checkout.ts` `unwind()`: delete subscriptions created in the tx (return their ids from `convertQuoteToJob`) and restore the prior pipeline stage/status; move `recordLeadWin` to after a successful charge.
- `app/api/app/quotes/route.ts` + `jobs/route.ts`: only NEW → CONVERTED; when the request is NEEDS_APPROVAL, confirm the tentative appointment in the same tx (or 409 "Accept the booking first"); `RequestActions.tsx` hides Convert while NEEDS_APPROVAL.
- New cron step `expireApprovalBookings`: auto-decline tentative appointments 2 h before `scheduledAt` (cancel appt, ARCHIVED request, client email) + daily "N bookings awaiting approval" push.
- Contact matching (`lib/booking-submit.ts`, `public/book/[slug]/route.ts`, staff create/import): compare email `mode:"insensitive"` and phone by digits; add `Contact.phoneDigits` (nullable, indexed, backfilled by script — no unique).
- Tests: unit test for the keyword matcher; `e2e/specs/online-booking.spec.ts` adds "hold for approval SERVICE item creates NEEDS_APPROVAL" and "decline unwinds subscription"; `hub-form.spec.ts` adds duplicate-contact merge.
- Deploy check: text "Cancel my appointment" to the toll-free line and confirm it lands in the thread with opt-out untouched.

### Batch D — dispatch (#14 #15 #20 #21 #22 #35 #41 #42 #43)
- `app/api/app/route-plan/optimize/route.ts`: clamp `durationOf` to the day window; walk the cursor past overlapping blocks / tentative / phone appointments of the routed tech; exclude stops with `scheduledAt < now` or an open TimeEntry when routing today.
- `app/api/app/schedule/shift-day/route.ts`: same past/open-clock exclusion; sheet pre-unchecks them.
- `ScheduleClient.tsx`: undo after a notified move re-notifies (drag → `notify-move`, shift → `{ notify:true }`); `canNotify` requires a start change, not a resize.
- `app/api/app/appointments/[id]/route.ts`: `assignedToId` gated on `isManager || USER`, 403 otherwise.
- `app/api/app/jobs/[id]/status/route.ts`: end the actor's open TimeEntry on that job at completion (managers closing: all open entries on the job); `clock/route.ts` caps auto-close at 12 h; ARCHIVED on an uninvoiced job requires `canSeeMoney`, menu item hidden for TECH.
- `app/platform/schedule/page.tsx` `blockToDTOs`: split multi-day blocks with `wallTimeToUtc`/`localDayParts` in company tz.
- `lib/route-plan.ts`: leg chain skips Anytime/all-day stops (match `find-a-time.ts`); `RouteMapClient.tsx:614` passes the current order on round-trip toggle.
- Tests: `scripts/test-route-plan.ts` (new) for the walk with a multi-day stop + a block; `e2e/specs/schedule-tools.spec.ts` adds undo-renotify and USER reassignment.
- Deploy check: Optimize the demo day with a manual lunch block and confirm no stop overlaps it.

### Batch E — remaining dead-ends (#13 #17 #18 #19 #25 #27 #28 #32 #38–#50)
- Convert idempotency: `updateMany` claim on `jobId: null` inside `convertQuoteToJob`; same claim pattern for public approve; partial unique index on Invoice `(quoteId) WHERE kind='DEPOSIT'` via raw SQL migration script (not schema `@unique`).
- Invoice delete → job back to REQUIRES_INVOICING; archived invoice edit keeps ARCHIVED; `invoices/new` prefill + POST scoped by `jobScope` for USER.
- `validUntil` compared against end of day in company tz; internal Mark Approved shares the public approval helper and is limited to AWAITING/CHANGES_REQUESTED; `emailed:false` surfaced by collect-deposit / accept-booking / approval routes.
- Hub "Reset portal link" (regenerate `hubToken`, re-invite) on the contact page; `hubTokenRevokedAt` optional.
- Team deactivate: unassign future JobAssignments, strip from `visitAssigneeIds`, list affected series in the response.
- Booking charge step: try/catch → `unwind()` on throw before charge; after a successful charge that then throws, record the payment with `receiptPending`. Autopay: per-invoice-per-attempt idempotency id + look up transfers by `tags.invoiceId` before retrying after an abort.
- Geocoding: `country=us` + `proximity`, reject other-state / low relevance, don't cache those. P2034 retry ×3 in booking submit. `limit()` on booking POSTs + hub requests. Appointment picker limited to `canSell` roles. Drop `status` from job PATCH. Request lookup on quote create includes `contactId`. `sanitizeDeposit` in both quote routes. Stamp `issuedAt`/`dueDate` on first payment of a DRAFT.
- Tests: `quote-lifecycle.spec.ts` (double convert, delete refusal, validUntil), `tenancy.spec.ts` (USER invoice prefill), unit tests for geocode filtering.

Progress log (append as batches ship):
- 2026-09-16 Batch A (money) — #1 refundSplit scales surchargeAmount with the refund (Refund.surchargeAmount stores the refunded share; webhook reversal-failed restores both); #2 quote DELETE 409s with invoices/contracts attached; #3 depositCredit nets Σ payments (principal) on every DEPOSIT invoice and the final invoice archives partially paid deposits, /pay refuses split deposits; #4 unpaid deposit invoices are re-priced in place on quote edit and on approval (same pay link), approval re-sends the link while the deposit is outstanding; #23 manual payments refuse overpayment and PAID/ARCHIVED invoices; #24 $1 floor only for partial amounts; #26 dueDateFromTerms (noon UTC) in all five writers + reminders skip the "due" stage for invoices issued < 24h; #49 sanitizeDeposit on quote edit. Tests: scripts/test-money.ts (9), e2e invoice-money + quote-lifecycle additions. Schema: Refund.surchargeAmount (nullable) — db:push before deploy.
- 2026-09-16 — Batch D (dispatch) shipped on `fix/ops-batch-d`: #14 optimize pins already-started / on-the-clock / multi-day stops (`pinned` in the response, shown in the preview), clamps durations to the day, walks the route around the tech's own blocks / tentative + phone appointments / off-route timed jobs (`lib/route-walk.ts`), and today's anchor can't sit in the past; shift-day leaves today's started visits alone (`left` in the response, note in the sheet). #15 undo after "Text client" / notified "Move the day" re-notifies. #20 appointment reassignment gated on managers + USER, 403 for the rest. #21 completing/closing a job clocks the tech out of it (managers: everyone on it); clock-in auto-close and the completion close are capped at 12 h (`autoCloseAt`). #22 close-without-invoice needs `canSeeMoney` (403 + menu item hidden). #35 multi-day blocks split at company-local midnights. #41 drive-leg chain skips Anytime stops. #42 "Text client" needs a start change, not a resize. #43 round-trip toggle keeps the manual order. Tests: `npx tsx scripts/test-route-plan.ts`.
- 2026-09-16 Batch C (#6 #7 #8 #16 #31 #33 #34) on branch fix/ops-batch-c. Whole-body SMS keywords (lib/sms-keywords.ts) + STOP scoped to companies that texted the number; new SmsSend log (sendSms records company/contact/recipient) routes inbound replies to the company that last texted; SERVICE items pinned to INSTANT (sanitizer, runtime loader, editor card hidden); declined booking card now deletes the subscriptions it started and the lead win waits for a successful charge; quote/job create 409s on NEEDS_APPROVAL requests and only NEW requests flip to CONVERTED; new cron step expireApprovalBookings (auto-decline 2 h before the slot + 8am owner nudge, lib/approval-bookings.ts); Contact.phoneDigits (nullable, indexed, kept by a lib/db.ts write hook, backfilled by scripts/backfill-phone-digits.mjs in db:backfill) + case-insensitive email on every public matcher. Needs db:push (predeploy does it). Unit test: scripts/test-sms-keywords.ts. Not done from the plan: no e2e additions; inbound texts with no SmsSend record still use the old most-recent-thread heuristic rather than posting to every candidate company (that would leak one tenant's client message to another).
- **Batch B shipped 2026-09-16** (#5 #9 #10 #11 #12 #29 #30 #36 #37). Cursor math extracted to `lib/billing-cursor.ts` and autopay policy to `lib/autopay-rules.ts` (both pure; `npx tsx scripts/test-subscriptions.ts`, 24 tests). #5: `ChargeResult.transient` for 401/403/429/5xx/timeouts/non-Finix throws → new `processor_down` outcome (re-books +24 h, no attempt burned, no client email); `classifyDecline` matches the decline code only. #9: `deleteFutureVisits` rewinds `nextVisitDate` to the first deleted visit. #10: Ready-to-bill queue, `billAllReadyWork` and per-series Bill now accept any series status (pause/cancel do NOT auto-charge — the owner bills from the queue). #11: late first payment keeps the cursor (`anchoredNextRunDate`, 7-day grace). #12: archiving a contact pauses their series + clears future visits; reminder/autopay/billing sweeps skip ARCHIVED contacts. #29: reminder stages are not claimed while `companyEmailBlocked`. #30: cron steps report to Sentry, money-step failures return `ok:false` + 500; `GET /api/health?cron=1` 503s when no ReconcileRun in 30 h (point an external monitor at it). #36: `cursorAfterCycle` bills one catch-up then rolls past now. #37: a bounced debit re-books autopay +24 h; `no_card` in the retry sweep gives up immediately with an owner push (saving a card revives it). No schema change.
