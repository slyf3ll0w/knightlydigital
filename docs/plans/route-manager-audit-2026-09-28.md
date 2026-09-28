# Route Manager audit — 2026-09-28

> **Status 2026-09-28: every blocker (B1–B6) and should-fix (S1–S14) below is
> BUILT on branch `route-audit`** (worktree `~/knightlydigital-wt/route-audit`).
> What shipped, in one place:
> - B1/B2 — `DriveLegCache` table + `driveChainLegs` (one Directions request
>   per tech per day, cache-first); Matrix only for Optimize / Find a Time and
>   only for unknown pairs; per-tenant caps (`MAPBOX_TENANT_*`) + a
>   `directionsCalls` meter; `roadTimes` state → "paused" notice on the page;
>   superadmin footnote shows all three meters; daily cron prunes legs.
> - B3 — a hand order may carry un-routable ids; done stops leave the set.
> - B4 — complete addresses share one cache key and are trusted across state
>   lines; bare ones are keyed to the company's state; failures retry in 30 d.
> - B5 — `Job.arriveAfterMin/BeforeMin` ("Client can take it" on the job
>   page), `walkDay` waits/flags late, `repairWindows` reorders; per-stop
>   locks (`keep`, reminded stops locked by default) with lock buttons in the
>   preview; "Text clients" off by default with the count; co-assignee warning.
> - B6 — `featureAllowed(company, "routes")` on the page, both route APIs,
>   Find a Time, the ETA and the Atlas tools; dark until `PLAN_GATING=1`;
>   e2e tenant A gets the SHOP grant.
> - S1 inactive owners shown; S2 company timezone everywhere + company-noon
>   Anytime; S3 errors inside the preview; S4 fetch ticket; S5 Anytime span
>   honoured; S6 all-day block refuses with a message; S7 idle-member drop
>   targets + invalid targets refused up front; S8 done/on-site glyphs; S9 ETA
>   resolves property → address → contact; S10 customer-facing banner copy;
>   S11 WorkBench copy link, "first 10 stops" note, print keeps the panel;
>   S12 `test-routing.ts` + windows/repair/geocode-key/gate tests + e2e
>   optimize case; S13 hover via ref, drag re-renders only on target change,
>   no double refresh; S14 Or-opt + deterministic multi-start (worst case on
>   random 7-stop days went from 22 % to under 8 %).
> - Still to do by hand: set `PLAN_GATING=1` after whitelisting; confirm
>   `MAPBOX_TOKEN` + `NEXT_PUBLIC_MAPBOX_TOKEN` on both Railway envs.
> - Section 3 (standout features) is untouched — the paid roadmap.

Scope: everything behind `/app/schedule/map` and the APIs it uses, reviewed
before Routes ships as a paid (Pro) feature. Code read: `lib/routing.ts`,
`lib/route-plan.ts`, `lib/route-walk.ts`, `lib/geocoding.ts`,
`lib/directions.ts`, `lib/find-a-time.ts`, `lib/mapbox-budget.ts`,
`app/api/app/route-plan/*`, `app/api/app/schedule/suggest`,
`app/api/app/jobs/[id]/on-my-way`, `app/api/app/arrival`,
`app/platform/schedule/map/*`, plus the plan/gating, schema, recurring-visit
and mobile code around it. Nothing was changed. Three questions:

1. Is it broken in ways a paying customer would hit?
2. Is it useful for each industry we sell to?
3. What would make it a standout?

Solver sanity check (run locally, 600 random 8-stop days vs brute force):
nearest-neighbour + 2-opt averages 1.2 % over optimal, worst case 22 %. The
maths is fine; the problems are around it.

---

## 1. Problems to fix before charging for it

### Blockers

