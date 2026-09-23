# Workbench UX consistency + bug audit — 2026-09-22

Read-only audit of `app/platform/**`, `components/**`, `lib/**`, `app/api/app/**` on the
`business-line` working tree (98eb02b). Five parallel passes: navigation/IA, UI
primitives, entity pages, forms/saving, code-level bugs. Every HIGH finding below was
re-opened and confirmed by hand.

**Caveats**
- The working tree is 5 commits behind `origin/main` (missing: call screen `calls/[id]`,
  424 upstream fix, maps facelift, estimator Library, estimate-tools rework). Findings that
  touch calls/estimates/maps were spot-checked against `origin/main` where noted.
- Whether Railway pins `TZ` could not be checked (production read blocked). Run
  `railway variables | grep TZ` on both envs. If unset, the timezone findings (C1, C2) are
  live for every company; if set to America/Chicago they only bite non-Central companies.
- Prior audits already shipped: ops-flow review (2026-09-16), code-audit (2026-09-18).
  Nothing here repeats those.

---

## Part 1 — The pattern behind "phone settings under Automations & AI"

The settings index has four sections + two link groups. The section keyed `features`
is labelled **"Automations & AI — Assistant, texts, review requests"** and renders:
AI assistant name, **BusinessLineCard** (your number, forwarding, voicemail, caller ID,
10DLC registration), **SmsNotificationsCard**, "On My Way" text template, Review
requests. Only Review Requests is an automation. (`settings/SettingsClient.tsx:219-223`,
`:1976-2050`)

The same thing shows up all over the settings tree:

| Symptom | Evidence |
|---|---|
| Two "Automations" at the same level of the index: the section card "Automations & AI" and the Setup link "Automations" (Atlas rules page). The one that says Automations contains no rules. | `SettingsClient.tsx:220` vs `:240-244` |
| In-app help text points at section names that no longer exist: "Settings → Features" (4×), "Settings → Company", "Settings → Business" for the review link (which is under Automations & AI), "Settings → Agreements", "Settings → Online Payments", "Settings → Branding". | `calls/page.tsx:146-155`, `contacts/[id]/page.tsx:243-246`, `ProductsClient.tsx:452,509`, `lib/assistant/automations.ts:135`, `booking/[id]/ItemEditor.tsx:620`, `EmailClientButton.tsx:147` |
| "Business" means three things: the rail group, the `/app/business` page (titled "Business", nav says "Overview"), and the settings section "Business" (company profile). | `AppShell.tsx:183,240`, `business/page.tsx:88`, `SettingsClient.tsx:201` |
| Per-user things (softphone toggle, calendar sync, sign-in methods, light/dark) are split: some in My Profile, light/dark inside company Appearance & Branding ("for this device"). Managers reach My Profile via Settings → Workspace. | `ProfileClient.tsx:389-409`, `SettingsClient.tsx:1454-1458,308-313` |
| Four settings sub-pages are promoted to top-level nav (Services, Agreement templates, Booking & forms, Team) while six are index-only (Automations, Pipeline, QuickBooks, Client fields, Import, Plus). QuickBooks has zero links outside the index. | `AppShell.tsx:246-249` |
| On phones, Settings and Booking & forms sit under a More-sheet group labelled **"Team"**. | `AppShell.tsx:2647-2655,2727` |
| Settings deep-links land in the wrong section: "Set up payments" on /app/payments goes to `/app/settings` (opens Business) not `?s=payments`. | `payments/page.tsx:349` |
| Settings h2 style differs between the main page and Profile (`text-sm text-gray-700` vs `text-[13px] text-gray-500`). | `SettingsClient.tsx:1354`, `ProfileClient.tsx:208` |

### Proposed settings IA

Company-level (`/app/settings`, managers):

| Section | Contents |
|---|---|
| **Company** | Business info, portal link, timezone, email sending domain, danger zone |
| **Branding & client experience** | Branding, sidebar, what clients see, review requests, → Booking & forms |
| **Phone & texting** | Business line, text notifications consent, On My Way template, → Calls log, Workbench Plus |
| **Payments & accounting** | Online payments, surcharging, default deposit, sales tax, → QuickBooks |
| **Catalog & documents** | → Services (price book), → Agreement templates, → Client custom fields, → Lead pipeline |
| **Automations & assistant** | → Automation rules (the Atlas page), assistant name |
| **Team** | → Team & roles, → Import clients |

Personal (`/app/account` or keep `/app/settings/profile`, all roles, reachable from the
avatar menu and the More-sheet profile card, NOT nested under company settings):
profile & sign-in, email signature, appearance (light/dark), calendar sync, calls in the
app (softphone), welcome tour, keyboard shortcuts.

