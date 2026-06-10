# Jobber Build Spec for JobFlow

Source: hands-on walkthrough of a Jobber trial account ("Always Open Pressure Washing"), 2026-06-10.
Full lifecycle exercised with real data: Request → Quote (approved, 25% deposit) → Job (scheduled, closed) → Invoice (paid) → Payment (cash, recorded).
Screenshots in `./shots/` (numbered, referenced below).

Boundary: mirror workflows, navigation, and layout patterns. Do NOT copy assets, icons, copy, or branding.

---

## 1. Navigation (shots 01)

**Left sidebar**, collapsible, in this exact order with separators between groups:

1. Global **Create** button (expands to: Client, Request, Quote, Job, Invoice)
2. Home, Schedule
3. ─ Clients, Requests, Quotes, Jobs, Invoices  ← the core group, in lifecycle order
4. ─ Marketing, Receptionist (AI), Pipeline (sales), Insights, Expenses, Timesheets, Community, Apps
5. ─ Refer and Earn, Get Set Up (progress bar), trial/plan upsell card

**Top bar**: company name (left), then search (`/` keyboard shortcut), notifications, activity feed, help, settings gear.
Settings gear menu: Settings, Account and Billing, Manage Team, Refer and Earn, Product Updates, Dark Mode, Log Out.

JobFlow v1 sidebar: Home, Schedule │ Clients, Requests, Quotes, Jobs, Invoices │ Settings. Add global Create button — it's the single most-used control.

## 2. Home dashboard (shot 01)

Two modes during onboarding: "First Steps" (setup checklist) vs "Dashboard". Dashboard layout:

- Greeting header ("Wednesday, June 10" / "Good afternoon, David")
- **Workflow strip** — 4 cards, one per entity, each with a headline count + 2 secondary status links:
  - Requests: **New** (headline) | Assessments complete, Overdue
  - Quotes: **Approved** | Draft, Changes requested
  - Jobs: **Requires invoicing** | Active, Action required
  - Invoices: **Awaiting payment** | Draft, Past due
  - Every count deep-links to the filtered list page (`/quotes?status=draft` etc.)
- **Today's appointments** — KPI tabs: Total / Active / Completed / Overdue / Remaining, with revenue amounts; list of today's visits below (assignee avatar + $ value)
- **Business Performance** right rail: Receivables (clients who owe), Upcoming jobs this week (w/ trend arrow), Revenue this month (links to insights)

## 3. Data model

### Lifecycle + statuses confirmed in live UI

- **Client**: `Lead` → `Active` (flips automatically when first work item is created). Archived exists via filters ("Leads and Active" default filter).
- **Request**: `New` → `Converted` | `Archived` (also: assessment_completed, overdue as virtual statuses)
- **Quote**: `Draft` → `Awaiting Response` → `Approved` / `Changes Requested` → `Converted` | `Archived`
- **Job**: scheduled (`Today`/`Upcoming`) → `Requires Invoicing` / `Action Required` → `Archived` (on close). Late + Unscheduled as virtual statuses. Closing a job with open visits prompts: "Complete N past visits" or "Remove N incomplete visits".
- **Invoice**: `Draft` → `Awaiting Payment` (with due date from terms) → `Paid` | `Past Due`. Paid invoices get a "Re-open Invoice" action.
- **Payment**: standalone record linked to invoice(s) + client.

### Cross-linking (everywhere)
Every detail page header shows a definition list with backlinks: Quote shows "From Request", Job shows "From Quote #1" + "From Request", Invoice shows "Invoice for Job #1". Detail pages of upstream entities show "Used for" forward-links. **This bidirectional chain is the spine of the product.**

