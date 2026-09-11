# Scheduling & Routes overhaul — 2026-09-09

David's ask: month view listed work in load order instead of clock order;
drag was clumsy (whole-hour snap, no ghost, no touch, no resize); he wanted a
sidebar to type a client/lead and drag them onto the calendar with a sheet
that adapts to the view; and he flagged Routes as "lacking".

## What shipped

### Calendar (`app/platform/schedule/`)

| File | Role |
|---|---|
| `schedule-lib.ts` | DTO, date helpers, tones, `sortItems` (Anytime-first then clock), `layoutTimed` |
| `useCalendarDrag.ts` | Pointer drag engine: mouse after 5 px, finger after a 280 ms hold; `data-drop` zones (`day` / `anytime` / `column`); 15-min snap; resize; drag-to-select; auto-scroll; Escape; one-shot click swallow after a drop |
| `MonthGrid.tsx` | Desktop month; sorted chips; capacity bar per day (booked ÷ crew × open hours) |
| `TimeGrid.tsx` | Week / day / dispatch columns from one component; off-hours shading; landing preview with time badge; live resize; drive-gap labels (red when the gap can't fit the drive); inline Accept on tentative bookings |
| `SchedulePalette.tsx` | "Schedule someone": search over clients, leads, NEW requests, unscheduled jobs; cards drag or arm-then-tap |
| `PlaceSheet.tsx` | One sheet for job / appointment / reschedule / new client; defaults from who + where dropped; learned duration; Find-a-Time chips |
| `UndoToast.tsx` | Undo + "Text client" / "Email client" |
| `ScheduleClient.tsx` | Shell: optimistic moves, dispatch board (`?board=team`), shift-drag copy, "Move the day", keyboard (T ← → N P) |

### New endpoints (`app/api/app/schedule/`)

- `palette` GET `?q=` — scoped search; empty query = waiting lists.
- `duration-hint` GET `?title=` — median of actual clock time → scheduled length → price-book duration.
- `notify-move` POST `{kind,id,previousStart?}` — SMS and/or email the client the new time (`lib/schedule-notify.ts`).
- `shift-day` POST `{date,toDate,userId?,ids?,includeAppointments?,notify?}` — rain delay; returns `undo` ids; reverse call restores.

### Routes

- `lib/routing.ts`: `driveMatrix()` returns minutes **and km** plus `measured`; `solveStopOrder(…, roundTrip)`; `routeMinutes(…, closeLoop)`.
- `lib/directions.ts`: Mapbox Directions road geometry (metered as matrix elements, 10-min cache).
- `lib/route-plan.ts`: geocoding runs 6-wide instead of serially; legs carry km + `measured`.
- `GET /api/app/route-plan?geometry=1` → per-tech road polylines.
- `optimize`: `roundTrip`, `notify` on apply, past-close warning, estimate warning, `totalDistanceMiles`.
- `RouteMapClient.tsx`: road polylines (dashed fallback), grip drag-to-reorder (→ preview) and drag onto another tech's card (reassign), Navigate per stop (Apple Maps on Apple), send-whole-route / copy link, print day sheet, live clocked-in techs (managers, today only) with "running past planned end", `~` only when estimated, today from company TZ.
- `arrival` API now uses the company's day, not the server's.

## Follow-up (same day, after David's phone test)

- **Notify-on-move never dead-ends.** `lib/schedule-notify.ts` now always
  posts the new time into the client's portal thread (PortalMessage
  OUTBOUND + hub push), then texts when SMS is live and emails when there's
  an address. "Couldn't send" only happens if the portal write itself
  fails. The toast reports which channels went out.
- **Phone toast restacked.** Text on top, Undo + Text client on their own
  row, sits above the tab bar and the + button. Drag ghost card clamped to
  the viewport.
- **Blocked time can carry a location.** `TimeBlock.address/lat/lng`
  (geocoded on save). The Block Time sheet has "Where (optional)". A
  personal block with a pin is a fixed stop in `resolveRouteDay` (kind
  `block`, status `BLOCK`), so Find a Time, the calendar's drive gaps, the
  route map (dashed pin, "Busy") and road geometry all drive to and from
  it. Optimize never moves it. Company-wide blocks don't route (no single
  driver).

## Not done (deliberate)

- Whole-crew multi-tech balancing (optimize is still one tech per call).
- Two-way Google/Outlook sync, per-user booking links for calls. (One-way
  sync — .ics feed + Google push — shipped 2026-09-11, see
  `google-calendar-sync-2026-09-11.md`; two-way is still open.)
- Phone drag-to-time (phones drag rows between days; time changes go through the sheet).

## Verify

`npm run e2e -- schedule-tools` (API paths) plus `jobs-scheduling`. Drag itself is a browser gesture: verify by hand on desktop (move, resize, paint a range, palette drop, By tech columns, Move the day) and on the phone (press-and-hold a row → drop on a date-strip day).
