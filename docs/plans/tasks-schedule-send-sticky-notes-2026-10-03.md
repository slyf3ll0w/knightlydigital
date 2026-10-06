# Tasks & reminders · Schedule send · Sticky notes — scope (2026-10-03)

Three asks in one scoping pass. Tasks came from a tester ("set reminders and
tasks, and do the same for your employees"); schedule send for quotes and
invoices and dashboard sticky notes came from David. Status: **Tasks phase 1 BUILT 2026-10-05** (see the build log at the
bottom); schedule send and sticky notes not started. David's decisions are recorded under Decisions.

Everything below was checked against `origin/main` at `ca854b14`
(2026-10-03). The main checkout on the PC is 47 commits behind origin, so
build in a worktree cut from `origin/main`, not from the checkout.

What the code already gives us (so none of these needs new plumbing):

- **Push + bell in one call:** `notifyUser` / `notifyUsers` in `lib/push.ts`
  plus an `AutomationNotice` row for the bell (the `notify()` helper in
  `lib/automations-actions.ts:108` already does both). Email fallback via
  `lib/notify.ts` `emailWanted` when the person has no push device.
- **A 5-minute ticker** (`instrumentation.ts`, production only, every sweep
  claims rows with compare-and-set) and the hourly cron backstop
  (`app/api/cron/recurring/route.ts`, each step budgeted and isolated).
- **Send-channel chooser** (`lib/send-channels.ts` + `useSendChoice` in the
  quote/invoice action bars) and `readSendChannels` in both send routes.
- **Company timezone helpers** (`lib/timezone.ts`) with a precedent for
  "fire at the company's local hour" in `runScheduledAutomations`.
- **Pointer-event drag that works with a finger** (`RouteMapClient.tsx`
  `beginListDrag`, 4 px threshold, `setPointerCapture`).
- **Design kit** (`components/ds`, `app/ds.css`), Modal/BottomSheet/
  ConfirmSheet, `SlotTimePicker`, `StatusChip` tones in `lib/statuses.ts`.

---

## 1. Tasks & reminders

### What it is

A to-do that belongs to one person, with an optional due time and an
optional reminder, and that a manager can hand to an employee. It is not a
project tool: no boards, no sub-tasks, no comments. The job checklist stays
what it is (a close-out gate on a job); tasks are the "call Mrs. Patel back
Tuesday", "order the filter", "remind Luis to pick up the permit" layer the
app has nothing for today.

### Shape

- **One assignee per task.** Assigning to several people creates one task
  per person (each can be done independently, each gets reminded). Default
  assignee = whoever creates it.
- **Fields:** title, notes, due (date, optional time, "anytime" when no
  time), reminder (none / at due time / 15 min / 1 h / 1 day before /
  custom), priority (normal / high), optional link to a contact, job,
  quote, invoice or call, done / not done.
- **Who sees what.** Everyone sees their own tasks. Managers (OWNER/ADMIN)
  see a Team view of everyone's open tasks and can assign, edit and
  complete any task. USER/SALES/TECH can create tasks only for themselves.
  (Mirrors `isManager` in `lib/permissions.ts`.)
- **Notifications.** Assignee is pushed when someone else assigns them a
  task ("Dave gave you a task: Order the filter"). The reminder is a push +
  bell card at the chosen time; email only if the person has no push device
  and emails are on. Overdue tasks surface on the dashboard, not as repeat
  pushes.
- **Where it lives.**
  - `/app/tasks` section: desktop list with My tasks / Team / Done tabs,
    grouped Overdue · Today · Tomorrow · Later · No date. Phone: iOS
    Reminders-style list, tap the circle to complete, swipe to complete or
    delete, one filter chip row, same grouping.
  - Create menu + phone Create sheet get a **Task** tile. Long-press "New
    task" from the Tasks tab.
  - Dashboard: due-today tasks join **Today**; overdue ones join **Needs
    you** (both desktop and phone trees in `dashboard/page.tsx`).
  - Calendar: a task with a due time renders as a small `kind:"task"` item
    on the day; a date-only task lands in the Anytime row. Tasks are not
    draggable in v1.
  - Contact, job and call screens get a "Tasks" mini-list + "Add task"
    (prefilled link, so "call them back Tuesday" is two taps from a call).
  - Bell: new `"task"` kind in `NotificationsSheet` and the LiveToasts
    `kindFor` map, so the reminder card deep-links to the task.
- **Atlas:** `create_task` (staged confirmation card → POST), `list_tasks`,
  `complete_task`. "Remind me Friday to send Hector the quote" works.
- **Automations:** a `create_task` action (copy of `create_time_block`:
  assignee = assigned user or creator, due = N days out at hour H), e.g.
  "when a quote is sent, task the seller to follow up in 3 days".

### Data

```prisma
model Task {
  id           String    @id @default(cuid())
  companyId    String
  createdById  String
  assigneeId   String
  title        String
  notes        String?
  dueAt        DateTime?          // date-only tasks store local midnight + allDay=true
  allDay       Boolean   @default(true)
  remindAt     DateTime?
  remindSentAt DateTime?          // compare-and-set lock, same as reminderHourSentAt
  priority     TaskPriority @default(NORMAL)
  doneAt       DateTime?
  doneById     String?
  contactId    String?            // optional links, no cascades beyond the contact
  jobId        String?
  quoteId      String?
  invoiceId    String?
  callId       String?
  recurrence   Json?              // phase 3
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@index([companyId, assigneeId, doneAt])
  @@index([remindAt, remindSentAt])
  @@index([companyId, dueAt])
}
```

API: `GET/POST /api/app/tasks`, `PATCH/DELETE /api/app/tasks/[id]`,
`POST /api/app/tasks/[id]/done`. Reminder sweep `runTaskReminders(now)` in
`lib/reminders.ts`, added to the 5-minute ticker list and the hourly cron
steps; claims each row with `updateMany({ where: { id, remindSentAt: null } })`
and only sends when `count === 1`.

### Phases

1. **Core (one round):** model + API, `/app/tasks` desktop + phone, Create
   tile, reminders through the ticker, assignment push, dashboard Today /
   Needs you, bell kind, Help Center guide.
2. **Hooks (one round):** Tasks mini-list on contact / job / call pages,
   calendar `kind:"task"`, Atlas tools, Automations action.
3. **Later, on demand:** recurring tasks, tasks in the ICS feed / Google
   Calendar (needs a TASK kind in `lib/calendar-event-shape.ts` and the Task
   model in `SCHEDULE_MODELS` in `lib/db.ts`), task templates per service.

### Not doing

Comments on tasks, sub-tasks, kanban, due-date drag on the calendar, client-
facing tasks, SMS reminders to staff (push covers it; texts cost money).

---

## 2. Schedule send (quotes and invoices)

### What it is

On the existing send chooser, a third choice: **Send later**. Pick a date and
time in the company's timezone (default tomorrow 9:00 AM, 15-minute slots),
and the document goes out by itself, by the channels chosen (email / text,
same chooser). Until then it stays a draft you can still edit; what's on it
at send time is what goes.

### Shape

- **Detail page:** a line under the actions: "Scheduled for Fri, Oct 10 ·
  9:00 AM · Send now · Cancel". The status chip reads **Scheduled** (a
  derived tone for DRAFT + `scheduledSendAt`, not a new enum value, so no
  status logic elsewhere changes). Edits are allowed and keep the schedule.
