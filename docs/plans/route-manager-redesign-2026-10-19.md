# Route Manager redesign — 2026-10-19

Status: **Phase 1 BUILT 2026-10-19** on branch `routes-v2` (worktree
`~/knightlydigital-wt/routes-v2`), not yet pushed — see "Phase 1 as built"
at the end. David's ask: redesign Routes around how home-service
businesses actually schedule, and let a person plan non-client stops
(supply house, dump, errands, tasks) into one efficient route. Decisions
are recorded in §4.

Prior docs this builds on: `scheduling-and-routes-2026-09-09.md` (calendar
drag + first routes), `route-manager-facelift-2026-09-19.md` (look),
`route-manager-audit-2026-09-28.md` (B1–B6 + S1–S14 all live; section 3
standout list never started). The routing engine (`lib/routing.ts`,
`lib/route-walk.ts`, `lib/route-plan.ts`, `lib/find-a-time.ts`,
`DriveLegCache`, per-tenant Mapbox caps, locks, client windows) is sound and
stays. What gets redesigned is the model of a "day" and the pages on top.

---

## 1. How home-service businesses actually plan a day

Three operating modes, not one. The current page serves only the middle
of the first one.

### 1a. Recurring, route-dense trades (lawn, pool, pest, cleaning, windows, pressure washing)

They think in **weeks and areas, not days**.

- Each weekday is an area of town. "Tuesday is the north side." A new
  customer goes on the day that already covers their street, not the
  lightest day. Operators call this route density; it is the number they
  manage the business by.
- The **same order every week**. Techs memorise the route; customers learn
  "Thursday around 10." Re-optimising every day is a bug to them, not a
  feature. Optimise once when a route is built or when enough customers
  change, then keep the order.
- Weekly customers are the skeleton; biweekly and monthly ones fill gaps.
  Days are balanced across the week (roughly equal drive + service time).
- Tips they repeat: start at the far end of the area and work home; put
  the long jobs first and short mows at the end; group the far-flung
  customers onto one day so the long drive happens once; price outliers
  higher. Weather skips move a whole day (we have Move the day).
- Software built for them (FieldRoutes, Service Autopilot, Skimmer, pool
  apps): assign a customer to a weekday + route, drag stops between days,
  reorder inside a day with drive times updating, optimise a route or a
  whole week, seasonal start/stop, per-route default tech.

### 1b. On-demand trades (HVAC, plumbing, electrical, appliance, garage door)

They think in **today, and who**.

- A dispatcher owns a board: one timeline per tech, jobs as blocks, drive
  shown between them, an unassigned tray, capacity per tech. Techs check
  it in the morning, load the van, go. ServiceTitan is the reference.
- Customers get an **arrival window** (two hours is the norm, three for
  same-day emergencies); the tech sees the exact slot. Hit the window nine
  times out of ten or trust erodes. We already have windows and reminders.
- The day changes constantly: an emergency drops in, a job runs long, a
  part is missing. "Who is closest, free and able?" is the question every
  hour. ServiceTitan's Dispatch Pro ranks techs by location, skills and
  priority; nothing in WorkBench answers "who" today (Find a Time answers
  "when" for one chosen tech).
- **Non-job stops are a real cost.** A missing part means an hour lost at
  the supply house; a 2026 billable-hours study has techs paid 8.8 h and
  billing 5.7 h, with about 1.1 h a day of unrecovered driving. ServiceTitan
  models this as a **non-job event**: name, tech(s), date, start/end or
  all-day, repeat, a verified address, "count against capacity", "show in
  the mobile app", clear-when-done, timesheet code (paid or not). It sits
  on the tech's timeline as a grey block. That is the closest thing in the
  industry to what David asked for, and it still does not route it.
- Buffers between jobs for traffic and clean-up are standard advice.

### 1c. Project trades (roofing, painting, handyman, junk removal)

One to three stops a day, multi-day jobs, dump runs and material pick-ups.
They want the same non-job stops as 1b, plus "where is everyone" more than
a route. Do not oversell routing; sell the day plan and the team map.

### 1d. What dedicated route planners do that FSM apps don't

