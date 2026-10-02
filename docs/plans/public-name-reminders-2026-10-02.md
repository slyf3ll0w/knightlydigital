# Public name, legal name, web address + reminder text fixes (2026-10-02)

Branch `public-name` (worktree `~/knightlydigital-wt/public-name`).

## Why

David runs his side clients through the company "Lessly Holdings", but
nobody knows him by that name. Every client surface read `Company.name`,
and the texting registration pinned the brand to it (a brand filed as a
person for a page that said "Lessly Holdings" failed carrier review on
2026-09-24). Separately the appointment texts always said the business
"will arrive", even for a phone call, and the hour-ahead text could land
anywhere from 5 to 75 minutes out because the sweep ran hourly.

## What shipped

**Names.** `Company.name` is the PUBLIC name (what clients see). New
`Company.legalName` (optional) is the entity on paper: prefills the texting
registration's legal name, goes to Finix as `business_name`, and is shown to
clients only when `Company.showLegalNameOnDocs` is on (PDF footers as
"Name · Legal name", small print on the agreement signing page). Settings →
Business info: **Legal business name** field + the switch (switch appears
only when the two names differ). Renaming the business refreshes the line's
STOP/START/HELP replies (`refreshKeywordReplies`) and the caller-ID listing
when it was still the default — after the response, best effort.

**Web address.** `Company.slug` is editable (Settings → Business info →
Web address; `lib/company-slug.ts` validates: slugify, ≥3 chars, reserved
words, uniqueness across every company's current AND previous slugs). Old
slugs go to `Company.previousSlugs`; every slug resolver matches them
(`slugWhere` / `companyBySlug`) and the /book, /portal, /embed layouts
redirect to the current slug (`components/SlugRedirect.tsx`, path + query
from middleware's `x-wb-path` / `x-wb-query`; the matcher now covers those
trees). The URLs on the texting registration keep resolving.

**Reminders** (`lib/reminder-stage.ts`, pure, tested):
- A stage fires only for a booking that existed when its window opened:
  day stage ≤ 24 h out for bookings made > 24 h ahead; hour stage ≤ 70 min
  out for bookings made > 70 min ahead. A same-day booking is no longer
  "reminded" minutes after its confirmation.
- `instrumentation.ts` runs the appointment/visit reminder sweeps and both
  crew heads-ups every 5 min in production (`REMINDER_TICKER=0` turns it
  off, `=1` forces it on in dev). The hourly cron is the backstop. A 10:30
  call is reminded at ~9:20–9:25, not at 10:00.
- Copy follows the appointment type (`appointmentReminderText`,
  `appointmentReminderEmail`): phone call → "will call you at <number>",
  video → join link, in-person / job visit → arrival window. Day stage
  invites a reply ("Need a different time? Just reply."). One mention of
  the business per text.
- Assignee heads-up for appointments (`Appointment.techHeadsUpSentAt`,
  `runAppointmentTechHeadsUp`) — fires even when the client can't be
  reminded.
- The automation action `send_appointment_reminder` uses the same copy.

**Booking confirmation texts** (`bookingConfirmationText`): online bookings
now text as well as email — confirmed / request received / rescheduled /
cancelled for appointments (`notifyBooking`), confirmed for SERVICE
bookings (`booking-checkout`). Consent re-read from the contact row
(a booker who left the SMS box unchecked is skipped).

**Schema** (db:push via predeploy): `Company.legalName`,
`Company.showLegalNameOnDocs`, `Company.previousSlugs`,
`Appointment.techHeadsUpSentAt`.

**Help Center**: new guide "Your business name, legal name and web
address" (Settings & account); "Text notifications, STOP and HELP",
"Book estimates and appointments" and "Take bookings online" revised.

## Not done / David decides

- The brand on file at Telnyx stays "Lessly Holdings" (no brand-update
  call; a re-file would cost and re-review). The checkbox and page now
  say the public name, which is what a FUTURE filing would use as the DBA.
- Caller ID: if David ever customised it, the rename leaves it alone — edit
  in Settings → Phone & texting.

## Test recipes

1. **Rename to your own name.** Settings → Business info: Business name
   "David Lessly", Legal business name "Lessly Holdings". Open a quote PDF,
   the booking page, the client portal, an invoice email: all say David
   Lessly, nowhere "Lessly Holdings". Toggle "Show the legal name on
   quotes, invoices and agreements" on → PDF footer reads "Invoice #N ·
   David Lessly · Lessly Holdings"; off again → gone.
2. **Line follows the rename.** After step 1, text STOP then START (or
   HELP) to the business number from a test phone: the auto-reply names
   David Lessly. Settings → Phone & texting shows caller ID "DAVID LESSLY"
   (only if it was still the default).
3. **Web address.** Change Web address to `david-lessly`. Open
   `/book/lessly-holdings`, `/book/lessly-holdings/privacy?x=1`,
   `/portal/lessly-holdings`: each lands on the `david-lessly` URL with the
   path and query kept. Try `app` or an address another company has: inline
   error, nothing saved. Try `David Lessly`: "Lower-case letters…" hint.
4. **Phone-call reminder.** Book a phone-call appointment for yourself ~2
   hours out. Nothing arrives at booking except the confirmation text
   ("…is booked for …. We'll call you at …"). ~65–70 min before: text
   "David Lessly will call you at (…) for your Estimate call at 3:00 PM
   today." and the email "We'll call you soon". No "arrive", no "visit".
5. **Off-the-hour start.** Book a call at :30 past, more than 90 min out:
   the hour reminder lands between :20 and :25 of the previous hour (not at
   the top of the hour).
6. **Same-day booking gets no day reminder.** Book for later today: no
   "reminder" text follows the confirmation; the hour-ahead text still
   comes.
7. **Day-ahead reminder.** Book for tomorrow afternoon: a text at about the
   same time today ("…your Estimate call is Tue, Oct 7, 3:00 PM. We'll call
   you at …. Need a different time? Just reply."). Reply → lands in
   Messages.
8. **Visit copy.** Book an in-person estimate: hour text says "will arrive
   for your Estimate visit between 3:00 PM and 5:00 PM today at <address>".
9. **Video copy.** Video call with a meeting link: both texts carry
   "Join: <link>".
10. **Online booking texts.** Book through the public page with the SMS box
    ticked: confirmation text at once; reschedule from the manage link →
    "has moved to …"; cancel → "has been cancelled. Book again: …". Book
    with the box unticked: email only.
11. **Assignee push.** Appointment assigned to you with a client who has
    texts off: ~1 h ahead you still get "Up next at 3:00 PM — Estimate —
    call Maria at (…)".
12. **Automation.** An automation with "Send an appointment reminder" on a
    phone-call appointment: the text says "will call you", not "arrive".