**B1. Mapbox spend model does not survive paying customers.**
Every routes-page load and every calendar day view (`ScheduleClient.tsx:826`
fetches `/api/app/route-plan` for drive gaps) buys a full N² Matrix call:
shop + every member start + every mapped stop in the company that day. A
three-tech day with 15 stops is 19 points = 361 elements. The in-process
cache lasts 10 minutes and dies on every deploy/restart. One active
dispatcher paging through days is easily 20–30 uncached loads a day →
150–200k elements/month for ONE tenant. Mapbox's free tier is 100k
elements/month, then $2 per 1,000. `lib/mapbox-budget.ts` caps the whole
platform at 90k and then silently degrades everyone to straight-line
estimates (a small `~` and a yellow line) for the rest of the month. So the
first busy paying customer turns Routes into an estimate for every other
paying customer, with no notice to them or to us.
Fix, in order: (a) stop buying N² for display — legs between consecutive
stops only need N-1 elements (Matrix `sources`/`destinations`, or the
Directions call already made for geometry, which returns leg durations);
keep the full matrix for Optimize only. (b) Persist pairwise legs in a
`DriveLegCache` table keyed on rounded coordinate pairs with a ~30-day TTL,
the way `GeocodeCache` works; recurring customers and the shop↔customer legs
are then paid once. (c) Meter per tenant, show a plain "Road times paused
this month" notice in the app when a cap trips, and treat the overage as
cost of goods (worst case is well under $1/tenant/day at $2/1k). (d) The
Directions calls are metered as "matrix elements" but Mapbox bills them as
requests — separate meter.

**B2. Any company with ~22+ mapped stops in a day never gets road times.**
`resolveDriveLegs` (`lib/route-plan.ts:97-104`) builds one matrix across the
entire company; `driveMatrix` returns haversine for >25 points
(`lib/routing.ts:71`). Six techs × four stops = 25+ points → the page and
the calendar show `~` estimates every day and nothing the customer does
changes that. Those are exactly the companies who will pay. Fix: one matrix
per tech (≤25 each, cached), or per-tech chunks.

**B3. Drag-to-reorder fails with "Stop list changed" on any day that has
already started.** The client sends every pinned routable stop
(`RouteMapClient.tsx:973`), the server drops non-ACTIVE jobs, pinned
(started / on the clock / multi-day) stops and address-less appointments,
then requires the same count (`optimize/route.ts:164`) → 409. At 10 AM with
one 8 AM job done, every drag errors. Same mismatch makes Optimize enabled
client-side while the server answers "Need at least two stops that haven't
started yet." Fix: client builds the order from the same eligibility rule
(or the server accepts a superset and ignores non-routable ids).

**B4. Global geocode cache is cross-tenant and poisoned by per-company
rules.** `GeocodeCache` is keyed on the address string only, but the lookup
is biased by the calling company's shop (`proximity`) and rejected when the
result's state differs from the company's state
(`lib/geocoding.ts:61-68, 99-126`). Two consequences: (1) a Texas company's
customer in Texarkana AR, a Kansas City MO shop with Kansas customers, DC/NYC/
Cincinnati/Chattanooga/Memphis metros — any cross-border job is rejected and
negative-cached as `failed`, forever, for every tenant; (2) a bare "412 Oak
St" resolved near company A's shop is served to company B in another city.
Fix: cache the raw feature (coords + region), apply the state check at read
time per company, and turn the hard state reject into a warning chip
("pin is in OK, your shop is in TX"). Key the cache by full address when
city/state are present; when they are not, include the company's
proximity in the key.

**B5. Optimize does not know about promised times.** Every timed stop is
fair game: a 2 PM job whose client got the day-before reminder ("between
2:00 and 4:00") is re-timed to 8:40 AM, and because "Text clients" is
checked by default (`RouteMapClient.tsx:360`) every moved client gets a
new-time message each time a dispatcher tries an order. There is no per-stop
lock, no earliest/latest arrival window on a Job, and the solver is a pure
TSP. Co-assigned jobs also move for the other tech (warned, not blocked).
Jobber sidesteps this by only ordering untimed visits. Fix: per-stop "keep
time" lock in the preview (default ON for any stop that already had a
reminder sent or was booked by the client), time-window fields on Job
(`arriveAfter`/`arriveBefore`) that `walkDay` respects, and "Text clients"
defaulting to off with a count of who would be messaged.

**B6. Nothing is gated.** `lib/plans.ts:37` — only the phone line is gated;
the pricing page promises Route Manager in Pro (`lib/plans.ts:101`,
`pricing/page.tsx:276`). Gate the page, `/api/app/route-plan`,
`/optimize`, `/schedule/suggest`, the on-my-way ETA and the Atlas
`optimize_route`/`find_a_time` tools with `hasPlan(company, "SHOP")` → 402,
and keep the calendar's drive-gap fetch free of Mapbox calls for non-Pro
tenants (today every calendar view of every free tenant spends matrix
elements).