Then: one `SETTINGS_SECTIONS` table drives the index, the ⌘K palette, the mobile More
sheet, AND every "Settings → X" string (export a `settingsPath("phone")` helper that
returns both href and label so copy can't drift again).

---

## Part 2 — Navigation & naming

| # | Sev | Finding | Fix |
|---|---|---|---|
| N1 | HIGH | Desktop "Work" group has 16 rows (`AppShell.tsx:162-179`); mobile More sheet mirrors it. No hierarchy. | After the settings split, regroup rail: Sell (Leads, Requests, Quotes, Pricing tools, Agreements) · Do (Schedule, Routes, Appointments, Jobs, Timesheets) · Get paid (Invoices, Payments, Recurring) · Talk (Messages, Calls, Team chat) · Office (Reports, Insights, Expenses, Team map) |
| N2 | MED | Quotes vs Estimates vs `/app/estimate`: create menu offers "Quote" and "Estimate" side by side (`AppShell.tsx:289-290`); Estimates are pricing calculators, not documents. In FSM vocabulary estimate = quote. | Rename nav/create to "Price a job" / "Pricing tools"; drop the singular redirect |
| N3 | MED | Agreements vs Contracts: nav/list say Agreements; "New Contract", "Edit Contract", timeline type "Contract", create menu "Contract". | s/Contract/Agreement/ in `contracts/new/page.tsx:6`, `NewContractForm.tsx:63`, `ContractActions.tsx:164`, `ContactCreateMenu.tsx:24`, `contacts/[id]/page.tsx:175` |
| N4 | MED | Clients vs Customer vs Contacts: nav says Clients; forms say "Customer *", "Select a customer", "+ Add new customer" (`jobs/new/page.tsx:248-257`, `InvoiceEditor.tsx:271-285`, `JobEditForm.tsx:160`, `ContactForm.tsx:443`); route is `/contacts`; PeopleCard heading is "Contacts". | "Client" in every form label; PeopleCard → "People" |
| N5 | MED | Chat / Team Chat / Chats / Messages: tab "Chat", pill "Chat", More/⌘K "Team Chat", h1 "Chats". Solo owners tapping the Chat tab get "Chat opens once your company has more than one member" while their client Messages are buried in More. | One string ("Team chat"); consider giving the tab slot to an Inbox (Messages + Calls + Team chat) |
| N6 | MED | Requests vs Bookings vs Leads: dashboard "Bookings to approve" → Requests page; "Lead" in create menu creates a *contact* (`?type=lead`) while Leads nav is a board. | "Booking requests" consistently; create item → "Lead (client)" or move onto the board |
| N7 | MED | Services / Products / Price book: nav "Services" → route `/settings/products`, h1 "Services", sub "Your price book", dashboard "Your price book is ready", booking editor "Open price book". | "Services" as the noun; rename route with redirect |
| N8 | MED | Recurring / Subscriptions / Series / Visits / Crew: nav "Recurring" → `/subscriptions`, "New recurring plan", `NewSeriesForm`, "visit series", "Default crew" vs nav "Team". | Recurring (section) / plan (record) / visit (occurrence); "team" not "crew" |
| N9 | MED | Back controls: five variants and odd targets. Appointments back → Schedule not Appointments (`appointments/[id]/page.tsx:73`); contracts/new back → Clients; contract delete → Clients; payments/new back → Invoices; expenses back → Insights while `lib/mobile-nav.ts:117` says parent is Business; client-fields/import back → Clients though they're Settings pages. | One `<BackLink>` primitive fed by the same parent table as `lib/mobile-nav.ts` |
| N10 | MED | SALES sees money nav it may not open: `moneyRoles` includes SALES unconditionally (`AppShell.tsx:149`, comment admits it); pages gate on `salesSeePayments`. Also Recurring shown to `moneyRoles` but `/subscriptions/new` is manager-only. Same blind spots in `ContactCreateMenu.tsx:21-27`, `jobs/[id]/page.tsx:295-309`, `dashboard/page.tsx:242-249`. | Layout already has `actor.salesSeePayments` (`layout.tsx:78`); pass it into AppShell and the two menus |
| N11 | LOW-MED | Timesheets hidden from managers' nav (`AppShell.tsx:176`) though the page allows them; Team Map has no nav entry at all. Both only reachable via Business Overview cards. | Add both to the Business/Office group for managers |
| N12 | LOW | Nav label ≠ page title: "Routes" vs "Route Map"; "Overview" vs "Business"; "Help & Feedback" vs "Help"; "Roadmap" vs "Upcoming Features". | Align metadata to nav strings |
| N13 | LOW | ⌘K omits Help, Roadmap, Team Map, Timesheets, Automations, QuickBooks, Pipeline, Client fields, Import. | Feed the palette from the settings link tables |

---

## Part 3 — Entity pages behave differently

Capability matrix (detail pages, ✓ present / ✗ absent):

| | Contact | Request | Appt | Quote | Job | Invoice | Agreement |
|---|---|---|---|---|---|---|---|
| "…" menu | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Edit surface | page | modal | modal | page | page | page | modal |
| Send / resend | modal | ✗ | ✗ | 1-click | ✗ | 1-click | ✗ (auto on create) |
| Preview as client | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | opens page |
| Copy public link | hub | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| PDF | statement | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| Duplicate | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| Archive confirm | yes | no | n/a | no | n/a | yes | Void |
| Delete dialect | type name | sheet | sheet | sheet | sheet | type DELETE | sheet |
| Delete lands on | list | list | **Schedule** | list | list | list | **Clients** |
| Notes feed | ✓ | ✗ | 1 field | static | ✓ | static | ✗ |
| ActivityTrail | ✗ (logged!) | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| Call/text/directions row | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ |

List pages: Jobs/Quotes/Invoices/Contacts/Requests have FilterBar + search + sort + Pager +
CSV. **Contracts** has none of those, no New button, silently caps at 200
(`contracts/page.tsx:17-29`). **Appointments** caps 100/50 with no filters and hides the
status chip on phones. **Calls** (take 300), **Messages** (take 100 — older threads
unreachable), **Subscriptions** (all rows) have no pager. Calls builds its own filter UI
instead of FilterBar.

| # | Sev | Finding | Fix |
|---|---|---|---|
| E1 | HIGH | Delete shown to users who can't delete: `QuoteActions.tsx:473-479`, `RequestActions.tsx:173-179` render Delete unconditionally; APIs 403 non-managers → "Forbidden" after confirming. | Pass `canDelete={isManager(actor.role)}` like every other entity |
| E2 | HIGH | ActivityTrail prints raw enums: only 5 actions mapped (`ActivityTrail.tsx:8-14`) but routes log `auto_charge_failed`, `email_failed`, `automation`, `portal_link_reset`. Owners see "auto_charge_failed — …". | Extend `ACTION_LABEL`; fallback humanises `snake_case` |
| E3 | HIGH | Contact activity is logged (portal reset, booking accept/decline) but never rendered; jobs have no trail either. | Render `<ActivityTrail>` on contact + job; log job status changes |
| E4 | HIGH | Request status change swallows errors, no busy state (`RequestActions.tsx:39-50`). Siblings all alert on failure. | `postJson` + `alertSheet` |
| E5 | HIGH | Duplicate double-fires on quotes/invoices (no `busy`: `QuoteActions.tsx:238-247`, `InvoiceActions.tsx:191-200`); job version guards correctly. | Mirror `JobActions.duplicateJob` |
| E6 | HIGH | "Emailed to …" hides that a text also went out. Send routes return `{emailed, texted}`; UI only says "Emailed to"; button is "Email to Client". | Show both channels in the pill and the button label |
| E7 | MED | Manual (cash/check) payments appear in no list: `/app/payments` filters `processorRef != null` (`payments/page.tsx:82,93`). | "Recorded payments" tab or Method filter |
| E8 | MED | "All" means different things: Invoices "All" excludes ARCHIVED, Contacts default excludes ARCHIVED, Jobs/Quotes/Requests "All" include archived/closed. | One rule: All = live; archived on its own tab |
| E9 | MED | Agreement page: no Send/Resend, the create button says "Create & Get Signing Link" but the API emails on create (`contracts/route.ts:86-104`), back → client, delete → `/app/contacts`. | "Email signing link (again)" action; back/delete to `/app/contracts`; rename button |
| E10 | MED | Quote ↔ Agreement not linked either direction (`quotes/[id]/page.tsx:34` selects only status; `contracts/[id]/page.tsx:19-22` includes only contact though `Contract.quoteId` exists). Contact page never links its Messages thread. Job → subscription links to the list not the row. | Select ids and link both ways; Messages card beside Recent calls |
| E11 | MED | Notes UI copy-pasted: `ContactNoteItem.tsx` = `JobNoteItem.tsx` verbatim; `ContactNoteForm` lost error handling and offline queue. | One `NoteFeed` component parameterised by endpoint |
| E12 | MED | Job verbs: "Complete Job" → status "Requires Invoicing" or "Closed"; menu "Close Job without invoicing". Three verbs for two states. Reopen is primary on quote/job but menu-only on invoice, spelled "Re-open" vs "Reopen". | Align with `jobStatusLabel`; same slot + spelling |
| E13 | MED | Send flows all differ: quote/invoice 1-click POST, agreement-from-quote template Modal, review/OMW `sms:` deep links, reminders cron-only, client email bespoke overlay (not the Modal primitive). | One `SendSheet` (recipient, email/SMS toggle, preview link) |
| E14 | LOW | Delete confirmation has three dialects (type name / type DELETE / sheet); invoice-with-payments uses a hand-rolled Modal. | Shared `dangerConfirm({ typeToConfirm })` |
| E15 | LOW | Tab-bar Create sheet lacks "Recurring plan" though `/subscriptions/new` exists; `ContactCreateMenu` lacks Estimate/Recurring. `AppointmentActions` builds its own primary-button class and `z-20` menu. Invoice editable while ARCHIVED (quotes aren't). "Mark as... Approved" beside "Mark Approved". | — |
| E16 | LOW | Status chips outside the shared system: subscriptions "Paused" stamp, calls own STATUS map, timesheets stamps; filter labels ("To invoice", "Awaiting") diverge from `statusLabels` ("Requires Invoicing", "Awaiting Payment"). | Add kinds to `lib/statuses.ts`; StatusChip only |

---

## Part 4 — Forms & saving

Four save models coexist: explicit bottom Save (record forms) · per-card Save (Profile,
Products, Booking) · 800 ms debounced autosave with no button (main Settings) ·
save-on-blur/on-change (Team hourly/role, Pipeline name/color, CalendarSync). "Saved"
feedback exists only in main Settings, Booking, Subscriptions, SignInMethods. Error
placement: top `.form-error` banner (most record forms) vs bottom plain red `<p>` with no
`role=alert` (AppointmentForm, ScheduleJob, contact cards, AssignTeam) vs toast (Leads).
`useUnsavedWarning` exists but only EstimatorEditor uses it.

| # | Sev | Finding | Fix |
|---|---|---|---|
| F1 | HIGH | **Date-only pick shifts to the previous evening.** `SlotTimePicker` + `joinLocalDateTime` (`lib/scheduling.ts:96-99`) return bare `YYYY-MM-DD` when a date is picked without a time; `localInputToISO` (`lib/statuses.ts:167`) does `new Date(value)` → UTC midnight → 7 PM previous day Central. Reached from `jobs/new/page.tsx:190`, `AppointmentForm.tsx:128`, `ScheduleJob.tsx:87`, `AppointmentActions.tsx:160`. End-time autofill also skips (`length >= 16` fails). | `localInputToISO`: treat length 10 as invalid or anchor `T12:00`; forms require a time unless "anytime" |
| F2 | HIGH | **Settings autosave drops the last edit on navigation.** Cleanup clears the 800 ms timer on unmount (`SettingsClient.tsx:1143`); any change <800 ms before clicking a Setup link or Back is lost. No `beforeunload`. Same in `booking/[id]/ItemEditor.tsx:207-216` (700 ms). Overlapping PATCHes also merge `savedRef` in completion order → stale value wins silently. | Flush pending diff in cleanup with `keepalive: true`; serialise saves; `useUnsavedWarning` |
| F3 | HIGH | **Settings shows "Saved" for values the server discarded.** `settings/route.ts:52` `name: body.name \|\| undefined` (clear the required name → "Saved", field empty); `:120` surcharge `NaN`→null→ignored, `max=10` never enforced (no `<form>`); interval silently ignored. Client sets `savedRef` to what it sent. | Return 400 with field message; client blocks empty name |
| F4 | HIGH | **Silent mutation failures** (raw `fetch`, response unread): `ContactNoteForm.tsx:17-24` (textarea cleared on 4xx — note lost), `RequestActions.tsx:39-50`, `AddressesCard.tsx:117`, `PeopleCard.tsx:109`, `PhotoUpload.tsx:104`, `SavedCardsCard.tsx:118,138` (payment method!), `EntryActions.tsx:220`, `SettingsClient.tsx:1190`, `ProfileClient.tsx:132`, `QuickBooksSettingsClient.tsx:123`, `ProductsClient.tsx:222,236`, `AskForReview.tsx:48`. | Sweep to `postJson` + component `error` state; only clear/refresh on `ok` |
| F5 | HIGH | **PlaceSheet duplicates the contact on retry** (`schedule/PlaceSheet.tsx:290-309`): inline contact POSTed first into a local `let`; if the job POST fails, tapping again creates a second contact. | Persist created id into state before the job call |
| F6 | HIGH | **Invoice edit wipes `unitCost` on every save** (`invoices/[id]/edit/page.tsx:51-59` omits it → editor sends `null` → stored). Margin tracking lost on any edited invoice. Header comment in `LineItemsEditor.tsx:8-10` claims this was fixed (create only). | Pass `unitCost` through the edit page + `EditInvoice` type |
| F7 | MED | Tax rate renders `7.000000000000001` on invoice edit (`invoices/[id]/edit/page.tsx:40`); quotes round correctly. | Use the same rounding helper |
| F8 | MED | Modal save errors invisible: banner set at page level while Modal (z-50) stays open (`ContractTemplatesClient.tsx:78-82,142`, `BookingHome.tsx:222-229,309`). | Render error inside the modal |
| F9 | MED | `jobs/new` + `requests/new` load contacts with `.then(r=>r.json()).then(setContacts)`; on 401/403 `contacts.find` throws → error boundary. Also `"use client"` pages with no `requirePageActor`, so TECH can bookmark the form and fail on save. | Server page wrapper with the nav's predicate; load contacts server-side like quotes/invoices |
| F10 | MED | `jobs/new` address effect (`:134-140`) overwrites a typed job-site address when the contacts fetch resolves late. | Only prefill when `form.address === ""` |
| F11 | MED | Blank line-item row blocks job create with only a browser tooltip: `LineItemsEditor.tsx:112` passes `required`; job forms lack `onInvalidCapture` (Quote/Invoice have it). Same gap in ContactForm, CollectPaymentForm. | `required={!allowEmpty}`; `onInvalidCapture` banner on every `<form>` |
| F12 | MED | Subscriptions page never re-syncs: no `router.refresh()`; billNow/runAll say "Refresh to see…"; `saveEdit` writes form values not the server row. | `router.refresh()` / merge `data` |
| F13 | MED | Optimistic edits with no rollback: Pipeline (`PipelineSettingsClient.tsx:69-118`), Booking hub form; `<input type=color onChange>` fires a PATCH + refresh per drag tick. Client-fields reorder = two concurrent non-atomic PATCHes (`ClientFieldsClient.tsx:79-86`). | Snapshot/restore; commit color on blur; `/reorder` endpoint |
| F14 | MED | Modal/panel drafts never reset on reopen (`EntryActions.tsx:180`, `AppointmentActions.tsx:72` reschedule, `ScheduleJob.tsx:65`, `TeamClient.tsx:91`, `BusinessLineCard.tsx:238,342,433`). | Reset in open handler or `key` on `id+updatedAt` |
| F15 | MED | DangerZone / QuickBooks handlers strand `busy=true` on network error (no try/finally); QuickBooks treats a 500 on status as "not connected". | try/catch/finally + `loadError` |
| F16 | LOW | Phone/email inputs: no shared formatter; `type="tel"` on some, plain text on Profile/Team; Leads QuickAdd splits one "Phone or email" field on `@`, single-word names get `lastName: "—"`. | `PhoneInput` primitive; `type="tel" inputMode="tel"` everywhere |
| F17 | LOW | Inline contact creation exists only in PlaceSheet and Leads QuickAdd; job/appointment/request forms link out and lose the form; quote/invoice offer nothing. | `QuickContactSheet` inside `ContactPicker` |
| F18 | LOW | Same choice, different widgets: time = SlotTimePicker vs native `datetime-local` (timesheets) vs 30-min `<select>` (NewSeries) vs PlaceSheet's own; address = single line vs structured; no autocomplete anywhere though a Mapbox token exists. | — |
| F19 | LOW | 14 `htmlFor` across 404 labels; div+onClick "forms" (Expenses, Contracts new, Subscriptions, timesheets, Profile, Team add, Products, ScheduleJob, contact cards) never submit on Enter, never run `required`. | `Field` primitive; wrap editors in `<form onSubmit>` |
| F20 | LOW | `parseFloat(x) \|\| 0` turns "1,200" into $0 and saves it (LineItemsEditor consumers, Products). Job title required on edit but optional on create. `components/LeadForm.tsx` / `EstimateForm.tsx` are dead marketing forms that fake a submit with `setTimeout`. | `Number.isFinite` + inline error; delete dead forms |

---

## Part 5 — Visual primitives (partial migration)

The 2026-09-03 pass added `.btn-primary`, `Input`/`inputCls`, `StatusChip`, `confirmSheet`,
`PageTitle`, `EmptyState`, `ListSkeleton`, and a dark-mode class bridge. The problem now is
partial adoption. Counts from a JSX tag parser over every opening tag:

| # | Sev | Finding | Fix |
|---|---|---|---|
| U1 | HIGH | No Button primitive. 685 buttons; `.btn-primary` on 116. Hand-typed: 111 solid in 74 recipes, 61 outlined not using `btn-tool-line` (48 recipes), 52 danger in 29 recipes, 43 link-style in 25, 47 icon-only in 25. Six radii, four heights, three label sizes. Danger is solid red / ghost red / bare `text-red-400` depending on page. | `components/Button.tsx` (variant × size × loading, `as={Link}`); codemod the two dominant recipes, hand-fix rest (~225 sites) |
| U2 | HIGH | Inputs: 251 text inputs → 60 `inputCls`, 46 `<Input>` (5 files), 117 hand-typed in 41 recipes. 8 focus-ring colors. Selects: 0 `appearance-none` so OS chrome varies. `BusinessLineCard.tsx:41` still has its own `inputCls`-alike. | Codemod the 50 byte-identical recipes; add `size="sm"` to Input for dense rows |
| U3 | HIGH | Page headers: PageTitle in 24 route dirs, 41 hand-roll — and the hand-rolled h1 (`numeral-ledger text-2xl font-semibold`, 27 copies on every detail + new page) is a different recipe from PageTitle (26px bold on phones, collapses into the bar). 11 h1 recipes total. | Swap the 27 to `<PageTitle>`; add `actions` + `back` props |
| U4 | MED-HIGH | Status colors: `lib/statuses.ts` covers 8 kinds; 4 more maps live elsewhere (payments PENDING **blue** vs invoice awaiting **amber**; calls `CallRow.tsx:36`; schedule `blockTone`; subscriptions/timesheets stamps). "Past Due" / "Past due" / "Overdue" — three spellings, two reds. 36 hand-rolled `rounded-full bg-gray-100` pills form a second pill language beside `.stamp`. | Add kinds; delete local maps; one label, one red |
| U5 | MED | Dark theme is a class-remap bridge (147 rules); ~175 of 275 color utilities in use aren't bridged. Visibly broken: `border-gray-900` selected states (`BusinessLineCard.tsx:153,815`, `PublishPanel.tsx:87`), `text-[#9CA3AF]` (`SettingsClient.tsx:1819-1846`), `bg-white/90` (TimeGrid, RouteMap), 16 `bg-black/5` hovers, 50 inline hex styles. `AppLock.tsx` uses a third mechanism. | Add the ~12 missing selectors now; check in the used-vs-bridged diff script as a CI guard; long-term expose `--t-*` tokens as Tailwind colors |
| U6 | MED | Modal: 26 uses but 18 distinct `cardClassName` overrides (14 re-specify the pre-ledger `rounded-lg bg-white shadow-xl`). Two hand-rolled dialogs with no Escape/animation (`EmailClientButton.tsx:80`, `RouteMapClient.tsx:1318`). | `size` + `flush` props; migrate |
| U7 | MED | Empty states: EmptyState on 11 pages; 26 ad-hoc "No … yet" in 14 wrapper recipes (contracts, subscriptions, leads, automations, contract templates, schedule, invoice payments, photos). | `icon` prop + `compact` variant; migrate 8 list pages |
| U8 | MED | No toast system except the calendar's UndoToast. 25 `alertSheet` used as a success modal, 7 green-banner recipes, 19 `setTimeout` dismissals with 7 durations. Busy labels: "Saving…" / "Saving" / "Sending..." / "Please wait". | Global `toast()` mounted in AppShell; `loading` on Button |
| U9 | MED | 54 of 71 page routes have no `loading.tsx`, including every `[id]` detail page — list pages skeleton, detail pages flash blank. | `DetailPageSkeleton` + loading.tsx for the 8 detail routes |
| U10 | MED | 149 h2 in 39 recipes; three sizes and three inks for "card title". | `<SectionHeader size="card\|eyebrow\|block">` (already on the desktop-redesign list) |
| U11 | LOW-MED | Money: `money()` canonical (133 calls) but 6 local copies + 11 `$${…}` templates; copies render "-" not "−", some drop cents. | `money0()` / `moneyCents()`; delete copies |
| U12 | LOW-MED | 22 lucide sizes (13/14/15 all mainstream); ✓ and ⚠ emoji used as icons in 7 places. | Declare 12/14/16/20/24 scale; `<Check>` |
| U13 | LOW | `matchMedia` re-implemented in 8 components; 21 `md:` leaks among 692 `lg:`; 15 page-container strings; 26 pre-ledger cards; pre-auth pages hardcode `#0B57D8` so tenant brand never reaches activate/invite. | `useIsMobile`; `<Page width>`; brand the activate flow |

---

## Part 6 — Bugs (code-level, not style)

| # | Sev | Finding | Fix |
|---|---|---|---|
| C1 | HIGH | **Reactivating an archived service wipes its recurring + agreement settings.** `ProductsClient.tsx:231` PATCHes `{isActive:true}` only; `work-items/[id]/route.ts:31,56` runs `sanitizeRecurringAndAgreement` on every PATCH and spreads the result, which nulls interval/template/requiresAgreement when keys are absent (`lib/work-items.ts:153-192`). Any partial PATCH does the same. | Only spread when one of the six keys is present in `body` |
| C2 | HIGH | **Server-rendered times are UTC.** No `timeZone` in server components: `jobs/[id]/page.tsx:352-363` (desktop schedule line), `jobs/page.tsx:186`, `appointments/page.tsx:89`, `appointments/[id]/page.tsx:61`, `requests/[id]/page.tsx:140`, `timesheets/page.tsx:80-249`, `contracts/[id]/page.tsx:81`, `dashboard/page.tsx:352-391` (loads `tz` but `fmtTime` ignores it). `shortDate()` (`lib/statuses.ts:157`) has no tz and is used in 18 files → evening events print tomorrow's date. CSV export dates UTC. `lib/format.ts` already takes `tz`; only 2 calls pass it. | Stopgap: pin `TZ` on Railway. Real fix: `shortDate(d, tz)`, thread `company.timezone` into the 13 pages, ESLint ban on `toLocale*String(` outside `lib/format.ts` |
| C3 | MED | "Today/this week/this month" at UTC midnight (7 pm Central): `timesheets/page.tsx:27`, `payments/page.tsx:149-173` (MTD shifts after 7 pm), `appointments/page.tsx:28,43`, `go/next-job/route.ts:23`, `api/app/offline/route.ts:16`. Dashboard and Business already use `startOfDayIn(tz)`. | Use `lib/timezone.ts` helpers |
| C4 | MED | **TECH can download a priced quote PDF.** `quotes/[id]/pdf/route.ts:10-16` checks only actor + contact scope; invoice PDF gates on `canSeeMoney`. A tech can be a lead owner, so "no pricing anywhere" is broken. | `canSell` gate; exclude TECH from lead-assignee pickers |
| C5 | MED | USER/SALES can't create a scheduled job from `/app/jobs/new` in multi-person companies: crew picker loads from manager-only `GET /api/app/team` (403 → `[]`), server then answers `NEEDS_CREW` with no picker to satisfy it. | Relax `/team` to `canSell` with slim select, or make jobs/new a server page |
| C6 | MED | `GET /api/app/contacts` returns whole rows incl. `hubToken` (client-portal login) and `finixBuyerIdentityId` to every seller, unbounded, for two pickers. | `select` + `take` |
| C7 | MED | Overdue badge and bell use `dueDate < now` (`nav-counts/route.ts:29`, `notifications/route.ts:106`); invoices page uses `pastDueFilter()`. Red count disagrees with the Past Due tab most of the due day. | `pastDueFilter()` in both |
| C8 | MED | Billing blocks gated on `canSeePricing` not `canSeeMoney` (`jobs/[id]/page.tsx:42,602-628`, `contacts/[id]/page.tsx:140-215,649`, `quotes/[id]/page.tsx:160-177` + `collect-deposit/route.ts:25`). SALES with payments off sees amounts and links that bounce. "Create Invoice" is the primary mobile CTA after completing a job even for roles that can't invoice (`JobActions.tsx:187`). | `canSeeMoney` everywhere; pass `canInvoice` |
| C9 | MED | `key={i}` on line-item rows (`LineItemsEditor.tsx:103`) + `WorkItemPicker` initialising `customMode` once → delete a preset row above a custom row and the custom row's tap opens the price-book sheet instead of the keyboard. | Stable client ids |
| C10 | MED | PlaceSheet duration hint overwrites a duration the user just typed (stale `durationTouched` closure, `PlaceSheet.tsx:209-231`). | Ref |
| C11 | LOW | Calls page ignores contact scope for SALES/USER and `markCallsSeen` marks the whole company; voicemail route likewise unscoped. | Scope both |
| C12 | LOW | Appointment reassignment: API allows USER, pages give the roster only to managers. Chat spinner cleared by the wrong channel (`ChatClient.tsx:250-273`). Booking option lists keyed by label (duplicate labels → duplicate keys/values). `payments/route.ts:86-90` returns raw `e.message` at 500. `SettingsClient.tsx:357-362` calls `load()` inside a state updater. `GET /api/app/jobs` unbounded with no caller. | — |

Checked and clean: dead links (75 targets all resolve; `?s=` keys valid), tenant scoping of
every `app/api/app` write, money math (one totals helper, editors match server), hooks /
`"use client"` placement, N+1, role literals, native `confirm/alert` (zero — all through
ConfirmSheet), `console.log` in prod paths, TODO/FIXME.

---

## Suggested order of work

**Batch 0 — verify (you):** `railway variables | grep TZ` on staging + prod.

**Batch 1 — bugs that lose data or show wrong facts (1–2 days):**
C1 service reactivation · F1 date-only shift · F6 invoice unitCost · F2/F3/F15 settings
autosave flush + reject-instead-of-ignore · C2/C3 timezone (pin TZ, then `shortDate(tz)` +
13 pages + 5 boundary calcs) · F4 silent-mutation sweep (12 sites) · F5 PlaceSheet
duplicate contact · E1/E4/E5 quote/request/invoice action fixes.

**Batch 2 — permissions (half day):** C4 quote PDF · C5 team roster for sellers · C6 contacts
select · C7 pastDueFilter · C8 canSeeMoney · N10 salesSeePayments into AppShell.

**Batch 3 — settings IA + naming (2–3 days):** Part 1 regrouping (Phone & texting section,
one Automations, personal Account page) · one `SETTINGS_SECTIONS` source for index, ⌘K,
More sheet and every "Settings → X" string · Part 2 terminology sweep (Agreement, Client,
Services, Team chat, Pricing tools, Recurring/plan/visit) · fix More-sheet "Team" group ·
`<BackLink>` primitive from the mobile-nav parent table · Team Map/Timesheets into
managers' nav.

**Batch 4 — entity parity (2–3 days):** Contracts/Appointments/Calls/Messages lists get
FilterBar + search + Pager + New · ActivityTrail on contact + job with full label map ·
`NoteFeed` shared component · `SendSheet` shared send flow · "All" rule · manual payments
tab · quote↔agreement + contact→messages links · one delete/archive confirm dialect.

**Batch 5 — primitives (multi-session, mechanical):** `Button` + codemod · Input codemod ·
PageTitle swap (27 h1s) · statuses.ts kinds · dark-bridge gap script in CI + 12 selectors ·
Modal `size` prop · EmptyState `icon` · global toast · SectionHeader · detail-page
loading.tsx · Field/`htmlFor` + `onInvalidCapture` + `useUnsavedWarning` on every form.

---

## Status — 2026-09-23 (branch `ux-audit`, worktree ~/knightlydigital-wt/ux-audit)

David's decisions: keep the naming (Quotes/Estimates, Clients/Customer, Agreements/Contract, Chat/Messages, Services, Recurring are intended); fix back-button styles; merge Agreements + templates into one page; fix the bugs; sweep rogue/outdated styling.

**Shipped in `cfefde0` (batch 1):** Part 1 settings regroup (lib/settings-nav.ts is the single source; old `?s=` keys redirect; every "Settings → X" string corrected); one Agreements page with Agreements | Templates switch, FilterBar/search/Pager/New, resend action, From-quote link; C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F12, F13, F14, F15, E1, E4, E5, E9, E10 (quote↔agreement), N9 partly, N10.

**Shipped in batch 2:** N9/N16 BackLink primitive on 36 pages with targets = `parentFor`; U3 PageTitle on 24 pages; U6 Modal size/flush + 24 sites + 2 hand-rolled overlays; U7 EmptyState icon/compact on 13 pages; U10 SectionHeader on 50 h2s; U1 partial (danger/primary outliers, `.btn-danger`); U11 money copies.

**Deliberately not done:** all naming items (N2–N8); E7 manual payments list, E8 "All" rule, E11 NoteFeed, E12/E13 send-sheet, E14–E16, U1 full Button primitive, U2 input codemod, U4 status kinds, U5 dark bridge, U8 toast, U9 detail loading.tsx, U12/U13, F11, F16–F20.

**Still owed by David:** `railway variables | grep TZ` on both envs; device pass of Settings (new grouping), Agreements page, back arrows, section headers (older 13px gray titles now render as the current recipe).
