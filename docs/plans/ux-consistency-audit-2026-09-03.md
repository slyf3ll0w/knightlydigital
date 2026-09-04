# Workbench UX & Consistency Audit (2026-09-03)

Trigger: David — "we have built a ton of good features but user friendliness and consistency across the software is lacking, mainly on functionality but also on looks."

Method: code-level audit of `app/platform/**`, `components/**`, `lib/**`, `app/globals.css` (66 pages, 226 tsx files). Counts below come from greps run on a5cbc55. No logged-in visual pass (local `.env.local` has no DATABASE_URL); the July CRUD/cohesion overhaul (`crud-cohesion-overhaul.md`) is taken as done and not re-reported.

Headline: the *detail pages* are already consistent (same back-link + status-chip + ledger h1 + actions shell on jobs, invoices, quotes, contacts, requests, contracts, appointments). The inconsistency lives in three other places: **naming/IA**, **feature parity between list pages**, and **a design system that exists only as repeated class strings**.

---

## A. Naming & information architecture (biggest user-friendliness cost)

**A1. Same thing, different names; different things, same name.**

| Concept | Names in the UI today | Where |
|---|---|---|
| Signed document | **Agreements** (nav, `/app/contracts`, New sheet "Agreement", empty state "No agreements yet") vs **Contracts** (Business group item → `/app/settings/contracts`, which is *templates*; settings label "Contract Templates") | Both "Agreements" and "Contracts" sit in the same desktop rail and mean different things |
| Customer | **Clients** (nav, "Client Custom Fields", "Import Clients") vs **Contact** (`/app/contacts`, `ContactForm`, "Add contact" button) | User-facing string "Client" 17×, "Contact" 1×, "Customer" 3× |
| Recurring billing | **Recurring** (nav) vs `/app/subscriptions` (URL) vs **Series** ("New Series", "No recurring series yet") vs "Repeats monthly" (expenses) | |
| Price book | **Services** (nav) vs `/app/settings/products` vs **Products & Services** (settings) | |
| Online forms | **Booking & forms** (nav) vs **Booking Forms** (settings) | |
| Scheduled work | **Job** (everywhere) vs **Visit** (booking settings: "Each visit lands on the schedule as a job") | |
| Business | Group label, item label, *and* a hub page (`/app/business`, 114 lines) that only links to Insights / Team Map / Timesheets | A page that is just a menu |

Fix: pick one word per concept, write it in `lib/` as a tiny vocabulary (`CLIENT`, `AGREEMENT`, …) or just a checklist, rename nav + labels + empty states + New sheet + settings in one pass. Recommend: Client, Agreement (templates = "Agreement templates"), Recurring, Services, Booking & forms, Job.

**A2. Five inbound-work surfaces.** Requests, Leads (board), Messages, Appointments, plus Chat (team). Schema still carries `Request` *and* legacy `BookingRequest` *and* `WebForm`. "Lead" is simultaneously a contact status, a kanban board, and a New-sheet entry that is really `contacts/new?type=lead`. A new user cannot predict where a web submission lands.

Fix (product decision): one **Inbox** (requests + new leads + unread client messages) with tabs, Leads board demoted to a view of it. At minimum: make the Requests and Leads empty states explain which one a web form feeds.

**A3. Settings live in two systems.** `/app/settings` has four in-page sections (`?s=business|customization|payments|features`) *plus* ten standalone routes (products, contracts, pipeline, booking, quickbooks, addon, team, client-fields, import, profile). Five of those are also promoted into the main nav under "Business" with *different labels* (Services / Contracts / Booking & forms / Team). Result: the same page is reachable from two places under two names.

Fix: one settings index (all sections as routes, one label each); nav "Business" group links to the index or to the same labels.

**A4. Reachability gaps.** Insights (483 lines, the reporting page) has no nav entry and is only linked from the Business hub and Expenses. Expenses, Team Map, Roadmap reachable only via hub/dashboard cards. Chat is linked only from NativeShell. Timesheets are hidden from managers in nav on purpose but the hub detour is 2 taps deeper than any other list. `settings/booking/types/[id]` is a redirect stub (fine, but delete once no links remain).

## B. Functional parity across list pages

Thirteen list pages, one pattern applied to five of them.

| List | Search | Filter chips | Skeleton (`loading.tsx`) | EmptyState component | CSV export | Global search covers |
|---|---|---|---|---|---|---|
| Clients | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Jobs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Quotes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Invoices | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Requests | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| Leads | ✓ | – | – | ad-hoc | – | (as contacts) |
| Appointments | – | – | – | ✓ | – | ✓ |
| Payments | – | – | – | ✓ | ✓ | – |
| Agreements | – | – | – | ad-hoc | – | – |
| Recurring | – | – | – | ad-hoc, **unbounded query** | – | – |
| Timesheets | – | – | – | **none** | ✓ | – |
| Expenses | – | – | – | ad-hoc | – | – |
| Messages | – | – | ✓* | ✓ | – | – |

(*Messages has no `loading.tsx` but is light.)