### Should fix

- **S1. Stops on a deactivated member vanish.** The page loads
  `isActive: true` users only (`page.tsx:36`); a job whose only assignee was
  deactivated has no group and drops off the map and the stop count while
  the calendar still shows it. Show them under an "Inactive" group or
  Unassigned.
- **S2. Times render in the browser's timezone.** `fmtTime`
  (`RouteMapClient.tsx:198`) uses the device zone; the preview's "Day starts
  at" is company time; `addToDay` writes browser noon. An owner travelling
  or a remote dispatcher sees shifted times and can land a job on the wrong
  day. Send `Company.timezone` down and format with it (the calendar already
  has this pattern).
- **S3. Errors inside the Optimize preview are invisible.** The error
  banner lives in the map stage (`z-[1005]` inside an `isolate` stage) while
  the Modal portals above it; a failed Apply (409 "doesn't fit", stale list,
  network) looks like nothing happened. Render errors inside the modal.
- **S4. Day-navigation race.** `refresh` has no stale-response guard; two
  quick arrow clicks can show day A's stops under day B's header and skip
  the re-fit. Track a request id or AbortController.
- **S5. "Anytime" jobs are optimized as 60 minutes.** Job has no duration
  field; `clampedDurationMinutes` falls back to 60 for any untimed stop, so a
  four-hour anytime install gets a one-hour slot and the day packs too
  tight. Recurring visits carry `visitDurationMinutes` on the Subscription
  — carry it onto the generated Job and add `estimatedMinutes` to Job.
- **S6. Optimize ignores all-day personal blocks** (only `allDay: false`
  blocks are fetched, `optimize/route.ts:250`); Find-a-Time respects them.
  A vacation day still gets a route.
- **S7. Reassign gaps.** No card for a tech with an empty day (cannot hand
  them a job by drag); the Unassigned card and a tech card for an appointment
  both highlight as drop targets and then fail with a red banner.
- **S8. Job status is not shown on the map or list.** Done, in-progress and
  pending stops look identical; a tech cannot see which is next.
- **S9. On-my-way ETA only uses `job.address`;** property-only jobs get no
  ETA. Resolve property → address → contact like `resolveRouteDay` does.
- **S10. No-token banner tells the customer to "add MAPBOX_TOKEN to the
  server environment."** Replace with "Maps are being set up" copy, and make
  sure `MAPBOX_TOKEN` and `NEXT_PUBLIC_MAPBOX_TOKEN` are both set on
  production and staging (the estimator memory says the public one is not).
- **S11. Share/print.** "Send route to phone" opens Google Maps on the
  desktop, truncates at 10 pins silently; Copy copies a Google URL, not a
  WorkBench link; Print with the desktop panel collapsed prints a blank page.
- **S12. Tests.** Only `route-walk` has unit tests; `routing.ts` (solver),
  `find-a-time.ts`, `geocoding.ts` (state gate, cache), `directions.ts` and
  the ETA have none. E2E covers the read model, not Optimize Apply,
  Find-a-Time or on-my-way. Add solver + geocode-acceptance unit scripts and
  an e2e that applies an optimized day and checks reminder stamps.
- **S13. Perf.** Hover and drag set state on the 1,900-line component every
  event; every reassign/apply calls both `refresh()` and `router.refresh()`.
  Fine for 10 stops, sluggish at 30+. Memoize rows, drop the double refresh.
- **S14. Solver.** Add Or-opt (move one stop) after 2-opt; cheap, removes
  most of the 20 % outliers.

---

## 2. Usefulness by industry

The tool today is "one tech, one day, order by drive time, drive-aware
Find-a-Time, on-my-way ETA." That maps onto the 16 signup industries like
this:

**Route-dense recurring (lawn care, pool & spa, pest control, cleaning,
window cleaning, pressure washing).** This is the segment that buys route
software, and where the current tool is weakest. Their real questions are
weekly, not daily: which tech owns which zone on Tuesdays, keep the same
order every week so customers know when to expect us, balance 60 stops
across 4 trucks. Today: recurring visits are generated 28 days out as
ordinary jobs (good), but there is no weekly view, no saved order for a
series, no multi-tech balancing, and re-running Optimize each day reshuffles
the order a pool tech has memorised. Verdict: usable as a map, not yet a
reason to pay.