### Numbering
Per-company sequential numbers per entity (Quote #, Job #, Invoice #), editable at creation.

## 4. Entity forms & detail pages

### Client (shots 02, 03)
Create form: title/first/last/company; phone + email (with per-client communication settings); lead source; collapsible "Additional client details", "Additional contacts"; property address with **Google Places autocomplete**; tax rate; "billing address same as property" checkbox; collapsible property details/contacts. Buttons: Cancel / Save and Create Another / Save.

Profile page: status badge (Lead/Active), actions (Email client, More, **Create** scoped to this client: Request/Quote/Job/Invoice/Payment/Task/Property/Contact), contact dl (phone, email, payment terms, lead source), tabs (Client information | Files and media), sections: Properties (multi-property!), Contacts, **Work overview** (filterable table across all 4 entity types), Billing history, Payment methods (card on file), Client schedule. Resizable right rail: Lifetime value + Current balance, Tags, internal Notes.

### Request (shots 04, 05)
Form: Title, client card, requested-on date, Service details (free text + up to 10 images), optional On-site assessment (schedule a visit), optional line items, internal notes.
Detail: status badge, primary action **Schedule Assessment**, More menu: Convert to Quote, Convert to Job (skip quoting), Archive, Print, Delete.

### Quote (shots 06, 07)
Convert-to-quote modal offers 3 paths: **template** (pre-built per vertical), **"Draft for me" (AI)**, manual.
Builder sections (all removable/addable):
- Introduction (image + title + description)
- Product/Service line items: drag-reorder, name from price book (combobox w/ autocomplete), qty, unit price, total, description, per-item image, **"Mark as optional"** (client can check/uncheck in hub; optional items show "Optional" badge and join an "N OF M ITEMS" subtotal)
- "Add Text" free-text blocks between line items
- Totals: Subtotal, Discount, Tax, Total, **Costs, Estimated margin**, **Deposit or Payment Schedule**
- Deposit dialog: "Deposit only" (% or $, collected on approval) OR "Payment Schedule" (split into N named invoices, % or $, per-payment "required quote deposit" flag, live "Remaining" tracker)
- Client message, Contract/Disclaimer (+ "apply to all future quotes")
- Client view options toggle (what client sees)
Detail page header dl: Quote #, Created, Required Deposit, From Request.
More menu: Convert to Job, Create Similar Quote, Collect Deposit, Send as Email/Text, Mark as Awaiting Response / Approved / Archive, **Preview as Client**, Collect Signature, Print/PDF, Delete. After approval, **Convert to Job becomes the primary button**.

### Job (shots 09, 10)
Form: Title, Job # (+ From Quote), **One-off vs Recurring**; Schedule block: start/end date+time, "Schedule later", "Anytime", Repeats presets (Does not repeat / Daily / Weekly on X / Every 2 weeks / Monthly on Nth / **"As needed — we won't prompt you"** / Custom); visit instructions; team assignment (+ "Email team about assignment"); checklists hook; Billing prefs: "Remind me to invoice when I close the job", "Split into multiple invoices with a payment schedule"; line items now have **Unit cost AND Unit price**.
Detail: status (Today/Upcoming), primary action Email Booking Confirmation; dl: Job #, type, starts/ends, billing frequency, From Quote/Request; sections: line items (cost+price), **Labor** (time entries), **Expenses**, Scheduled visits, Billing (Invoicing/Reminders tabs — upcoming invoice row with Create button). Right rail: **Profit margin widget** (Revenue / Line item cost / Labor / Expenses / Profit + margin alert).
More: Close Job, Create Similar Job, Send Job Follow-up Email, Text Booking Confirmation, Create Invoice, Collect Signature, Email Job Costs CSV, Print/PDF, Delete.

### Invoice (shots 11, 13)
Form: Subject, Invoice #, issued date, payment terms (Net 30 default → computes due date), line items w/ **per-item service dates**, totals (Subtotal/Discount/Tax/Total/**Deposits**/Invoice balance), add-sections (Client message, Images, Attachments), Contract/Disclaimer, notes. Save / Save and… (**Send as Email / Send as Text / Collect Payment**).
Paid detail: Paid badge, Re-open Invoice, dl incl. Issued/Terms/Due date/Paid date, payment line (−$amount), Invoice balance + Account balance. Right rail: **Client view toggles** (Quantities, Unit prices, Line item totals, Account balance, Late stamp if overdue).
After payment, banner nudge: "You may want to close this job: Job #1" → cross-entity workflow nudges are a signature behavior.

### Payment (shot 12)
Collect Payment screen: big amount header; method dropdown (Other, **Bank payment ACH, Cash, Check, Credit/debit card, Cash App, PayPal, Venmo, Zelle**) — manual record types even without processing enabled; transaction date; reference #; details. **Outstanding invoices table**: select multiple invoices, per-invoice "Enter Payment" amount, sortable, account balance shown. Save / Save and Email Receipt.

## 5. List pages (shots 18–22)

Shared pattern: H1 + primary "New X" button + "More Actions"; **KPI strip** (status counts + $ over past 30 days, conversion %); an AI insight card; "All X (n results)" table with Status filter + Date range; sortable columns; row → detail.

Columns per page:
- Requests: Client, Title, Property, Requested, Status
- Quotes: Client, Quote number+Title, Property, Created, Status, Total
- Jobs: Client, Job number+Title, Property, Schedule (COMPLETED + date), Status, Total (+ Job Type filter)
- Invoices: Client, Invoice number, Due date, Subject, Status, Total, Balance
- Clients: Name, Address, Tags, Status, Last Activity (+ tag filter; default status filter "Leads and Active")

## 6. Schedule (shots 14–17)

URL pattern `/schedule/{month|week|day}/YYYY/M/D`. Controls: Month/Week/Day segmented toggle, date picker + prev/next/Today, "Find an appointment time", **Unscheduled appointments drawer**, **Map toggle** (split view, `?map=small`), filters: Type / Team / Status, More menu, **Route Optimization**.
Week grid has an **"Anytime" all-day row** for visits without times. First-run customization wizard: appointment layout (Stacked vs Nested), completed-appointment style, day-view orientation (Horizontal vs Vertical), show weekends.

## 7. Client Hub (shots 08, 23, 24, 28)

Hosted at separate origin, URL: `/client_hubs/{uuid}` — tokenized, no password (magic-link style).
Nav: company name + Requests / Quotes / Appointments / Invoices / Log Out + **Refer a Friend** (mailto containing a tracked referral link to the public request form; referred leads get tagged with the referrer).
- Hub home: "Get work done" → New Request CTA
- Quote view: branded, line items w/ photos, optional-item checkboxes, "N OF M ITEMS" subtotal, deposit required notice, terms; (non-preview adds Approve / Request changes buttons + signature)
- Invoices: grouped by status (Paid/...), card per invoice with subject, #, sent/due, property, total → detail/pay
Admin settings for hub: menu visibility (show quotes+invoices lists), quote approval (require signature, allow change requests), appointments (show scheduled time), referrals toggle + incentive templates, shareable login URL.

## 8. Automations & comms (shots 25, 27)

**Automations page** (`/automations`): toggleable recipes grouped by entity + "New Automation" builder:
- Quotes: follow-up 2 days after sent; follow-up 5 days after sent; auto-archive
- Invoices: follow-up on due date; follow-up 3 days after due
- Requests: auto-archive

**Emails & Text Messages** (`/communication_settings`) — template per event, each editable, some with timing rules:
- Email replies routing (to sender or assigned member)
- Requests: Submitted request (auto), Booking confirmation, Assessment reminder (1 hr before + 1 day before at 3:30 PM), Checklist copy
- Quotes: New quote, Quote approval receipt (auto)
- Jobs: Booking confirmation, Visit rescheduling, Visit reminder (1 hr + 1 day before), Checklist, Chemical treatment record, Job follow-up (feedback survey after close)
- Invoices: New invoice, Payment & deposit receipts
- General: Statements (billing history), **Request a payment method on file**, Signed documents
- SMS versions of all of the above are plan-gated in Jobber → JobFlow ships them free (Twilio)

Note: sending any email/SMS requires verified sender email (Jobber blocks until verified).

## 9. Settings tree

Grouped: **Business Management** (Company Settings, Business Profile, Products & Services `/work_items`, Custom Fields, Jobber Payments, Expense Tracking, Automations, Account Connections) / **Team Organization** (Manage Team, Work Settings, Schedule, Location Services, Checklists) / **Client Communication** (Client Hub, Emails & Text Messages, Requests and Bookings).

Price book (`/work_items`): searchable table (Name, Description, Type Service|Product), Add Item; pre-seeded per vertical at onboarding (trial picked pressure-washing services automatically).

## 10. Signature behaviors worth copying

1. **Lifecycle nudges**: after payment → "close this job?" banner; after quote approval → Convert to Job becomes primary CTA; job close prompts invoice creation ("Remind me to invoice").
2. **Status-first dashboards**: every count is a deep link to a pre-filtered list.
3. **Lead → Active automatic client status.**
4. **Deposit plumbed through everything**: set on quote → shows on quote/job/invoice as Required/Outstanding deposit → "Collect Deposit" action → applied against invoice.
5. **Preview as Client** on quotes/invoices — one click into the hub view.
6. **Per-client scoped Create menu** on the client page.
7. Editable entity numbers, custom fields ("Add Field") on every entity header.
8. Job costing always visible (unit cost vs price, profit margin rail).

## 11. Gap analysis vs current JobFlow

JobFlow today: login/register/dashboard/contacts/jobs(kanban)/schedule/quotes/invoices/settings; public /book/[slug], /pay/[token], /quote/[token]; payments stubbed (lib/payments.ts).

| Area | Jobber | JobFlow now | Gap action |
|---|---|---|---|
| Requests entity | First-class, w/ assessments | Booking requests only (no mgmt page) | Add Requests entity + list + convert-to-quote/job |
| Lifecycle links | Bidirectional From/Used-for chain | Mostly absent | Add requestId/quoteId/jobId FKs + header backlinks |
| Quote deposits/payment schedule | Built-in | None | Phase with payment processor work |
| Optional line items + per-item images | Yes | No | Add to quote builder |
| Job costing (cost vs price, labor, expenses) | Yes | No | Later phase (roadmap #7) |
| Recurring jobs | Yes (repeat presets) | No | Roadmap #6 |
| Client statuses Lead/Active | Automatic | No | Easy win — add to contacts |
| Client Hub | Tokenized portal, 4 sections + referrals | Separate one-off token pages | Unify under /hub/[token] with nav (roadmap #4) |
| Workflow dashboard | Status-count cards w/ deep links | Basic dashboard | Rebuild Home around the 4-card workflow strip |
| List-page KPI strips | Counts + $ + 30-day trends | No | Add once statuses exist |
| Schedule | Month/Week/Day + map + unscheduled drawer + anytime row | Basic calendar | Roadmap #3; "Anytime" row + unscheduled drawer are the differentiators |
| Automations + templates | Recipes + per-event templates | None | Roadmap #5 (free wedge — Jobber gates SMS behind paid plans) |
| Payment recording | Manual methods incl. Venmo/Zelle/Cash App + multi-invoice apply | Stub | Build alongside processor; manual record types are cheap and high-value |
| Price book | Seeded per vertical | None | Add work_items table; seed per industry at onboarding |

### Suggested build order refinement (consistent with roadmap)
1. Statuses + lifecycle FKs + workflow dashboard (foundation for everything visible)
2. Payments: manual payment records + collect-payment screen now; processor (deposits, card on file) when Finix/Stripe lands
3. Quote builder upgrade (optional items, deposits, client message/terms, preview-as-client)
4. Client Hub unification
5. Schedule rebuild
6. Automations + comms templates
