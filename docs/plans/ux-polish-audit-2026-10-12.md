# WorkBench polish audit — 2026-10-12

Read-only pass over main at `8d0c66b1`, after the design-system rollout. Six
angles: the new owner's first hour, what the customer sees, daily record work,
settings/plans/gates, the app shell + system feedback, API error text + Help
Center drift. Every HIGH was re-read at the cited lines by hand. Nothing here
repeats `ux-consistency-audit-2026-09-22.md` or `code-audit-2026-10-06.md`
unless marked **still open**. Naming (Quotes/Estimates, Clients/Customer,
Agreements/Contract, Chat/Messages) is intended and not reported.

## The six things to fix first

| # | What the user hits | Where |
|---|---|---|
| 1 | Every new company gets an **empty price book** while the dashboard says "Your price book is ready". Apply/invite forms send free text ("hvac", "lawn care"); the lookup is an exact key match on "HVAC"/"Plumbing". | `components/ApplyForm.tsx:500-508`, `components/InviteSignupForm.tsx:293-302`, `lib/pricebooks.ts:216-219`, `app/platform/dashboard/DashboardSetupCard.tsx:43` |
| 2 | **No root `app/not-found.tsx`.** A mistyped `/app/...` URL, a voided agreement, a rotated portal link, a bad pay/quote token: all show Next's bare "404 \| This page could not be found", unbranded and dark-mode-following. | `app/contract/[token]/page.tsx:28`, `app/pay/[token]/page.tsx:112`, `app/quote/[token]/page.tsx:93`, `app/hub/[token]/layout.tsx:46`, `app/message/[token]/page.tsx:52`, `app/book/[slug]/page.tsx:24` |
| 3 | **"Unauthorized" / "Forbidden" shown verbatim** in dialogs. `postJson` passes the body through; no client code looks at 401. An expired session on a stale tab gives "That didn't go through — Unauthorized" with no sign-in link. | `lib/safe-fetch.ts:10-25`, 287 routes return `{error:"Unauthorized"}`, 197 return `{error:"Forbidden"}`; shown via 158 `data?.error ?? GENERIC_ERROR` sites e.g. `components/EntityRowActions.tsx:36` |
| 4 | **First quote/invoice dead-ends with no clients.** Create sheet offers Quote/Invoice on day one; the ContactPicker says "No matching clients." with no add action; submit says "Please select a client." The job form's "+ Add new customer" link loses the half-filled form (ContactForm pushes to the contact page, no returnTo). | `components/ContactPicker.tsx:158,201`, `app/platform/quotes/[id]/QuoteEditor.tsx:207,301-310`, `app/platform/invoices/new/InvoiceEditor.tsx:193,291-306`, `app/platform/contacts/ContactForm.tsx:152` |
| 5 | **Unsaved-changes guard on 7 files, missing on 9 forms** (New Job 20 fields, Job edit, Appointment, Contact, Request, Recurring plan, PlaceSheet, Task, Sticky note). Task/Sticky modals close on any backdrop tap. | grep `useUnsavedWarning`; `components/tasks/TaskEditor.tsx:197`, `components/sticky/StickyEditor.tsx:184`, `components/Modal.tsx:105` |
| 6 | **Archived invoice still shows the full card form**; the customer types their card and only then gets "This invoice is no longer active." Archived quote renders as a bare priced document with no stamp, no buttons, no explanation. | `app/pay/[token]/PayPage.tsx:147,491`, `app/api/public/pay/[token]/route.ts:62-65`, `app/quote/[token]/QuoteAcceptPage.tsx:94-98,266,405` |

## Cross-cutting themes

