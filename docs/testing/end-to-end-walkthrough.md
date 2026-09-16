# Workbench — Tester Walkthrough

A scripted, full-lifecycle run through Workbench as a real home-service
company would use it. It is the human half of the verification story: the
unit tests (`npm run test:unit`) and the Playwright suite (`npm run e2e`)
prove the money math and the API rules; this walkthrough proves the product
hangs together for a person on a phone. Run it on **staging** before a
release, and hand it to new testers with the reporting notes at the end.

Last rewritten 2026-09-16 (after the ops-flow review). Refresh it whenever a
flow it names changes.

## How to run

- **Where:** staging (`https://<staging domain>`, see `docs/plans/roadmap.md`
  / the Railway project) — same code as production, separate database,
  Finix in sandbox mode (fake money). Production also runs sandbox Finix
  today, but keep testers off it.
- **People:** you = the business owner (and later a Tech login). A second
  person = the customer, on their own phone, using only the public links
  (booking page, quote link, pay link, client hub).
- **Devices:** owner on desktop AND the mobile app (or the site in a phone
  browser); customer on a phone. Most bugs found so far were phone-only.
- **Key URLs:**
  - Get started: `/app/get-started` (needs an invite code — `Workbench123`
    is the shared tester code) · Login: `/app/login`
  - Booking page: `/book/[companySlug]`
  - Quote approval: `/quote/[token]` · Pay page: `/pay/[token]`
  - Client hub: `/hub/[token]` (link is on the client's page → Client portal card)
- **Sandbox cards:** any Visa test number (e.g. `4895 1421 8399 3001`, any
  future expiry, any CVC). Amount-triggered outcomes on the cents: `.02`
  declines, `.93` insufficient funds. Nothing here moves real money.

## What "done" looks like

Every checkbox below has an **Expect** line. Tick it only if what you see
matches. Anything else is a finding — write it down as you go (see Reporting
at the end), don't try to work around it and keep going silently.

## Scenario

**Cedar & Sun Lawn Care**, Springfield MO. Owner + one Tech. Services chosen
so every deposit type, recurring billing, and an agreement gate get exercised.

---

## 1. Sign up & first run
- [ ] Owner: `/app/get-started` with the invite code. **Expect:** lands on the
      dashboard, no "activate" gate, no Finix underwriting step.
- [ ] Complete onboarding (industry → starter price book).
- [ ] **Expect:** Settings → Company shows the browser's timezone already set;
      Team shows you as bookable.

## 2. Settings
- [ ] Company profile: name, address, phone, email, brand color.
- [ ] Settings → Default deposit: 25%. Surcharge ON at 3%.
- [ ] Settings → Online payments: complete the sandbox Finix form (auto-approves
      in ~2 min). **Expect:** the card shows APPROVED before you move on.
- [ ] **Expect:** brand color shows on the sidebar active state, the quote,
      invoice and pay pages.

## 3. Price book (cover every deposit type)
- [ ] "Mowing" — **recurring monthly**, no deposit (inherits the 25% default).
- [ ] "Yard Cleanup" — one-time, **fixed $50 deposit**.
- [ ] "Aeration" — one-time, **25% deposit**.
- [ ] "Seasonal Contract" — **full payment upfront**, **requires an agreement**
      (create the agreement template first under Settings → Agreements).
- [ ] **Expect:** each row shows the right deposit / recurring / agreement badge.

## 4. Team & roles
- [ ] Add a Tech (Settings → Team) and a Sales + Tech (USER) member.
- [ ] **Expect (later, step 12):** the Tech sees only assigned jobs, no prices,
      no invoices, no "Close job without invoicing"; the USER member can invoice
      any job they complete.

## 5. Online booking (customer)
- [ ] Settings → Booking & forms: one SERVICE item listing Cleanup + Aeration
      with "collect a deposit", and one IN_PERSON visit item set to
      **Hold for approval**. Copy the booking page link.
- [ ] Customer books the visit item. **Expect:** they see "Awaiting
      confirmation"; owner gets a push + a red approval banner on the request.
- [ ] Owner **Accepts**. **Expect:** appointment turns solid on the schedule,
      customer gets the confirmation email (and an .ics). If the email could
      not be sent the app must SAY so — silent success here is a finding.
- [ ] Customer books the SERVICE item and pays the deposit with a sandbox card.
      **Expect:** a scheduled Job + a PAID deposit invoice; the deposit invoice
      total is principal, the payment shows the 3% surcharge separately; the
      customer is now an Active client (not a lead).
- [ ] Book the same SERVICE item again with a `.02` card. **Expect:** declined
      message; NO job, quote or plan left behind (check Jobs and Recurring).
- [ ] Book twice with the customer's phone typed two different ways
      (`(417) 555-0100` and `417.555.0100 x2`). **Expect:** ONE client record.

## 6. Quote by hand
- [ ] New quote: Mowing (preset) + "Stump grinding" (custom, typed price) + an
      **optional** item + Seasonal Contract. Valid until **today**.
- [ ] **Expect:** deposit auto-derives (Contract = full, Aeration 25% …) and a
      manual override sticks. Send it (real email to the customer).
- [ ] Try Mark Approved on a DRAFT quote. **Expect:** refused — send it first.

## 7. Customer approves
- [ ] Customer opens `/quote/[token]` **after noon** on the valid-until day.
      **Expect:** still approvable (valid through the end of the day).
- [ ] Customer opts out of the optional item, signs with their own name,
      approves. (A wrong name must be refused.)
- [ ] **Expect:** quote → Approved, total recomputed without the opted-out item;
      a DEPOSIT invoice exists for the new amount; the customer receives the
      deposit pay-link email; the lead card is in Converted.
- [ ] Owner: edit is now locked (approved quotes are signed documents).

## 8. Deposit money paths
- [ ] Customer pays the deposit on `/pay/[token]`. **Expect:** no "Another
      amount" option on a deposit; card + 3% surcharge; invoice → Paid.
- [ ] Owner: **refund** that payment in full from the invoice. **Expect:** the
      invoice reopens with balance = deposit amount exactly (not deposit +
      surcharge); refund it partially on a second run and check the balance
      math on the pay page.
- [ ] Owner: try to **delete** the quote. **Expect:** refused ("archive it
      instead") because it has an invoice.

## 9. Agreement gate & convert
- [ ] Convert → **Expect:** blocked until the Seasonal Contract agreement is
      signed. Customer signs at `/contract/[token]`; convert again.
- [ ] Double-tap Convert on the phone. **Expect:** ONE job, never two.
- [ ] **Expect:** a Job exists; Recurring shows a Mowing plan for the customer.

## 10. Schedule & dispatch
- [ ] Place the job on the Tech for tomorrow; add a manual "Lunch" block
      12–1 on the Tech.
- [ ] Route Manager → Optimize the Tech's day. **Expect:** no stop overlaps the
      lunch block; "Doesn't fit" appears (and Apply disables) if you pin a stop
      that runs into the next day.
- [ ] Move the whole day to the day after with "Text clients". Tap **Undo**.
      **Expect:** everything moves back AND the clients are texted again.
- [ ] Drag a visit to resize only (same start). **Expect:** no "Text client"
      offer — nothing moved.
- [ ] Try to assign an appointment to the Tech. **Expect:** techs aren't offered.

## 11. Tech runs the job (phone)
- [ ] As Tech: clock in, add a note + before/after photo, mark complete.
- [ ] **Expect:** job → Requires invoicing; the clock entry is CLOSED at
      completion time (Timesheets shows a realistic duration).
- [ ] As Tech: **Expect** no "Close job without invoicing" item.

## 12. Final invoice (deposit netting — the key check)
- [ ] Owner (or the USER member): Create Invoice from the job.
- [ ] **Expect:** "Deposit applied −$X" line; balance = total − deposit paid.
      If you refunded part of the deposit in step 8, only what is still paid
      is credited.
- [ ] Delete that invoice. **Expect:** the job goes BACK to Requires
      invoicing (not stuck Closed). Recreate it.
- [ ] Record a manual payment larger than the balance. **Expect:** refused.
      Pay it off. **Expect:** Paid, review-request email if configured.

## 13. Recurring billing
- [ ] Recurring → the Mowing plan: Bill now. **Expect:** one invoice, charged
      to the saved card (or emailed as a pay link if there is no card).
- [ ] Pause the plan, wait a moment, resume. **Expect:** visits reappear from
      the next on-cadence date — no month-long hole.
- [ ] Cancel a per-visit series that has completed visits. **Expect:** they
      still show under Ready to bill and can be billed.
- [ ] Archive the client. **Expect:** their plans pause; nothing bills or
      reminds them afterwards (check the plan status).

## 14. Client hub & messaging
- [ ] From the customer's page, copy the portal link; open it on the
      customer's phone. **Expect:** quotes, invoices, visits, saved cards.
- [ ] Owner: **Reset portal link**. **Expect:** the old link stops working
      immediately; the new one works.
- [ ] Customer sends a message from the hub; owner replies from Messages.
      **Expect:** both sides see the thread; owner gets a push.
- [ ] (If SMS is live) customer texts "Cancel Friday's visit please".
      **Expect:** it lands in the thread; the client is NOT opted out. Text
      exactly "STOP". **Expect:** opted out.

## 15. Cohesion sweep
- [ ] Dashboard "Needs you": counts match what you did (unpaid, ready to bill,
      awaiting approval).
- [ ] Invoices / Quotes / Jobs list footers total correctly.
- [ ] Insights: revenue and receivables reconcile with the invoices you paid.
- [ ] Numbers reconcile: deposit paid + final balance == quote total.

## Things to watch (where cohesion breaks)
- Deposit math after opt-outs and after a refund.
- Full-upfront deposit → final invoice nets to $0 and is marked Paid.
- Role visibility (Tech never sees money; USER can invoice jobs they finish).
- Emails: every "sent" the app claims should arrive; every failure should be
  reported on screen or in the activity trail, never swallowed.
- Timezones: due dates, "valid until", and schedule days must match the
  company's timezone, not the server's.

## Reporting a finding

For each: **where** (page + what you tapped), **what you expected**, **what
happened**, **device/browser**, and a screenshot. Money findings also need
the numbers (quote total, deposit, payment, balance shown). File them in
`docs/testing/findings-<date>.md` or the tracker the team is using; each one
gets fixed WITH a regression test.

## Cleanup
- Staging data can stay. If you ran this on production, delete the company
  from the superadmin console.
