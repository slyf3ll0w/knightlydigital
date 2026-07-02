# CRUD & Cohesion Overhaul — audit + fix plan (2026-07-02)

Trigger: David — "once I create a client I am unable to edit their email or phone number... each client feature should work cohesively and consistently."
Audit verified against code (paths cited inline). Companion research: `docs/plans/jobber-parity-plan-2026-07.md`.

## Verified audit findings

**The reported bug, confirmed:** `app/platform/contacts/[id]/page.tsx` renders name/email/phone/address/company/lead source/terms/notes read-only. Only AssignLead, CustomFieldsCard, ContactNoteForm are interactive. No Edit button, no `/contacts/[id]/edit` route. The PATCH in `app/api/app/contacts/[id]/route.ts` accepts most fields (gated on `body.firstName !== undefined`) but NOT `leadSource`, `status`, `paymentTermsDays`.

**The same disease elsewhere (ranked):**
1. Client core fields uneditable (above).
2. **Archive client is a dead end**: contacts list has an Archived filter and DELETE refuses with "archive them instead" (`contacts/[id]/route.ts:119`) — but nothing ever sets `status=ARCHIVED`. Filter is permanently empty; no archive/reactivate actions.
3. **Invoices immutable after creation**: `invoices/[id]/route.ts` has DELETE only — no PATCH. Can't fix a line item, due date, discount, subject without delete-and-rebuild (destroying payment history).
4. **Payments uncorrectable**: no `payments/[id]` route at all. A typo'd amount forces deleting the whole invoice.
5. **Job body & line items uneditable in UI**: PATCH supports title/description/address but no UI calls it; line items have NO edit path anywhere (only quote-convert creates them).
6. **Appointment type/assignee/title/address/meetingLink/notes uneditable in UI** — API fully supports all of it; `AppointmentActions.tsx` only reschedules time/status. Managers can't even reassign.
7. **Subscriptions can't be repriced** — status-only PATCH (pause/resume/cancel/billNow). No price/interval/name/nextRunDate edit, no delete.
8. **Expenses**: create + delete only, no PATCH.
9. **Request title/details and unsigned Contract title/body**: APIs allow edits, UI never exposes them.
10. **Pattern inconsistency**: only Quote has a real `/edit` route; everything else is ad-hoc inline widgets or nothing. Action bars differ per page; Contact page has no overflow menu at all (nowhere to hang Edit).

**Also found (integrity bug):** quote status-only PATCH has no transition guard — an APPROVED quote can be knocked back to DRAFT.

**Good news the audit confirmed:**
- All documents reference the client by **live relation** (no snapshots of email/phone) — fixing client edit propagates instantly to quotes/invoices/hub/pay pages. Nothing blocks the fix.
- Backlinks quote→job→invoice mostly solid; nudges (job-complete→invoice, paid→close-job, appointment→quote, approved→convert) exist. Two backlink gaps: invoice detail doesn't link its originating quote; appointment doesn't link the quote it produced.
- Client-page scoped Create menu already exists (`ContactCreateMenu.tsx`).

## The fix pattern (decide once, apply everywhere)

1. **Shared form component per entity** — the create form becomes `<EntityForm initialValues onSubmit>` used by both `/new` (POST) and `/[id]/edit` (PATCH). Document-like entities (Client, Invoice, Job) get real `/edit` pages like quotes; light entities (Appointment, Expense, Subscription, Request, Contract) get an Edit dialog/sheet on the detail page.
2. **Consistent actions bar on every detail page**: status badge · primary contextual action · overflow menu (⋯) with Edit / Archive-or-equivalent / Delete. Contact page gets the overflow menu it's missing.
3. **Every status must be reversible or archival** — nothing is a dead end. Archive ⇄ Reactivate for clients; existing reopen paths kept.
4. **Edit rules follow money**: paid/signed/converted documents lock (reopen first); drafts and awaiting states edit freely; edits recompute totals + statuses.

## Build batches

**Batch 1 — Clients (the reported bug) [SHIPPED 2026-07-02]**
- Shared ContactForm; new `/app/contacts/[id]/edit`; extend PATCH with leadSource/status/paymentTermsDays; also let create-form set leadSource + (managers) assignee.
- Archive/Reactivate actions (sets ContactStatus.ARCHIVED; default list hides archived; filter now real; delete keeps guard).
- Contact actions overflow menu (Edit / Archive / Delete); ContactNote edit+delete.

**Batch 2 — Money integrity [SHIPPED 2026-07-02]**
- Invoice PATCH + edit page (line items, due date, discount, subject, notes). Rules: DRAFT/AWAITING_PAYMENT/PAST_DUE editable; PAID locked behind reopen; cannot reduce total below amount already paid (guard); recompute status after edit.
- `payments/[id]` PATCH/DELETE (amount, method, transaction date, reference; manager delete w/ confirm; invoice status recomputes). 
- Quote status-transition guard (no APPROVED→DRAFT via status PATCH).

**Batch 3 — Ops entities (APIs mostly exist, build the UI) [SHIPPED 2026-07-02]**
- Job: edit title/description/address/leadSource (+ line-item editor with new API support, quote-editor pattern). New `/app/jobs/[id]/edit`; archived jobs locked (reopen first); empty line-item list valid.
- Appointment: full edit dialog (type, assignee for managers, title, address, meetingLink, notes) via ⋯ → Edit Details.
- Request: edit title/details (modal via ⋯ → Edit Request; API now rejects empty titles). Contract: edit title/body while unsigned (pencil button, modal).

**Batch 4 — Long tail + cohesion polish [SHIPPED 2026-07-02]**
- Subscription PATCH (name/price/qty/interval/nextRunDate; effective next run) + inline edit row (pencil per row).
- Expense PATCH + inline edit row. Company timezone select in Settings → Business Info (API validates via Intl).
- Backlinks: invoice→quote ("From quote" header fact — direct for deposit invoices, via job for converted quotes); appointment→produced quotes ("Quoted as" via the shared request, with status chips).
- Nudge: approved/converted quote with an uncollected deposit shows a green Collect Deposit banner (CollectDepositNudge).

Non-goals here: entity numbering stays server-assigned; Team email stays locked (login identity); WorkItem/WebForm/ContractTemplate already have full CRUD.