OptimoRoute, Routific, Circuit (delivery-grade tools, $35–50/driver/month):

- **Breaks as floating stops**: "30 min somewhere between 11:30 and 1:00",
  the solver picks the slot; the driver can take or skip it on arrival and
  the rest of the day re-times.
- **Up to three time windows per stop**, with a choice of "whole service
  inside the window" vs "just the arrival".
- **Service time per stop**, driver **shift start/end location** (home or
  depot), skills, priorities, capacity, and reported idle time when a
  driver has to wait for a window.

### 1e. Where competitors are weak (our openings)

- **Jobber** only optimises untimed "anytime" visits; start/end points are
  "pick which visit is first and last", and their official workaround for a
  shop start is "add your yard as two visits". No non-visit stops.
- **Housecall Pro** shipped "route-based scheduling" in May 2026: named
  routes per day, an unrouted column you drag jobs out of, recurring routes,
  grouping by geography or service. No drive-time math, no zones, no
  non-job stops documented. This is the shape of the market moving.
- **ServiceTitan** has non-job events with an address but does not route
  them, and it is priced for 20+ tech shops.
- Nobody we found routes **tasks and errands together with client stops**
  for a solo or small crew. That is the gap David's ask lands in.

---

## 2. What WorkBench has today (and what it is missing)

| Have | Missing |
|---|---|
| One day, one tech, ordered on a map; optimizer with locks, client windows, Or-opt | A week view; routes that persist across weeks; areas |
| Recurring visits generated 28 days out as jobs, with default assignees and a property | A weekday / route on the series; saved stop order; "add to the day that covers their street" |
| Located `TimeBlock` acts as a fixed stop (dentist, supplier run) | Floating stops (lunch between 11:30–1), stop types, reusable places, "do this before job X" |
| `Task` with due date + reminder | A task that has a place and a length, so it can be routed |
| Find a Time (when, one tech) | Who should take this (across techs); skills |
| Dispatch columns on the calendar (`?board=team`) | Drive bars, capacity, arrival windows drawn, unassigned tray on the board |
| Phone map crammed into a snap sheet | A tech "Today" screen: next stop, Navigate, On my way, Arrive, Done → next |
| Shop as the start/end | Home start/end per tech; end-of-day return choice |

The map page is one 2,190-line component (`RouteMapClient.tsx`). A
redesign should be a new page tree, keeping `lib/*` and the APIs.

---

## 3. Proposal

### 3.1 The unit is a Stop, not a Job

A person's day is an **ordered list of stops**. Stop kinds:

| Kind | Backed by | Routed as |
|---|---|---|
| Client visit | `Job` (incl. generated recurring visits) | Timed, Anytime, or windowed (`arriveAfterMin/BeforeMin`), lockable — as today |
| In-person appointment | `Appointment` | Fixed — as today |
| **Task with a place** | `Task` + new `address/lat/lng/estimatedMinutes` | Anytime stop by default; optional window |
| **Errand** (supply house, dump, bank, parts drop-off, fuel) | `TimeBlock` + new `kind`, `placeId`, float window, `beforeJobId` | Floating inside a window; "before job X" dependency |
| **Lunch / break** | `TimeBlock` kind `BREAK` (or a company default: "30 min between 11:30 and 1") | Floating; skippable on the phone |
| Start / end | Shop (`Company.lat/lng`) or **home** (new `User.homeAddress/lat/lng`) | Day anchors; "end at home" per day |

