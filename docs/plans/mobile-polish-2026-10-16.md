# Mobile polish batch 1 — 2026-10-16

David, after a day on the phone with streamline batch 1: the keyboard feels
rough in the iPhone app, date and time boxes "are not formatted right and
not the quickest to use", the unread-messages count sits on the Create
button (whose Message tile starts a NEW message), and scheduling a waiting
job from the phone Schedule means scrolling past Recent clients and then
tapping a day. "Overall I just want to make sure the mobile version is also
extremely easy to pick up on and use." Branch `mobile-polish`.

Decisions David made up front: the pickers that looked wrong are the date
and time boxes; the keyboard roughness is in the iPhone app; a waiting job
should open the place sheet on tap; dates get chips where there's room and
a clean button elsewhere.

## What changed

### Keyboard (iPhone app)

- `html { scroll-behavior: auto }` on phones (`app/globals.css`). The
  Capacitor keyboard resizes the webview (`resize: native`) and WebKit
  then scrolls the focused field into view; with smooth scrolling that
  reveal was a slow glide fighting the keyboard animation. Desktop keeps
  smooth anchors. Nothing native changed (a `capacitor.config.ts` change
  would need a store build), so this is the web-side lever — David's test
  decides whether more is needed.

### Date and time boxes (`components/DateField.tsx`)

- `DateField`, `TimeField`, `DateTimeField`: drop-ins for the native
  inputs. On phones the control's own text is hidden (`.wb-pick`) and a
  label sits over it reading **"Mon, Oct 20"**, **"2:30 PM"** or the
  placeholder (**"Pick a date"**) — an empty box no longer collapses, a
  filled one no longer reads "10/20/2026". The control itself is still the
  tap target, so the phone's calendar / time wheel opens as before. Desktop
  renders the plain input. Labels come from `lib/date-label.ts`
  (`scripts/test-date-label.ts`).
- Swapped at 33 sites: tasks (due, reminder), expenses (date, export
  range, edit), schedule (shift sheet, block sheet dates + times),
  repeating blocks, business hours, timesheets (add / edit entries),
  subscriptions (next bill, next visit), sticky notes (comes down),
  send later, repeat until, new series first visit, collect payment,
  payment row, appointment reschedule, quote valid until, invoice due
  date, and the date half of every `SlotTimePicker`. Left native: the
  Route Manager's invisible overlay date input and its tiny preview time
  box.

### Chips where there's room

- **Job page → Unscheduled / reschedule panel** (`ScheduleJob.tsx`): day
  chips (Today / Tomorrow / Mon 20 / Pick a date), the start time dropdown
  and length chips (30 min … All day, Custom shows an End picker). An
  existing schedule opens on its own length. "Client can take it" from /
  until are `TimeField`s reading "Any" when blank.
- **Schedule place sheet** (`PlaceSheet.tsx`): the same day chips replace
  the date box; the Length dropdown becomes chips with "ends 2:30 PM" in
  the label; Custom (or a length not on a chip, like a 45-min price-book
  service) shows the full list under the chips.

### Unread messages badge

- The red count moves from the Create `+` to the **More** tab
  (`components/AppShell.tsx`); the Messages tile inside the More sheet
  already carried it. The Create sheet's Message tile has no count any
  more (it starts a new message). The More tab's dot still covers
  requests, past-due invoices and tasks when there are no unread messages.

### Scheduling a waiting job on the phone

- **Tap opens the sheet.** On phones, tapping any card in "Schedule
  someone" (a waiting job, a request, a client, "New client …") opens the
  place sheet at once for the day on screen (never a day that's gone by):
  jobs and requests land as Anytime, a person gets 9:00 to adjust. No more
  "arm it, then tap a day". Desktop keeps click-then-click and dragging.
- **Waiting jobs list first** on phones, above Recent clients (desktop
  order unchanged).
- The empty-day card's "N jobs waiting to be scheduled" line is now amber
  and tappable: it opens the list.

## Tests

- `npx tsx scripts/test-date-label.ts` (in `npm run test:unit`).
- `tsc`, `npm run check:design`, `next build` green.

## Test recipes (iPhone app unless noted)

1. **Keyboard.** Open New Client, tap Name, type. The page should settle
   under the keyboard in one move, no slow glide. Tap Phone, then Email —
   each field should land in view without the page drifting. Same on a
   long form (New Job → More details → Description).
2. **Date box, empty.** Invoice → More details → Due date reads
   "Pick a date" when cleared, "Mon, Oct 20" when set. Tap it → the phone's
   calendar opens, pick a day → the box reads the new day.
3. **Date box, dense spots.** Tasks → New task → Due date; Expenses → New
   expense → Date; Settings → Booking → a repeating block → Starting. Each
   reads as a date, lines up with the boxes beside it, opens the calendar
   on tap.
4. **Time box.** Schedule → Block off time → From / To read "9:00 AM" /
   "5:00 PM"; tap → the time wheel. Job page → Unscheduled panel → Client
   can take it: from / until read "Any" when blank.
5. **Job page schedule.** Open an unscheduled job → "Unscheduled — set a
   date" → Day chips, Start, How long chips. Tap Tomorrow → 1:00 PM → 2 hrs
   → Save → the job reads Tomorrow 1:00 PM, ends 3:00 PM. Reopen → the 2 hrs
   chip is already on.
6. **Job page, Custom length.** Same panel → Custom → an End picker
   appears; set 4:15 PM → Save → the job ends 4:15.
7. **Job page, Anytime.** Tick Anytime → only the day chips show → Save →
   "Oct 20 — Anytime".
8. **Place sheet.** Schedule (phone) → the yellow count on "Schedule
   someone" → the sheet opens with **Unscheduled jobs first**. Tap one →
   the place sheet opens right away, set to the day you were looking at,
   Anytime ticked. Untick Anytime → Start + length chips. Schedule → toast,
   the job is on that day.
9. **Place sheet, other day.** On the Schedule, pick Thursday in the date
   strip, open the list, tap a waiting job → the sheet opens on Thursday
   (the hint under the search box says "Tap one to put them on Thu, Oct
   22").
10. **Place sheet, past day.** Pick last Monday in the strip → tap a
    waiting job → the sheet opens on today, not last Monday.
11. **Empty day shortcut.** On a day with nothing scheduled and jobs
    waiting, the card says "N jobs waiting to be scheduled — tap to pick
    one" in amber; tap → the list opens.
12. **Clients from the list.** Open "Schedule someone", type a client's
    name, tap them → the place sheet opens for that day with 9:00 AM
    selected and the kind set as before (lead → appointment, client →
    job).
13. **Badge.** Have a client text you. The red count appears on **More**,
    not on `+`. Open More → the Messages tile shows the count. Tap `+` →
    the Message tile has no count. Open the thread → the count drops.
14. **Badge, other things.** With no unread messages but a new request,
    More shows the small dot as before.
15. **Desktop.** Schedule → Schedule someone → click a card → "Now click a
    day or time to place them" → click a slot → the place sheet. Dragging
    still works. Date boxes on desktop look exactly as before.
16. **Dark mode.** Date box labels, the chips and the amber "jobs waiting"
    line read correctly.

## Status

- 2026-10-16: built; tsc + unit + design checks + build green. Help Center
  ask pending (use-the-schedule and create-a-job guides describe arming a
  card then tapping a day; the appointments guide mentions the date box).