- **Lists:** a **Scheduled** filter chip on `/app/quotes` and
  `/app/invoices` (DRAFT with a scheduled time); the row shows a small clock
  + the time.
- **At send time** the sweep does exactly what the Send button does today
  (same channel checks, agreements auto-send, `fireAutomations`, `sentAt` /
  `issuedAt` + `dueDate` from terms set at the moment of sending, so
  follow-ups and due reminders count from the real send). The seller gets a
  bell card "Quote #1042 sent to Maria" with a push.
- **When it can't send** (contact lost their email, texting registration
  lapsed, preview account, email bounce): the document stays a draft, the
  schedule is cleared, and the seller gets a push + bell card "Couldn't send
  quote #1042: no email on file", deep-linked to fix and resend.
- **Warnings at scheduling time:** quote `validUntil` earlier than the send
  time; invoice with no email and no textable phone; a time in the past
  (sends on the next tick, say so).
- **Precision:** the 5-minute ticker lands it within 5 minutes; the hourly
  cron is the backstop (same claim pattern, so never twice).
- **Atlas:** `send_quote` / `send_invoice` tools gain an optional `at`.
  Automations: not in v1 (the existing delay step covers "send in 3 days"
  once the action calls the same helper).

### Data

On `Quote` and `Invoice`: `scheduledSendAt DateTime?`,
`scheduledSendById String?`, `scheduledSendChannels Json?` ({email, text}),
`@@index([scheduledSendAt])`. No status enum change.

### Code

- Pull the body of both send routes into `lib/send-document.ts`:
  `sendQuote({ quoteId, actorId | system, channels })` and
  `sendInvoice(...)`, returning `{ emailed, texted, error? }`. The POST
  routes keep auth, rate limit and request parsing and call the helper; the
  sweep calls it with the stored channels.