- **The plan story contradicts itself in-app.** Team page: "Add as many team
  members as you need — free, no per-user charges." (`TeamClient.tsx:168`) vs
  Core = 2 seats, $10/seat (`lib/plans.ts:61-64`, help `team.ts:65`). Voice page:
  "Everything in Workbench stays free." (`AddonClient.tsx:148`); Automations row:
  "run free, pause any time" (`SettingsClient.tsx:2137`) while Pro sells
  automations/agreements/timesheets/QuickBooks. Register/apply: "Free forever —
  we make money when you get paid" while online payments are closed for every
  new company. Fix: one source (`lib/help/plan-copy.ts`) feeds every sentence.
- **"Coming soon" and "Set up payments" disagree.** Collect Payment page says
  "Instant card and bank payments are coming soon" unconditionally, even for
  approved live merchants (`payments/new/CollectPaymentForm.tsx:101`). Payments
  list CTA "Set up payments" → Settings card that says "Coming soon"
  (`payments/page.tsx:342-365` vs `SettingsClient.tsx:367-383`). Invoices empty
  state promises "a pay-online link" (`invoices/page.tsx:219`).
- **Gates lead nowhere.** "the Voice plan" link → `/app/settings/addon` which
  redirects to the Settings index when `addonEnabled` is off
  (`addon/page.tsx:28`, links at `BusinessLineCard.tsx:136,229`,
  `VoicePlanNote.tsx`). The Voice page never shows the price, setup fee or
  allowance (`AddonClient.tsx`, no use of `lib/plans.ts`). Route Manager gate
  "See plans" → `/pricing` (external browser on phones) → "Apply" form, no
  checkout (`schedule/map/page.tsx:36-47`).
- **Success/error feedback still has no single vocabulary** (U8 still open).
  `alertSheet` as success modal ×4, six page-local toast systems, inline
  "Saved" flips ×3, 18 green banners, silent refreshes elsewhere. Five
  "something went wrong" variants plus "Couldn't save." / "Couldn't save — try
  again." Busy labels: "Saving…" ×8, "Saving" ×1, "Sending…"/"Sending...",
  "Please wait". "…" 184 sites vs "..." 30.
- **Title Case vs sentence case** is unresolved: 19 "New Job"-style buttons vs
  159 sentence-case; `confirmLabel` is ~30 Title Case ("Delete Job", "Turn Off")
  vs ~10 sentence ("Delete task", "Turn off"); customer pages mix "Approve
  Quote"/"Request Changes" with "Request changes" on the same page
  (`QuoteAcceptPage.tsx:426,490`).
- **Kit `Button` never spins a `Loader2` icon** (`components/ds/index.tsx:185-190`,
  no spin rule in `app/ds.css`): Add task, Save, Mark done, Stick it all show a
  frozen spinner. Needs a `loading` prop.

## Part 1 — New owner's first hour