Other parity gaps:
- **Create on phone**: 8 list pages hide their New button below `lg` and rely on the tab-bar FAB, but the FAB's New sheet has no Expense / Time entry / Series / Message. Those pages each invented their own in-page button ("Log Expense", "Add time entry", "New Series", "Collect Payment"). Agreements and Messages have neither on mobile.
- **Create forms**: only Appointments and Requests let you add a new client inline; Jobs, Quotes, Invoices, Agreements, Recurring make you leave the form. `lib/use-unsaved-warning.ts` exists and is used by **zero** forms. Required fields are marked `*` in 40 places and "(optional)" in 16 — both conventions, never one.
- **Edit entry point** varies: `/edit` page (Clients, Jobs, Quotes, Invoices), "⋯ → Edit" (Appointments, Requests, Clients), pencil button (Agreements), inline row edit (Recurring, Expenses, Timesheets). Accepted in July, but the *trigger* should look the same everywhere (always in ⋯).
- **Delete**: Recurring has no delete or archive; Payments has a DELETE API but no UI; Agreements' actions component is the only one without the ⋯ menu.
- **Date/time picking**: native `<input type=date>` in 6 forms, `SlotTimePicker` in Jobs/Appointments — two idioms for "pick a time".

## C. Feedback, dialogs, errors

- **Silent saves.** `router.refresh()` is called 96×; `showToast` 7×; a visible "Saved" appears 3×. Most edits give no confirmation at all. Fix: one `toast("Saved")` helper called by every mutation; rename to plain past-tense ("Sent", "Charged", "Archived").
- **Error styling is three shades of red** (`text-red-600` 102×, `text-red-700` 49×, `text-red-500` 14×, `bg-red-50` 69×) and no `role="alert"` anywhere (screen readers never hear them). Fix: `<FormError>` component.
- **Dialog primitives**: `Modal` (17 files) and `BottomSheet` (4) coexist; one stray `window.confirm` in `app/book/[slug]/schedule/manage/[token]/ManageBooking.tsx:137` against 35 files using `confirmSheet`.
- **Icon-only buttons** lean on `title=` (113×) over `aria-label` (88×); `title` does nothing on touch.

## D. Visual system (exists as habit, not as tokens)

- **Primary button = 66 distinct class strings.** The same green CTA is hand-typed with `px-4 py-2` / `px-5 py-2.5`, `gap-1.5` / `gap-2`, with and without `active:`. `globals.css` has `.btn-tool` / `.btn-tool-line` (chrome only) but no `.btn-primary`. Fix: `<Button variant="primary|secondary|danger|ghost" size>` and delete the strings.
- **Inputs**: 17 files define their own `inputCls` constant (two of them byte-identical); `components/Input.tsx` is used by 4 files; 223 raw `<input>`, 79 `<select>`, 33 `<textarea>`. Fix: `<Field>` + `.input` class.
- **Headings**: 12 different `<h1>` class strings. `PageTitle` used on 12 of 66 pages. Detail pages agree (`numeral-ledger text-2xl font-semibold`); auth, settings and hub pages each do their own thing (`font-extrabold`, `text-center text-[22px]`, `font-display text-lg`).
- **Two corner-radius systems**: `rounded-lg` (8px, 411×) vs `rounded-[10px]` (230×) plus 12 other values. Cards and buttons in the same row often disagree by 2px.
- **Page widths**: `max-w-6xl` (Jobs), `4xl` (most), `3xl` (Agreements, Appointments) — content jumps width between sibling pages.
- **Formatting**: `money()` 118× but `toFixed(2)` still 18×; dates formatted 14 different inline ways (`fmtDate` used 8×). Phone numbers have no display formatter at all.
- **Legibility on phone**: 129 uses of 10–11px text; 122 combinations of `text-xs` + `text-gray-400` (~2.9:1 on white, below AA 4.5:1). This is the single biggest "looks cheap / hard to read" contributor on mobile.
- **Dark mode** is a CSS bridge (`color-scheme: dark` at `globals.css:2009`), not tokens; `dark:` appears in 0 files. Every hardcoded `text-gray-*` (2,250×) is a latent invisible-text bug (already bitten twice per memory).

## F. Live pass (prod, Summit Plumbing test account, phone 390px + desktop 1366px, same day)

Confirms A–D and adds these:

- **F1. Lists are ordered by "last touched", not by anything the user can see.** Jobs and Clients use `orderBy updatedAt desc`, so the Jobs list reads Sep 3, Sep 9, Sep 4, Sep 3, Aug 25, Aug 18, Aug 24… and editing a job reorders the list. Quotes/Invoices/Requests use `createdAt`. No list has a sort control. Fix: Jobs by `scheduledAt` (upcoming first, unscheduled pinned), Clients alphabetical, and a sort chip on the shared list shell.
- **F2. Three filter idioms on sibling lists.** Jobs = segmented control; Invoices = five-segment control that crowds on a phone ("Awaiting Past due" reads as one label); Quotes = "All quotes ▾" dropdown; Clients = "Clients ▾" dropdown + "Mine" chip + "Leads board →" link; Requests = "All requests ▾" + "My leads" chip (leads on the requests page, see A2). Fix: one `FilterBar` (segments ≤4, dropdown beyond).
- **F3. Row hierarchy flips between lists.** Jobs rows lead with the job title, client second; Quotes and Invoices lead with the client name and "#3" second; Schedule cards lead with client then service. The same job is described three ways across three screens. Fix: one `ListRow` (primary = what it is, secondary = who/when, trailing = money + status).
- **F4. KPI strips differ per list and one misleads.** Jobs shows one tile (Active 13), Quotes two, Invoices one, Clients none. The Invoices footer reads "6 invoices · $2,140.00", which is the *outstanding* sum, not the total of the rows shown ($5,964). Fix: label the footer figure, or show the row total.
- **F5. Three floating layers stack at the bottom of a phone job page.** The docked "Complete Job" pill, the "+" FAB and the tab bar overlap the "Photos · Add" card. On desktop the same action sits in the header. On the dashboard "Today" row, the Call/Directions buttons overlap the row text ("Jerome Brooks · David L…"). Fix: hide the FAB when a page docks its own primary; give swipe rows their actions on swipe only.
- **F6. Unlabeled icon buttons.** Clients header has three icon-only buttons (sort / import / export), Schedule has two; bottom-tab links carry no accessible name. Phone numbers render raw (`2145550196`) everywhere, confirming the missing formatter.
- **F7. Every page logs a React hydration error** (#418, text mismatch) plus `Cannot read properties of null (reading 'parentNode')`. The greeting ("Good afternoon") and times are rendered server-side in one timezone and re-rendered on the client, so React throws the server HTML away and re-paints, which costs first-paint time and can flash. Fix: client-render the greeting/times (or `suppressHydrationWarning` on those nodes) and find the `parentNode` caller.
- **F8. Native `<select>` controls sit beside custom controls.** Schedule "Everyone", Photos "Photo ▾", Settings "Industry" are system dropdowns inside an otherwise custom UI. Fix: one styled `Select`.
- **F9. Nav grouping on phone.** The More sheet's "Team" group holds Team Chat, Booking & forms, Team, and Settings. The desktop Settings page is the best-organized surface in the app (Business / Setup / Workspace, one label each); the nav should mirror it rather than invent a second grouping.

### Progress

- **F1 + F2 BUILT 2026-09-03 (uncommitted at time of writing).** `lib/list-sort.ts` (named sorts per list; Jobs default = by schedule with unscheduled pinned first, Clients = A–Z, Quotes/Requests = newest, Invoices = newest with "Due soonest"), `components/FilterBar.tsx` (≤4 statuses → segmented on phone, more → dropdown; scope chips + sort menu; chip rail + sort on desktop), `FilterSelect` gained `icon="sort"` + `align`. Applied to Jobs, Invoices, Quotes, Requests, Clients. Clients now uses the shared `MobileSearch` instead of its own form; "Leads board →" chip removed from the Clients filter bar (Leads is in the nav); Requests' "My leads" chip renamed "Mine" to match Clients. Status links now carry search + sort instead of dropping them. `tsc` + `next build` green.

## E. What is already consistent (keep)

Detail-page shell; `StatusChip` + `lib/statuses.ts` (31 files); `confirmSheet`/`alertSheet` discipline; `SECTION_HUES` per section; `EmptyState` where used; `money()`; KPI strips; the FAB New sheet on phones.

---

## Fix plan (decide once, apply everywhere)

**Batch 1 — Vocabulary & nav (1 day, zero risk).** Rename per A1; one settings index (A3); add Insights to nav, fold the Business hub page into it (A4); make Requests/Leads empty states say what feeds them.

**Batch 2 — Primitives (2 days).** `<Button>`, `<Field>/<Input>/<Select>/<Textarea>`, `<FormError role=alert>`, `toast()` on every mutation, `fmtDate/fmtTime/fmtPhone` in `lib/format.ts`, one radius token (pick 10px), one `.text-meta` class for small grey text at ≥12px/gray-500. Codemod the 66 button strings and 17 `inputCls` constants.

**Batch 3 — List-page parity (2 days).** `ListPage` shell = title + search + chips + skeleton + EmptyState + export. Apply to Appointments, Payments, Agreements, Recurring, Timesheets, Expenses, Messages. Bound the Recurring query. Add Expense / Time entry / Series to the New sheet, or give every list the same in-page button.

**Batch 4 — Forms (1 day).** Inline "new client" in every create form via `ContactPicker`; wire `useUnsavedWarning` into all editors; one required-field convention ("(optional)" only, since most fields are required); one edit trigger (⋯ → Edit) on every detail page.

**Batch 5 — Inbox (product call, 2–3 days).** Merge Requests + new Leads + unread Messages into one Inbox; retire `BookingRequest`/`WebForm` models after the v3 booking migration settles.

Verification: re-run the greps in this doc; targets = 1 primary-button string, 0 `inputCls` constants, 0 `toFixed(2)` in tsx, 0 `text-gray-400` + `text-xs` pairs, `loading.tsx` + search on all 13 lists.