**On-demand trades (HVAC, plumbing, electrical, appliance repair, garage
door).** Their questions are same-day: who is closest and free for this
emergency call, can we fit it before 3 PM, which tech is licensed for gas.
Find-a-Time answers "when" for one chosen tech; nothing answers "who."
There are no time windows, no skills, and Optimize re-times promised slots
(B5). Verdict: Find-a-Time and on-my-way ETA are genuinely useful; the
optimizer is risky for them until B5 lands.

**Project trades (roofing & gutters, painting, handyman, junk removal).**
One to three stops a day, multi-day jobs, dump runs. The map is nice to
look at; routing adds little. Junk removal would want truck capacity and
dump-site legs (located blocks cover dump runs today). Verdict: do not
oversell Routes to them; sell the team map and scheduling.

**PC building & repair.** Mostly drop-off. Not a fit.

Net: the pitch is honest for roughly six of sixteen industries, and for
those six the missing pieces are multi-tech, weekly, and stability — not
more polish on the single-day map.

---

## 3. What would make it a standout

Ordered by value to the six industries that pay for routing, then the five
on-demand trades.

1. **Locks and time windows** (B5). Lock icon per stop in the preview;
   `arriveAfter`/`arriveBefore` on Job, honoured by `walkDay` and shown as a
   chip. Table stakes for every competitor's optimizer.
2. **Whole-crew build: "Plan the day."** Take the unassigned pool plus each
   tech's fixed stops, assign by proximity, working hours and capacity, then
   optimize each tech. This is the "dispatch" the site already promises.
   Greedy insertion over the per-tech matrices is enough at ≤25 stops per
   tech.
3. **"Who should take this?"** Extend Find-a-Time across all techs: rank
   techs by added drive for a new address and date, one tap to assign. The
   HVAC/plumbing killer feature; most of the engine already exists.
4. **Route templates for recurring work.** Save an order per series/day-of-
   week, apply it when visits generate, optimize a whole week once, and a
   "keep last week's order" toggle. Lawn/pool/pest live on this.
5. **Client "on the way" tracking link.** `LocationPing` already lands every
   3 minutes while clocked in; expose a tokenised hub page with the tech's
   pin and live ETA, linked from the on-my-way text. Housecall Pro and
   Jobber both have it; it is the feature clients notice.
6. **Tech "Today's route" phone mode.** Next-stop card with Navigate, On my
   way, Arrive/Clock in, Done → next, status glyphs on each stop, offline-
   tolerant. Today every action is Open → job page → back.
7. **Route ROI numbers.** Miles and drive minutes per tech per day, drive vs.
   wrench time, "Optimize saved 47 min today," monthly mileage log export
   (IRS). Puts a dollar figure next to the plan price.
8. **Traffic-aware ETAs** for today only (Mapbox `driving-traffic`, 10-point
   limit is fine for the next-stop leg and on-my-way).
9. **Skills and equipment tags** on users and jobs, feeding 2 and 3.
10. **Territories.** Draw zones per tech/day-of-week on the map; new jobs
    inherit the zone's default tech and day (pest/cleaning/lawn).
11. **Address quality tool.** List of unlocatable addresses with in-place
    fix using the existing `suggestAddresses` autocomplete; pins that
    resolve to a different state get a warning, not a silent drop.
12. **Truck capacity / dump legs** for junk removal — later.

---

## Suggested order of work

1. B1 + B2 (spend model, per-tech matrices) — one batch, needed before any
   marketing.
2. B3, S1–S4, S8 (client correctness) — one batch, ~a day.
3. B4 (geocode cache) + S11 address tool — one batch.
4. B5 locks/time windows + B6 gating — ship together with the Pro launch.
5. Standout items 2, 3, 4 — the paid roadmap.

Test recipes to add with batch 1–2: Optimize a day with one completed stop
and drag-reorder (no 409); load a 6-tech/30-stop day and confirm `measured:
true` per tech; apply an optimized route with "Text clients" off and check
no messages; open the routes page from a browser set to Europe/London and
confirm times match the calendar.
