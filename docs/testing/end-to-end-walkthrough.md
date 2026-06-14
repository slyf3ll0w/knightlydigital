# Streamflaire Hub — End-to-End Walkthrough

A scripted, full-lifecycle test for confirming every system works cohesively —
especially the form → quote → **deposit** → job → invoice → payment →
subscription chain. Run it as a real owner would, with a second person acting
as the customer.

## How to run

- **Environment:** the live deploy (`https://streamflaire.com`). A new company
  is a fully isolated tenant, so nothing here touches real data. Delete it (or
  keep it as a sandbox) when done.
- **People:** you = the business owner (and later a Tech login). A friend = the
  customer, using the public links (booking form, quote approval, pay page) from
  their own browser/phone.
- **Key URLs:**
  - Register: `/platform/register` · Login: `/platform/login`
  - Public service/booking form: `/book/[companySlug]` (or `/book/[companySlug]/[formSlug]`)
  - Quote approval: `/quote/[token]` · Pay page: `/pay/[token]` · Client portal: `/portal/[companySlug]`

## Caveats to expect (not bugs)

- **Payments are in "manual" mode** — there's no real card processing yet. The
  pay page shows instructions; the business records payments by hand. Test the
  *record-payment* path, not a live charge.
- **Emails are Resend-gated** — outbound mail (quote link, deposit pay link,
  reminders) may not actually deliver. Verify the in-app state instead of relying
  on the inbox, and use the public links directly.
- **Captcha** on public forms depends on Turnstile keys being set; if the form
  submits without a captcha it's because keys aren't configured yet.

## Scenario

**Cedar & Sun Lawn Care**, Springfield MO. Owner + one Tech. Services that
deliberately cover every deposit type and an agreement gate.

---

## Walkthrough

### 1. Register & onboarding
- [ ] Register a new company at `/platform/register` (creates Company + OWNER).
- [ ] Complete onboarding (industry → starter price book seeds).
- [ ] Land on the dashboard. **Expect:** "Needs you" home shows a calm/all-caught-up
      state on a fresh account; manila sidebar renders with ink text.

### 2. Settings
- [ ] Company profile: name, address, phone, email, **brand color**.
- [ ] **Default deposit** (Settings → Default Deposit): set e.g. 25%.
- [ ] Surcharge on + a review link.
- [ ] **Expect:** brand color flows to the sidebar active state, quote/invoice/pay
      pages; a too-light brand color still stays legible on the manila rail.

### 3. Price book (preset services) — cover every deposit type
- [ ] Service A "Mowing" — **recurring monthly**, no deposit (inherits company default).
- [ ] Service B "Yard Cleanup" — one-time, **fixed $50 deposit**.
- [ ] Service C "Aeration" — one-time, **25% deposit**.
- [ ] Service D "Seasonal Contract" — **full payment upfront**, **requires an agreement**
      (create an agreement template first under Settings → Contracts).
- [ ] **Expect:** each shows the right deposit/recurring/agreement badge in the list.

### 4. Team & roles
- [ ] Add a Tech user (Settings → Team).
- [ ] (Later, step 11) log in as the Tech in a separate browser. **Expect:** Tech
      sees only assigned jobs + schedule, no pricing/invoices, no Create options.

### 5. Web form → quote (NEW behavior)
- [ ] Build a **Service-Request form** (Settings → Forms) listing services A–C;
      set quote mode to **"Auto-send to client for approval."**
- [ ] Friend opens `/book/[slug]` and submits, picking **Cleanup + Aeration**.
- [ ] **Expect:**
  - A new **lead** + **request** appear.
  - A **Quote** is created (NOT an invoice), status *Awaiting response*.
  - Quote deposit = sum of the picked services' deposits ($50 fixed + 25% of
    aeration), capped at total. Confirm the number.
  - The request note says "Quote #N created automatically (sent for approval)."

### 6. Build a quote manually
- [ ] New quote for a client: add a preset line (Mowing) + a **custom** line
      ("Stump grinding", typed price) + an **optional** item.
- [ ] Watch the deposit auto-derive from the preset/company default; override it once
      to confirm the manual override sticks.
- [ ] Attach the Seasonal Contract agreement; send the quote.

### 7. Client approves (friend)
- [ ] Friend opens `/quote/[token]`, **opts out of the optional item**, signs, approves.
- [ ] **Expect:**
  - Quote → *Approved*; total recomputed without the opted-out item.
  - A **DEPOSIT invoice** is auto-created for the deposit amount (status
    *Awaiting payment*), linked to the quote.
  - Quote detail header shows **Deposit · $X · Invoiced (#N)**.

### 8. Collect the deposit
- [ ] From the quote, use **"Collect deposit"** (re-issues/links the deposit invoice).
- [ ] Record a manual payment on the deposit invoice.
- [ ] **Expect:** deposit invoice → *Paid*; quote header shows **Paid**.

### 9. Convert quote → job
- [ ] Convert. If the Seasonal Contract agreement isn't signed, **expect the
      conversion to be gated** until it is — sign it via `/contract/[token]`, then convert.
- [ ] **Expect:** a Job is created; a **Subscription** is created for the recurring
      Mowing service; the lead becomes an Active client.

### 10. Schedule & estimates (focus area)
- [ ] Create an **Appointment / estimate** (phone / video / in-person) for a lead;
      put it on the **Schedule** (month/week/day). Confirm it shows as a blue block.
- [ ] Schedule the Job (assign the Tech, set date/time or "Anytime").
- [ ] Drag an unscheduled job onto the calendar. **Expect:** schedule updates;
      team filter works.
- [ ] Complete the estimate → **expect** the "complete → quote" path offered.

### 11. Run the job → final invoice (deposit netting)
- [ ] As Tech: open the assigned job, add a note + before/after photo, mark complete
      → job becomes *Requires invoicing*.
- [ ] As Owner: create the **final invoice** from the job.
- [ ] **Expect (the key check):** the invoice shows a **"Deposit applied −$X"**
      credit line and the **balance = total − deposit already paid**. The Invoices
      list foot total reflects it.
- [ ] Record final payment → invoice *Paid*; review request fires if configured.

### 12. Subscriptions
- [ ] Subscriptions page → **"Run due now."**
- [ ] **Expect:** the recurring Mowing subscription generates the next cycle's
      invoice (and a job if "creates job" was set); no double-billing on a second run.

### 13. Cohesion sweep
- [ ] **Dashboard "Needs you":** correct counts/verbs (past-due red first, etc.).
- [ ] **Ledger lists:** serif figure columns align; double-ruled footers total
      correctly (Invoices total + balance, Quotes value, Jobs total, Clients count).
- [ ] **Insights:** revenue / receivables / conversion numbers match what we did.
- [ ] **Client portal** (`/portal/[slug]`): friend can see their quotes/invoices/visits.
- [ ] Numbers reconcile: deposit paid + final balance == quote total (no double count).

## Things to watch (common cohesion break points)
- Deposit math when optional items are opted out (deposit caps at the new total).
- Full-upfront deposit → final invoice nets to ~$0.
- Recurring service: subscription starts on **conversion**, not at form submit.
- Role visibility (Tech can't see money; Sales sees only their leads).
- Agreement gate actually blocks conversion until signed.
- Brand-color legibility on the manila sidebar + client-facing pages.

## Cleanup
- Delete the test company (superadmin) when finished, or keep it as a living
  sandbox/demo. Note its slug here if kept: `__________`.