New `Place` table (company-scoped): name, address, lat/lng, kind (SUPPLY,
DUMP, SHOP, YARD, OTHER), hours (optional), notes ("ask for Dave at the
counter"). Used by errands and by the "Add a stop" picker so a supply run
is two taps, not an address form. Geocoded once.

Why not a brand-new `Stop` model: jobs, appointments, tasks and blocks
already carry status, reminders, assignees, calendar rendering and Atlas
tools. A thin union read model (`resolveRouteDay` already does this for
three of them) plus the fields above keeps one source of truth per record.

### 3.2 Three views of the same stops

```
/app/routes
  Today     board (desktop) + map · Today (phone)
  Week      5–7 day columns per tech, route membership, balance
  Routes    named routes: weekday, default tech, area, saved order
  Places    supply houses, dump, yards
```

**Today (desktop)** — the dispatcher board, promoted from the calendar's
`?board=team` columns: one timeline per tech with drive bars between
blocks, arrival windows drawn as a lighter band, grey blocks for errands
and breaks, an Unassigned tray, a capacity readout per tech (booked ÷ open
hours, drive included). The map is a pane beside it, not the page; pins
and timeline blocks select each other. Drag between techs reassigns, drag
within a column re-times, "Optimize this tech" and "Plan the day" (crew)
preview before applying, exactly like now.

**Today (phone)** — the tech's screen. iOS-style list, no map until a
stop is tapped (map peeks under the next-stop card). Next stop card:
Navigate · On my way · Arrive · Done → next. Each stop shows its glyph
(client, task, errand, break), a status tick, and the window. "Add a
stop" from the phone opens Places first (supply house, dump), then
"Somewhere else" (address), then "A task". The rest of the day re-times
and the dispatcher's board updates. Breaks can be taken or skipped.
Simpler than desktop, per David's rule.

**Week** — the recurring-trade home. Columns per day, rows per tech, each
cell a route with stop count, drive minutes, service minutes, a balance
bar. Drag a stop to another day; "Keep this order" is the default when
visits regenerate; "Re-sequence" runs the optimizer on one route and saves
the order back to the route, so next week comes out the same.

**Routes** — named containers (the Housecall Pro / FieldRoutes model, done
with drive math): "Tue North · Mike": weekday, default tech, optional
area, saved stop order. A `Subscription` joins a route (`routeId`), and
generated visits land in the route's order. When a recurring client is
added, "Which route?" suggests by nearest existing stops (no polygon
needed) and shows the added drive for each candidate.

Areas: phase 1 is "nearest stops" suggestion only. Drawn polygons or a ZIP
list per route come later if asked; operators mostly use ZIPs and natural
boundaries, and the heuristic gets 90% of it without a drawing tool.

### 3.3 Optimizer changes (`lib/route-walk.ts` + `lib/routing.ts`)

- Floating stops: a stop with `[floatAfterMin, floatBeforeMin]` and a
  duration that the solver may place anywhere in the window (lunch, "hit
  the supply house before noon"). Treated like a windowed job in the walk;
  in the search, tried at each insertion point and kept where added drive
  is least.
- Dependencies: `beforeJobId` on an errand ("pick up the valve before
  the Henderson job"). Simple precedence constraint; Or-opt and 2-opt
  reject orders that violate it.
- Start/end: per day, per tech: shop, home, or "end wherever the last
  stop is". Default from the user's setting.
- Whole-crew "Plan the day": unassigned pool → greedy insertion across
  techs by added drive, working hours, skills (phase 4), capacity → per-
  tech optimize. Preview first; locked stops never move; reminded clients
  locked by default (already so).
- "Who should take this": Find a Time across all techs for one address +
  date, ranked by added drive, one tap to assign. Engine already exists.

### 3.4 Data changes (all additive)

```
Place            id, companyId, name, kind, address, lat, lng, hours Json?, notes, archivedAt
Route            id, companyId, name, weekday Int?, defaultUserId?, color?, stopOrder Json (ids), areaZips String[]?, archivedAt
Subscription     + routeId?
Task             + address?, lat?, lng?, estimatedMinutes?, placeId?
TimeBlock        + kind (BLOCK|ERRAND|BREAK|TRAVEL), placeId?, floatAfterMin?, floatBeforeMin?, beforeJobId?, doneAt?
User             + homeAddress?, homeLat?, homeLng?, dayStartsAt (SHOP|HOME), dayEndsAt (SHOP|HOME|LAST_STOP)
Company          + breakMinutes?, breakAfterMin?, breakBeforeMin?   (default lunch)
Job              + estimatedMinutes? (S5 in the audit; Anytime stops still assume 60)
```

No new table for "a day's order": the existing day order lives in
`scheduledAt`, and the route's saved order lives on `Route.stopOrder`.

### 3.5 Phases (each ships on its own)

1. **Stops + Places + errands + tasks on the route** (David's direct ask;
   serves all 16 industries). Place table + Places page; Task location
   fields + "Add a place" on the task sheet; TimeBlock kinds with float
   window and before-job; home start/end; optimizer floating stops +
   precedence; map and list show every kind with its glyph; "Add a stop"
   on desktop and phone; Atlas `add_stop` / `add_place`. Help: Routes
   guide + Tasks guide.
2. **Tech Today (phone)** — the next-stop screen, Navigate/On my way/
   Arrive/Done → next, take/skip break, add a stop from the field. Replaces
   the phone snap-sheet map.
3. **Routes + Week** — Route model, `Subscription.routeId`, visits land in
   route order, Week page with balance, "Re-sequence" saves order,
   "Which route?" suggestion for new recurring clients, Move the day per
   route. This is the recurring-trade reason to pay.
4. **Today board + crew planning** — desktop timeline board with drive
   bars/windows/capacity/unassigned tray, "Plan the day" across techs,
   "Who should take this", skills tags.
5. **Numbers + client-facing** — miles/drive vs wrench per tech per day,
   "Optimize saved N min", monthly mileage export, tokenised "on the way"
   tracking page, traffic ETA for the next leg.

Order rationale: 1 and 2 are cheap, universal, and build the stop model
everything else sits on. 3 is the paid-plan feature for the six route
trades. 4 is the on-demand trades' feature and the most engineering.

### 3.6 Gating (when `PLAN_GATING=1`)

Core: Today list, Places, errands and tasks on the map (no optimizer).
Pro (`routes`): Optimize, Plan the day, Who should take this, Routes +
Week, ROI numbers. Same `featureAllowed(company, "routes")` gate as now.

### 3.7 Test recipes (to write with each phase)

- Add a supply-house errand "before the Henderson job" with a 9–11 window;
  Optimize; it lands before Henderson and inside the window; drive total
  shown.
- Lunch default 30 min 11:30–1:00; optimise a 7-stop day; lunch sits
  between stops, never splits one.
- Task with an address on the day; it appears as a stop with the task
  glyph; Done on the phone marks the task done.
- Home start: tech with a home address; first leg is from home, last leg
  returns to shop/home per setting.
- Phone: next-stop card → Navigate opens Apple Maps; On my way sends the
  ETA text; Arrive clocks in; Done advances to the next stop.
- Routes: build "Tue North" with 8 weekly pools; Re-sequence; next week's
  generated visits come out in the same order; add a biweekly client, the
  "Which route?" sheet suggests Tue North with the added minutes.

---

## 4. Decisions (David, 2026-10-19)

1. **Order**: phases 1 → 2 → 3 → 4 → 5 as above. Stops + errands first,
   then the tech Today phone screen, then Routes + Week.
2. **Data**: non-job stops extend `TimeBlock` (kind, float window,
   before-job, placeId) plus a new `Place` table; tasks gain a place. No
   separate `Stop` model.
3. **Areas**: nearest-stops suggestion only in phase 3. No ZIP lists or
   drawn zones unless asked later.
4. **Home start/end per tech**: yes — `User.homeAddress/homeLat/homeLng`
   + `dayStartsAt` / `dayEndsAt`.
5. **Automatic lunch**: yes — a company default ("30 min between 11:30 and
   1:00") the optimizer places on every full day; skippable on the phone.
6. **Page home**: new `/app/routes` tree (Today / Week / Routes / Places)
   under the existing Routes nav item; `/app/schedule/map` redirects.

Build notes for phase 1: worktree off `origin/main` (the main checkout
sits on `media-race`); schema is additive (`db:push` via predeploy);
Help Center asks at the end: Routes guide, Tasks guide, Schedule guide
(blocked time kinds), Team guide (home address).

## 5. Phase 1 as built (2026-10-19, branch `routes-v2`)

Shipped exactly per §3.1 / §3.4 with these specifics:

- **Data** (additive, `db:push`): `Place` + `PlaceKind`; `TimeBlockKind`
  (BLOCK / ERRAND / BREAK) and `TimeBlock.kind, placeId, flexible,
  floatAfterMin, floatBeforeMin, beforeJobId, placedAt, doneAt`;
  `Task.address, lat, lng, placeId, estimatedMinutes`; `User.dayEndsAt`
  (`DayEnd`: SHOP / START / LAST_STOP — the existing `startAddress` is the
  "home" start); `Company.breakMinutes` (default 30, 0 = off),
  `breakAfterMin` (11:30), `breakBeforeMin` (13:00). `Job.estimatedMinutes`
  was NOT added: Anytime jobs already carry a length through
  `scheduledEnd`, so S5 is covered without a column.
- **Engine**: `solveStopOrder(matrix, start, closeTo, precedence)` —
  `closeTo` is false / true (round trip) / an end index that is costed but
  never visited; precedence pairs are respected in construction and both
  local-search moves. `route-walk.ts` gained `precedenceHolds`,
  `enforcePrecedence`, `breakInsertIndex`. The optimizer routes flexible
  errands/tasks with the jobs, treats a break as a zero-drive stop, turns
  "before job X" into a cut-off when X is pinned, and synthesises the
  company lunch (`break:new`) when the tech has no break that day.
- **Pages**: `/app/routes` (the map, moved from `/app/schedule/map`, which
  redirects with its query), `/app/routes/places`. Routes page: stop rows
  carry Errand / Break / Task stamps, a tick circle (done) for errands,
  breaks and tasks, Remove / Skip, "Before: <job>" and "Window: …" lines;
  errand/task pins are rounded squares in the crew colour; a `+` on each
  crew card (and on the empty day) opens **Add a stop** (Errand / Task /
  Lunch → Places chips → Somewhere else → name, length chips, when:
  Optimize places it / Between / At a set time, before-this-job). A
  Places button sits in the map's control cluster. The preview names the
  end point ("End the day at the shop" / "…back where it started") and
  notes when lunch was slotted in.
- **Settings**: Booking & forms → Scheduling rules → "Lunch on the route"
  (length + window); Team → member hours → "Ends the day at".
- **Tasks**: the editor's "Add a place" (saved places as chips, address
  autocomplete, how-long chips); `/api/app/tasks` accepts `address`,
  `placeId`, `estimatedMinutes`.
- **Atlas**: `list_places`, `add_place`, `add_stop`.
- **Not in phase 1** (phase 2+): the tech "Today" phone screen, Routes /
  Week, the board, "who should take this", ROI numbers.

### Phase 1 test recipes

1. Routes → `+` on your crew card → Errand → "Somewhere else" → a supply
   house address → 20 min → Before this job: pick a job → Add. The row
   shows Errand, "Before: <job>", Anytime. Optimize: the errand lands
   before that job; Apply: it gets a time.
2. Settings → Booking & forms → Scheduling rules: lunch 30 min between
   11:30 and 1:00 (the default). Optimize a day with stops past noon: the
   preview shows "Lunch" between two stops and the note "Lunch slotted
   in…"; Apply; the route lists Lunch with a coffee glyph; Skip removes it;
   the next Optimize adds it back.
3. Tasks → New task → Add a place → pick a place or type an address → 15
   min → due that day → Save. Routes shows it with a Task stamp and the
   square pin; tick the circle → the task is done on /app/tasks too.
4. Team → a member → hours → "Ends the day at: Where the day started" with
   a start address set. Optimize: the checkbox reads "End the day back
   where it started" and the last stop is near it.
5. `/app/schedule/map?date=…&team=…` lands on `/app/routes` with the same
   day and crew.
6. Places: add, edit, archive (managers); an archived place no longer
   appears in Add a stop, but an errand made from it keeps its address.
7. Atlas: "add a supply run at Ferguson before the Henderson job tomorrow"
   → a card → confirm → the errand is on tomorrow's route.

Sources consulted (vendor help centres and blogs; treat numbers as
starting points): ServiceTitan non-job events + Dispatch Pro docs;
Housecall Pro May 2026 route-based scheduling; Jobber route optimization
help + community; OptimoRoute breaks/time windows; Routific and Circuit
break handling; FieldRoutes / Service Autopilot route density; pool and
lawn route-planning guides (zone-per-day, same order weekly, balance the
week); HVAC day-in-the-life and billable-hours pieces (supply-house cost).