- `runScheduledSends(now)` in `lib/reminders.ts` (or its own file): claim
  with `updateMany({ where: { id, scheduledSendAt: <value read> }, data: {
  scheduledSendAt: null } })`, then send; on failure write the bell card.
- Picker: `SlotTimePicker` fed by `slotTimeOptions`, converted with
  `lib/timezone.ts` into the company's zone (not `localInputToISO`, which
  uses the browser's zone). One `ScheduleSendSheet` used by both documents,
  bottom sheet on phones.
- `statusTones` / `statusLabels` get a `SCHEDULED` presentation key;
  `StatusChip` callers on the two detail pages and `EntityRowActions` pass
  it when `scheduledSendAt` is set.

### Effort

One round. Riskiest piece is the route → helper refactor (it touches the
most-used money paths), so it ships behind the existing e2e send tests
plus a unit test for the claim.

---

## 3. Sticky notes on the dashboard

### What it is

Square paper notes you drop on your dashboard: a scribble, a phone number, a
"call the supplier Monday". Personal by default; a note can be pinned to the
team board so everyone in the company sees it. They are not tasks (no due
date, no done state), but one tap turns a note into a task.

### Look

- A 3.5 in sticky: pastel paper in five fixed colors (yellow default, pink,
  blue, green, orange), slight stable random rotation (−3° to +3°, stored
  so it doesn't jump on reload), soft drop shadow with a curled bottom-right
  corner (CSS only, no images), a short adhesive strip at the top that
  reads a shade darker. Paper colors are "material" like the fixed status
  colors: not brand-tinted, unchanged in dark mode (paper stays paper; the
  board behind it darkens). Reduced motion respected.
- Text: Lexend by rule 1 of the design system. A handwriting face (Caveat
  or Kalam, one weight, inside the note only) would sell the look but needs
  David's call because it is an exception like `.ds-num`.
- Body limit 400 characters, no formatting, URLs become links.
- Author monogram in the bottom corner on team notes.

### Where

- **Desktop dashboard:** a corkboard band across the top of the desktop
  tree (full width, ~240 px tall, `bg-paper` texture), notes placed freely
  by dragging (pointer events, same pattern as the route list drag), last
  touched on top. Empty board shows one faint "+" sticky. Band collapses to a
  "Notes (3)" strip from a chevron, remembered per device in localStorage.
- **Phone dashboard:** a horizontal swipe row of stickies under the hero
  (no free placement; order = last edited). Tap opens the editor in the
  Modal (bottom sheet). "+" sticky at the end of the row.
- **Editor:** text, color dots, "Pin to team board" switch, "Make a task"
  (creates a Task with the body as title, keeps the note), Delete (soft:
  `archivedAt`).
- **Team board:** pinned notes appear on everyone's board, draggable by
  each viewer (position is per viewer, stored on a `StickyNotePlacement`
  row, so my moves don't move yours). Only the author or a manager can edit
  or delete a team note.
- **Atlas:** `add_sticky_note` (cheap and fun: "stick a note that the Smith
  job needs a 40 ft ladder").

### Data

```prisma
model StickyNote {
  id         String    @id @default(cuid())
  companyId  String
  userId     String              // author
  body       String
  color      StickyColor @default(YELLOW)
  rotation   Float     @default(0)
  shared     Boolean   @default(false)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  placements StickyNotePlacement[]
  @@index([companyId, shared, archivedAt])
  @@index([userId, archivedAt])
}
model StickyNotePlacement {   // per-viewer position on the desktop board
  noteId String
  userId String
  x      Float   // 0–1 of board width
  y      Float   // 0–1 of board height
  z      Int     @default(0)
  @@id([noteId, userId])
}
```

API: `GET/POST /api/app/notes`, `PATCH/DELETE /api/app/notes/[id]`,
`PUT /api/app/notes/[id]/place`. Cap 30 live notes per person, 30 team
notes per company (keeps the board and the query small).

### Live updates

Own notes need none. Team notes refresh when the app returns to the
foreground (`ForegroundRefresh`) and on the 20-second visible poll that
already fetches nav counts (add `notesVersion` = max `updatedAt`; refetch
when it moves). No websockets, matching the rest of the app.

### Effort

One round for personal notes + the look, half a round more for the team
board and "Make a task" (which needs Tasks phase 1 first).

---

## Build order (recommended)

1. **Tasks phase 1** — biggest ask, from a tester, and sticky notes' "Make a
   task" and the schedule-send bell cards both lean on its notify path.
2. **Schedule send** — small, self-contained, high perceived value.
3. **Sticky notes** — the fun one; lands best once Tasks exists.
4. Tasks phase 2 hooks (contact/job/call lists, calendar, Atlas,
   Automations).

Each round: worktree off `origin/main` → `tsc` + unit + `next build` →
push to `staging` → CI + e2e green → `origin/staging:main` → test recipes
for David's device pass → Help Center check (new Tasks guide; "Send to
Client" in `lib/help/sections/money.ts`; the dashboard guide for notes).

## Plan gating

Nothing here needs a gate to ship (gates are dark until `PLAN_GATING=1`
anyway). Suggested when gating goes live: personal tasks, schedule send and
personal sticky notes free on Core; **assigning tasks to employees** and the
**team sticky board** under Pro with the other team tools, added as
`GatedFeature` keys in `lib/plans.ts`. David decides.

## Decisions (David, 2026-10-03)

1. **Build order:** Tasks phase 1 → Schedule send → Sticky notes → Tasks
   phase 2. Build starts after David confirms a few things (not today).
2. **Sticky-note text:** one handwriting face (Caveat or Kalam, one weight)
   loaded for note bodies only, as a documented exception like `.ds-num`.
3. **Team sticky board** ships in the first sticky-notes round (personal +
   team together).
4. **Gating** when `PLAN_GATING=1`: personal tasks, schedule send and
   personal notes free on Core; assigning tasks to employees and the team
   sticky board under Pro (`GatedFeature` keys `task_assign`,
   `team_notes`).
5. Defaults taken: several assignees = one task per person; reminders are
   push + bell with email fallback; schedule-send precision is the
   5-minute ticker.

## Build log

### Tasks phase 1 — BUILT 2026-10-05 (branch `tasks-notes-send`, worktree `knightlydigital-wt/tasks`, cut from `origin/main` 9f6e81d3)

What landed:

- **Data:** `Task` model + `TaskPriority` enum (`prisma/schema.prisma`), relations on
  Company / User (assignee + creator) / Contact (cascade) / Job, Quote, Invoice,
  Call (set null). Additive only — Railway's boot `prisma db push` is safe.
  `deleteCompanyCascade` deletes tasks first.
- **Server:** `lib/tasks.ts` (buckets, reminder offsets, wall-clock parse in the
  company zone, `listTasks`, `runTaskReminders`, `dashboardTasks`,
  `validateTaskInput`); client-safe types/constants in `lib/tasks-shared.ts`.
  Unit test `scripts/test-tasks.ts` (Denver zone, DST day, late-night UTC
  rollover).
- **API:** `GET/POST /api/app/tasks` (`?view=mine|team|done`; `assigneeIds`
  makes one task per person, managers only), `GET/PATCH/DELETE
  /api/app/tasks/[id]`, `POST /api/app/tasks/[id]/done`.
- **Reminders:** `runTaskReminders` in the 5-minute ticker (`instrumentation.ts`)
  and the hourly cron (`taskReminders` step); compare-and-set on
  `remindSentAt`; editing the reminder time re-arms it. Assignment push
  ("Dave gave you a task") via `notifyTaskAssigned`. Push + bell card
  (`notifyUsers` records the notice; `kindForUrl` → `task`, ListChecks icon in
  the bell and LiveToasts).
- **UI:** `/app/tasks` (`app/platform/tasks`): My tasks / Team / Done tabs as
  links (segmented control on phones, chips on desktop), groups Overdue ·
  Today · Tomorrow · Later · No date, `TaskCheck` circle (optimistic, lingers
  struck-through then leaves), phone rows in `SwipeRow` (Done / Delete), row
  tap → `TaskEditor` (Modal: sheet on phones, glass card on desktop) with due
  date + 15-min time slots, reminder choice (+ custom date/time), high
  priority, assignee chips (managers), link chips. Doors: `?new=1` (Create
  tile / quick menu / `n t`; carries `contactId` / `jobId` from a client or
  job page via `withCreateContext`), `?task=<id>` (reminder tap).
- **Shell:** nav item in Work (rail + navGroups), More → Field work, Create
  tile "Task", quick-menu New task, `g k` / `n t`, `tasks` badge in
  `/api/app/nav-counts` (open tasks due today or earlier), mobile back label.
- **Dashboard:** due-today tasks render under Today (`DashboardTasks` island,
  tickable), overdue tasks join Needs you (urgent), Today count says
  "· 2 tasks".
- **Help Center:** new guide `tasks-and-reminders` (Getting started) + nav /
  shortcut wording in `find-your-way-around`.

Not in this round (phase 2): Tasks mini-list on contact / job / call pages,
calendar `kind:"task"`, Atlas tools, Automations action. Status chip /
schedule send / sticky notes untouched.

### Schedule send — BUILT 2026-10-05 (same branch)

- **Data:** `scheduledSendAt / scheduledSendById / scheduledSendChannels` on
  Quote and Invoice (+ index). No status enum change: **Scheduled** is a
  presentation key (`SCHEDULED`, blue) in `lib/statuses.ts` that callers pass
  when `status === "DRAFT" && scheduledSendAt`.
- **Shared send:** `lib/send-document.ts` `sendQuote` / `sendInvoice` hold the
  bodies of the two send routes (routes keep auth, rate limit, preview, role,
  channel parsing). Every send clears a pending schedule (`CLEAR`), and so do
  the status PATCHes that leave Draft (Mark as Sent, Archive).
- **Sweep:** `runScheduledSends` in the 5-minute ticker + hourly cron
  (`scheduledSends`); claim = compare-and-set on `scheduledSendAt` cleared in
  the same write; bell + push to the scheduler on success ("Quote #1042 sent
  to Maria") or failure ("Couldn't send quote #1042: …", draft kept).
- **API:** `POST/DELETE /api/app/{quotes,invoices}/[id]/schedule-send`
  ({ date, time } company-zone wall clock via `parseDue`, or { at }); answers
  `{ scheduledSendAt, label, channels, warnings }` with warnings `past`,
  `expires_first`, `unreachable` (`lib/send-later-shared.ts` has the copy).
  Unit test `scripts/test-send-later.ts`.
- **UI:** `useSendChoice` takes `allowLater` — the sheet always opens, with a
  **Send later** row (date + 15-min slots, default tomorrow 9:00) and the
  button reads **Schedule**. Quote / Invoice action bars schedule instead of
  sending and skip the leave-page nag while scheduled.
  `components/ScheduledSendLine.tsx` under the header: "Scheduled for … by
  email · Send now · Cancel". Lists get a **Scheduled** filter (DRAFT +
  scheduledSendAt) and the chip reads Scheduled.
- **Atlas:** `email_document` gained `send_date` + `send_time` → stages the
  schedule-send endpoint.
- **Help:** Send later paragraph in the quote and invoice send guides.

Not done: Automations "send later" (the existing delay step covers it once
the action calls the helper), deposit / agreement sends (not in scope).

### Sticky notes — BUILT 2026-10-06 (same branch)

- **Data:** `StickyNote` (+ `StickyColor` enum) and `StickyNotePlacement`
  (per-viewer x/y/z, 0–1 of the board). Additive. Company cascade deletes
  notes before users.
- **Server:** `lib/sticky-notes.ts` (listNotes = own live + team shared with
  the viewer's placement, notesVersion for the 20-s poll, caps 30/30,
  canEditNote = author, or a manager for team notes); client-safe
  `lib/sticky-shared.ts` (taskTitleFromBody, monogram, randomRotation,
  splitLinks; unit test `scripts/test-sticky-notes.ts`).
- **API:** `GET/POST /api/app/notes`, `PATCH/DELETE /api/app/notes/[id]`
  (DELETE = archivedAt; only the author pins/unpins), `PUT …/place`,
  `POST …/task` (Make a task: first line = title, body = notes, note kept).
- **Live updates:** `/api/app/nav-counts` returns `notesVersion`; AppShell
  dispatches `wb:notes-changed` when it moves; `DashboardStickies` refetches
  on that event and on visibilitychange. No websockets.
- **UI:** `components/sticky/StickyPaper` (CSS paper: five fixed pastels that
  stay paper in dark mode, strip, curled corner, Caveat 500 for bodies only
  — the one handwriting face, loaded by `DashboardStickies` via a
  `<link precedence>`), `StickyBoard` (desktop corkboard band, 240 px, free
  placement with pointer-event drag + 4 px threshold, last touched on top,
  collapses to "Notes (n)" remembered in localStorage), `StickyRow` (phone
  swipe row under the hero, "+" sticky at the end), `StickyEditor` (Modal:
  the note itself is the text box, color dots, Pin to team board, Make a
  task, Take down). Styles in `app/ds.css` "Sticky notes".
- **Atlas:** `add_sticky_note` (`lib/assistant/notes.ts`, staged).
- **Gating (dark until PLAN_GATING=1):** `GatedFeature` keys `task_assign`
  (tasks POST when assigning others) and `team_notes` (pinning), both SHOP
  like routes — the plan doc's "Pro".
- **Help:** new guide `sticky-notes` under Getting started.
- **Also in this round:** a task notification / row tap now opens a read-only
  `TaskDetail` sheet (Mark done, Edit one step away) instead of the editor
  (David 2026-10-06).