HIGH
1. Empty price book from free-text industry (table #1). Also render the setup
   card from a `workItems` count: 0 → "Add your services".
2. Quote/invoice with no clients (table #4). Add an "Add a client" action in
   ContactPicker's empty state and `?returnTo=` on ContactForm; point the
   empty-dashboard Hint at "Add your first client" when contact count is 0.

MED
3. Invoices empty state promises a pay-online link that is off for new companies
   (`invoices/page.tsx:219`). Branch on `onlinePaymentsHeld()`.
4. `/app/suspended` renders inside the full shell (not in the `standalone` set,
   `layout.tsx:105`) and its Sign out is a plain link to `/api/auth/signout`
   (NextAuth's stock "Are you sure?" page), skipping `lib/sign-out.ts` device
   release + VoIP token drop (`suspended/page.tsx:26`).
5. `/invite` signup never sends the browser timezone (`InviteSignupForm.tsx:83`;
   ApplyForm and register do) → company lands on America/Chicago.
6. Business hours have no scent: they live under Booking & forms, whose index
   sub never says "hours"; "hours" appears nowhere in SettingsClient; the
   first-week guide never mentions them (`lib/settings-nav.ts:121-123`,
   `lib/help/sections/start.ts:72-79`).
7. On phones the setup card is the LAST thing on the dashboard
   (`dashboard/page.tsx:797-799`); desktop puts it first.
8. Native first launch stacks the tour (700 ms, z-80) and the Face ID offer
   sheet (1200 ms, z-490) on the same visit (`TourGuide.tsx:105-109`,
   `AppLock.tsx:49-58`).
9. Register in "add another company" mode says "Get started — no code needed",
   but the API requires a code for a second company and get-started bounces
   signed-in owners back (`register/page.tsx:187-190`, `ApplyForm.tsx:293-317`).

LOW
10. "Free forever" door copy (`register/page.tsx:161,332`, `ApplyForm.tsx:684,691`).
11. "Code accepted — no application review, no payment verification." shown
    even when `verifyPayments` is false (`ApplyForm.tsx:399`).
12. DashboardSetupCard is off-system: `border-green-600/25 bg-green-50/40`,
    `card-ledger`, `btn-primary` (`DashboardSetupCard.tsx:28-40`).
13. Still open (David holds): `start.ts:26,72` says new accounts land on "Verify
    your business" while `/app/activate` redirects straight to the dashboard.

## Part 2 — What the customer sees

HIGH
1. Root 404 (table #2). Also render a branded "This agreement has been
   withdrawn" for VOID contracts instead of `notFound()`.
2. Archived invoice shows the pay form (table #6).
3. Request-mode forms say "Your quote is on its way — check your email." when
   email is optional and nothing is sent without one (`RequestForm.tsx:208-209`,
   `lib/booking-intake.ts:108`, `api/public/book/[slug]/route.ts:307`). The
   estimator already 400s "Enter an email address so we can send your quote."

MED
4. Archived quote renders bare (table #6).
5. Legal name on PDF footer but not the web twin (`lib/pdf.tsx:272-273` vs
   `components/paper-doc.tsx:216-218`; pay/quote pages don't select
   `legalName`/`showLegalNameOnDocs`; contract page does).
6. Hub Home "Next visit —" ignores appointments; Visits tab merges them
   (`hub/[token]/page.tsx:39-50` vs `visits/page.tsx:40-55`).
7. "Thanks for your request — here's your invoice" leads every invoice email,
   including monthly recurring bills (`lib/email.ts:1283-1284`, called from
   `lib/subscriptions.ts:224`, `lib/quote-approval.ts:81`).
8. Quote approval sends no confirmation copy (agreement signing does:
   `contractSignedCopyEmail`). `api/public/quote/[id]/route.ts` has no email.
9. `/message` missing from the pre-paint forced-light list (`app/layout.tsx:66`)
   → dark first paint then flash.
10. Empty booking menu: "please contact us to book" with no phone/email on the
    page (`ScheduleMenu.tsx:26`, slim footer).
11. "We'll be in touch within 1 business day." hard-coded for every message/call
    item (`RequestForm.tsx:211-213`); no intake field to change it.

LOW
12. Pay/quote pages: chips render WorkBench blue (no `hubBrandVars` on root)
    while the Pay/Approve button uses the company accent; Finix focus ring is
    hard green `#22C55E` (`PayPage.tsx:137,294,502-601`).
13. Five client surfaces, four footers (email / message page / quote+pay /
    agreement has none and no download / hub+booking none).
14. Hub "today" uses server time, not company timezone
    (`hub/[token]/page.tsx:28-29`, `visits/page.tsx:19-20`).
15. Labels not wired to inputs: `PortalLoginForm.tsx:154-162`,
    `HubRequestForm.tsx:76-96`, `QuoteAcceptPage.tsx:434-447`.
16. Button case drift across customer surfaces (see themes).
17. Cancelling a booking falls back to the browser's native `window.confirm`
    because no ConfirmSheet host is mounted on the public page
    (`ManageBooking.tsx:138-147`, `ConfirmSheet.tsx:34-42`).

## Part 3 — Daily record work

HIGH
1. Unsaved guard coverage (table #5).
2. Kit Button frozen spinner (themes). Also the 7 record forms only add a
   spinner and never change the label ("Create Job" stays "Create Job").
3. Job title "(optional)" on create, "Job title *" + `required` on edit
   (`NewJobClient.tsx:308-312`, `JobEditForm.tsx:167-172`); a blank-titled job
   can't be re-saved blank.

MED
4. Create verbs drift: "Create Job", "Save Quote", "Save Invoice", "Save
   Request", "Book Appointment", "Start plan", "Save Contact/Lead/Client", "Save
   Expense", "Add task", "Add lead", "Stick it", "Create & schedule". Edit:
   "Save Changes" vs plain "Save" on Task/Sticky.
5. Cancel button in six recipes (kit outline, legacy `btn-tool-line`, bare grey
   text, two ghost recipes, kit ghost) across the same family of forms.
6. Edit sheets show errors as a 12 px red line with no `role="alert"`
   (`AppointmentActions.tsx:459,547`, `RequestActions.tsx:234`); create forms
   use `.form-error` + alert; Task/Sticky use a third recipe.
7. Explanatory subtext instead of InfoTip (rule 5), 6 sites:
   `AppointmentForm.tsx:448,462`, `QuoteEditor.tsx:532-534`,
   `NewSeriesForm.tsx:207,414`, `ExpensesClient.tsx:465`.
8. Two "pick people" controls: Task pills (32 px) vs PeoplePicker 14 px
   checkboxes on appointments (`PeoplePicker.tsx:26-38`).
9. Tasks list has no desktop row actions (right-click does nothing) while every
   sibling list has `EntityRowActions` (`TasksClient.tsx:261-273`).
10. Task swipe Delete/Done failures are swallowed, no busy guard
    (`TasksClient.tsx:170-186`).
11. "Add line item" is `text-green-600`, which the bridge turns into plain ink;
    the sibling "+ Add new customer" is brand-colored (`LineItemsEditor.tsx:236`,
    `ContactPicker.tsx:150-154`).
12. Expenses: silent 200-row cap, no search/filter/pager, add card isn't a
    `<form>` so Enter does nothing (`expenses/page.tsx:15`, `ExpensesClient.tsx:313-321`;
    `timesheets/AddEntry.tsx` same).
13. Required markers mix `*` and "(optional)", often in one form.

LOW
14. SendChoice sheet uses legacy `btn-tool-line`/`btn-primary` next to kit
    Buttons in the same release (`components/SendChoice.tsx:186,195`).
15. `estimates/BuildPanel.tsx:307` DELETE response unread.

Still open: Appointments list has no FilterBar/search/Pager/row actions;
no `loading.tsx` under any `[id]` route (U9); Subscriptions list unpaged;
`schedule-lib.ts:193 blockTone` status map outside `lib/statuses.ts` (U4).

## Part 4 — Settings, team, plans, gates

HIGH
1. Voice plan link dead-ends (themes). Expose `addonEnabled` in `lineSummary`
   or render a "not available yet" card instead of redirecting.
2. Voice purchase page shows no price/setup/allowance (`AddonClient.tsx:89,180,184`).
3. Team page "free, no per-user charges" (themes).
4. Collect Payment "coming soon" unconditional (themes).

MED
5. Numbering start silently refuses 0/blank/decimals, no inline error
   (`SettingsClient.tsx:1150-1157`; surcharge has one at `:1028`).
6. Default deposit % and tax rate are clamped server-side while the form shows
   "Saved" with the typed value (`SettingsClient.tsx:1113,1145-1149,2056-2065`,
   `api/app/settings/route.ts:207,216`). Neither has an InfoTip.
7. CSV import: a chunk failure after chunk 1 drops the partial totals and the
   Undo button; earlier rows exist (`ImportClient.tsx:388-401,763-772`).
8. Route Manager gate → `/pricing` → Apply, no checkout (`schedule/map/page.tsx:36-47`).
9. "run free" / "Everything stays free" copy (themes).
10. Review Requests card says "after payment"; asks fire on job completion and
    online payments only, never on manually recorded payments
    (`SettingsClient.tsx:2213`, `jobs/[id]/status/route.ts:145-151`, `lib/payments.ts:398`).
11. Team page explanations are hover `title=` tooltips (invisible on phones) and
    hourly/booking saves give no "Saved" (`TeamClient.tsx:310,320-336`).
12. Payments page "Set up payments" CTA vs "Coming soon" (themes).

LOW
13. Pipeline "Generate webhook URL" is a hand-styled black button; stage renames
    give no feedback (`PipelineSettingsClient.tsx:347-358,528`).
14. Danger Zone says "Delete account" but deletes the company; the login
    survives with multi-company Accounts (`SettingsClient.tsx:827,837`,
    `lib/company-delete.ts:49-50`).
15. Text Notifications can be switched on with no line; points "above" to a card
    that says the line needs the Voice plan (`SmsNotificationsCard.tsx:56,94`).
16. "Starting password" has no required marker though the API requires it for
    new emails (`TeamClient.tsx:243`, `api/app/team/route.ts:94`).
17. QuickBooks row listed even when unconfigured (`SettingsClient.tsx:2124-2128`).
18. "Help & Feedback" links go to the Help Center; `/app/support` is the page
    titled "Help & Feedback" (`AppShell.tsx:716,3295,3484`, `support/page.tsx:6`).
19. Still open (N11): Timesheets hidden from managers' nav, Team Map has no nav
    entry (`AppShell.tsx:255,308`).
20. Still open: Business email helper is subtext while the field below uses an
    InfoTip (`SettingsClient.tsx:1497-1505`).

## Part 5 — Shell and system feedback

HIGH
1. Root `app/not-found.tsx` missing (table #2).
2. Phone More tab dot lights only for past-due invoices; new requests, due
   tasks, unread messages give no tab-bar signal (`AppShell.tsx:3100-3102` vs
   tile badges `:3253-3260`).
3. Failed notifications fetch reads as "You're all caught up"
   (`NotificationsSheet.tsx:212-227,293-301`).

MED
4. Tasks badge (due today or earlier, `nav-counts/route.ts:73-75`) disagrees
   with the page's "My tasks (n)" (all open, `tasks/page.tsx:97`). By design per
   the comment, but the user sees 2 → opens to 9 with no "due" group.
5. Modal lets the page scroll behind it: no `touchAction: "none"` on the scrim,
   renders inline in `.app-main` unless `portal` (`Modal.tsx:96-99`).
6. No focus trap or focus return in Modal / BottomSheet / ConfirmSheet /
   NotificationsSheet.
7. Escape doesn't close the desktop bell dropdown, avatar menu, Create menu or
   company switcher (`NotificationsSheet.tsx:252-262`, `AppShell.tsx:614,692,950-968`).
8. Success vocabulary (themes; U8 still open).
9. Title Case drift (themes).
10. ⌘K searches 6 record kinds; leads, estimates, agreements, tasks, calls,
    threads, automations are not searchable; Requests/Appointments hits get the
    generic magnifier icon (`api/app/search/route.ts:186-221`, `AppShell.tsx:1013-1018`).
11. Live toast icon wrong for quote/call/automation pushes (`AppShell.tsx:1817-1831`
    `kindFor` vs `notifications/route.ts:26-37 kindForUrl`).
12. Phone back control: cold-opened Help article shows "‹ Back" to the
    dashboard (no `/app/help` in `lib/mobile-nav.ts` LABELS); `/app/settings/website`
    missing from ROOTS so it shows "‹ Settings" unlike its three sibling hubs.
13. "Swipe a notification right to clear it" shown on desktop, where rows can't
    be cleared individually (`NotificationsSheet.tsx:122-152,314-316`).
14. Opening a job flashes the list skeleton (KPIs + filters) because
    `jobs/loading.tsx` wraps `jobs/[id]`; routes without a file show the
    dashboard-shaped root skeleton (U9 still open, new form).

LOW
15. Ellipsis and busy-label drift (themes).
16. "from the Hub into QuickBooks" (`QuickBooksSettingsClient.tsx:212`).
17. Error/404/loading cards use raw `bg-[#0A1428]` and `bg-gray-200`, never the
    brand or the dark bridge (`platform/error.tsx:39`, `not-found.tsx:20`, `loading.tsx:4-10`).
18. Help naming: "Help & Feedback" tile / "Help Center" title / "Help" back label.
19. No `safe-area-inset-left/right` anywhere (landscape notch on tab bar, toasts,
    softphone strip).
20. Two destructive reds in ConfirmSheet (`#FF3B30` phone, `bg-red-600` desktop).
21. List search box has no accessible name (`MobileSearch.tsx:28-34`).
22. Bell empty-state copy under-describes the feed (`NotificationsSheet.tsx:299-301`).

## Part 6 — API error text and Help Center drift

Baseline: 211 routes under `app/api/app`, 208 return `{error}`; 168 have no
try/catch; one client helper (`lib/safe-fetch.ts postJson`, 114 sites) plus
176 raw `fetch(` sites (mostly reads); 158 sites render `data?.error` verbatim.
No stack/Prisma text reaches the UI; every 429 has a plain sentence; no zod dumps.

HIGH
1. "Unauthorized" verbatim, no 401 handling anywhere (table #3). Map in
   `postJson`: 401 → "Your session ended — sign in again." + redirect.
2. "Forbidden" verbatim from 197 routes; 16 routes already have friendly 403s,
   so replace only the exact string.
3. Sign-up page can hang: `register/page.tsx:88` `await res.json()` with no
   try/finally; an HTML 500 or network drop leaves the button disabled forever.

MED
4. Offline outbox shows raw codes: "Clock out failed: Rejected (500)"
   (`lib/outbox.ts:135`, `OfflineSupport.tsx:81`).
5. Bare "Not found" from 61 routes while 20 say "Client not found." etc.
6. Developer 400s shown verbatim: "Bad request", "Missing id", "Missing
   contactId", "entity must be contact, job, quote or invoice", "userId is
   required.", "x and y must be numbers." (files in agent list; e.g.
   `contacts/[id]/merge/route.ts:36`, `line/call/route.ts:52`, `notes/[id]/route.ts:82`).
7. Help `money.ts:233` quotes "Download CSV"; the button says "Export"
   (`payments/page.tsx:324-330`); Clients says "Export CSV".
8. Help `quotes.ts:45` "Mark as Sent (no email)"; quote page says "Mark as Sent
   (don't send)" (`QuoteActions.tsx:493`); row menu says "Mark as sent (no
   email)" (`EntityRowActions.tsx:153,209`). Three labels for one action.
9. Help `start.ts:171` "Email alerts" setting; card is titled "Email me too"
   (`EmailAlertsCard.tsx:58`).
10. No guide for the who-hung-up word on Calls rows (shipped 2026-10-12).
11. Help `start.ts:94` "**Make a task**" is not a string in the UI.
12. Only one route handles Prisma P2002; any unique-constraint race becomes
    GENERIC_ERROR. A shared `apiHandler()` would also host the 401/403 mapping.

LOW
13. Case: help "Collect signature"/"Ask for review" vs UI "Collect
    Signature"/"Ask for Review".
14. Help `jobs.ts:114` "Close Job without invoicing in the ⋯ menu"; the row menu
    says "Close without invoicing" (`EntityRowActions.tsx:84`).
15. Help `jobs.ts:78` "Settings → Branding"; the review link lives under
    "Branding & client experience → Review Requests".
16. Help `team.ts:18` "photo button"; the button is "Attach" (`ChatClient.tsx:198`).
17. Help "Settings → Business info" vs UI "Business Info" under "Company".
18. Help "⌘ K / Ctrl K" vs UI "⌘K" / "Ctrl+K".
19. No help line for the automations leave guard.
20. Siri route returns `{error:"no-job"}` (fine if only the Shortcut reads it).
21. Finix/EmailDomain messages pass through unedited (`payment-method/route.ts:122`,
    `email-domain/route.ts:179`).
22. Two silent fallbacks: `ChatClient.tsx:462-472`, `SocialSignInButtons.tsx:95`.
23. Fallback-string sprawl (themes).

Guides present for: sticky notes, tasks, Send later, chat attachments,
multi-person appointments, Lost leads, one active device, numbering start.
Missing: who hung up, automations leave guard.

## Suggested batches

1. **Day-one truth** (half day): industry select on apply/invite + alias
   match; setup card from `workItems` count; ContactPicker "Add a client" +
   returnTo; invoices/payments copy branched on the payments gate; Collect
   Payment info conditional; Team/Voice/Automations plan sentences from
   plan-copy; Voice link gated on `addonEnabled`; Voice page shows price.
2. **Dead ends and raw errors** (half day): root `app/not-found.tsx` (always
   light, branded); archived invoice/quote states; VOID agreement state;
   `postJson` 401/403 mapping; register page try/finally; outbox messages;
   request-form email required in send mode.
3. **Forms** (1 day): `useUnsavedWarning` on 7 forms + `dismissible={!dirty}`
   on 2 modals; Button `loading` prop; job title optional on edit; one create
   verb rule; one Cancel recipe; `.form-error` in edit sheets; 6 InfoTips;
   PeoplePicker pills; Tasks row actions + error alerts.
4. **Shell** (half day): More-tab dot on all badged counts; notifications error
   state; Modal touch-action + portal; Escape on 4 surfaces; focus
   trap/restore hook; `/app/help` back label; toast icon kinds; `[id]`
   loading skeletons.
5. **Help Center sweep** (1 hour): 11 label fixes + 2 missing lines, then
   `npx tsx scripts/test-help-content.ts`.
6. **Mechanical** (multi-session, leftover from September): one toast; sentence
   case sweep (`confirmLabel` + "New X"); "..." → "…"; fallback-string
   constants; `apiHandler()` with P2002 mapping; "Not found" nouns.

## Status — 2026-10-12 (branch `polish-oct`)

David's decisions: industry dropdown back on apply + invite (seeds the price
book); a Get started checklist on Home (9 items, auto-ticked, auto-hides when
the 7 core items are done, Hide + Settings → Company → Show on Home); fix the
rest of the top six and the cross-cutting patterns; sentence case everywhere;
archived-invoice notice on the pay page only. Everything about online
payments (Coming soon / Set up payments / Finix) is deferred: the processor
is moving to Square.

Built (same day): IndustrySelect + forgiving `matchIndustry`; checklist
(`lib/get-started.ts`, `GetStartedCard`, `bookingLinkSharedAt` +
`mobileAppSeenAt` on Company — db:push); root `app/not-found.tsx`; withdrawn
states for VOID agreements, archived quotes and archived invoices; 401/403
mapping in `postJson`; register page on `postJson`; invite form sends the
timezone; client picker "New client" sheet; unsaved guard on 9 forms + 2
modals; job title optional on edit (server re-derives); kit Button
`loading`; global `toast()`; More-tab dot on every badged count;
notifications error state; Escape on 4 surfaces; Modal touch-action;
`/app/help` back label; Appointments list parity (search, filters, pager,
row menu); detail-page skeletons; plan sentences from plan-copy; Voice link
gated on `addonEnabled` + price block; fallback strings → constants;
"..." → "…"; sentence-case sweep; Help Center drift fixes + new lines.

Not done (later): `apiHandler()` with P2002 mapping and "Not found" nouns;
developer-ish 400 bodies; focus trap/restore hook; ⌘K coverage of leads,
tasks, agreements, estimates; hub Home ignoring appointments; quote approval
copy email; invoice email opening line; request-form email required in send
mode; booking "contact us" empty state; the payments items.
