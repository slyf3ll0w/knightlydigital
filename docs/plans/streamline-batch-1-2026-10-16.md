# Streamline batch 1 — 2026-10-16

David, 2026-10-16: "most of these guys are coming from pen and paper … we need
to make the software super streamlined." The address autofill ("Use my
location", 2026-10-15) was the first of these. This batch cuts the create
forms down to what someone off a clipboard actually needs and makes the rest
fill itself in. Branch `streamline-batch-1`.

Decisions David made up front (AskUserQuestion):

- Typed line items with a price **save themselves as Services** silently
  (deduped by name).
- The client / lead form takes **one Name box** on create ("Mike Jones" →
  first / last, same rule as the Leads board quick-add); edit keeps two.
- New Job with a team **defaults the crew to the person creating it** and
  folds "Assign to" under More details.
- New Appointment gets the **same day / length chips** as New Job.

## What changed

### Shared pieces

- `components/DayChips.tsx` + `lib/day-chips.ts` — **Today / Tomorrow /
  Sun 18 … Thu 22** chips plus "Pick a date" (a native date input that opens
  on tap). Value is the local `YYYY-MM-DD` the forms already use.
- `components/DurationChips.tsx` — **30 min / 1 hr / 1½ hrs / 2 hrs / Half
  day / All day / Custom**. The end time is computed from start + length;
  Custom shows the old End picker. `lib/duration-pref.ts` remembers the last
  pick per form on the device (`localStorage wb:duration:job|appointment`,
  guarded).
- `components/SlotTimePicker.tsx` now exports `SlotTimeSelect` (the time
  dropdown alone) so a form can pick the day with chips.
- `components/MoreDetails.tsx` — the fold: a dashed "+ More details" row with
  a one-line hint of what's inside; opens in place, stays open. Controlled
  so a "Change" link elsewhere on the form can open it.
- `components/OptionChip.tsx` — the chip button (`aria-pressed`) and a
  sideways-scrolling `ChipRow` for phones.
- `lib/phone-input.ts` — `formatPhoneAsTyped` ("2145550100" → "(214)
  555-0100", +1 kept, foreign / extensions / >10 digits left alone,
  backspace never sticks), `looksLikePhone`, `titleCaseName` ("mike jones"
  → "Mike Jones"; anything with a capital is untouched), `splitName`.
- `lib/new-services.ts` (`newServicesFrom`, pure) + `lib/save-new-services.ts`
  (the POSTs) — after a quote / invoice / job saves, every typed line (no
  price-book link) with a price > 0 whose name isn't in the book becomes a
  Service via `POST /api/app/work-items`. Best effort: a Sales role gets 403
  and nothing else changes.
- `GET /api/app/geocode/suggest` — Mapbox address suggestions for anyone
  who can add a client (the texting registration keeps its manager-only
  `/api/app/line/address-suggest`). `AddressAutocomplete` takes an
  `endpoint` prop.

### New Job (`app/platform/jobs/new/NewJobClient.tsx`)

- On top: **Customer**, **What** (the services), **When** (day chips, start
  time, length chips, Anytime).
- Under the customer: "Job site: 123 Main St · Change" — the address is
  shown, not asked (Change opens More details).
- **More details**: job title, description, lead source, arrival window,
  assign to (+ outsourced), job-site address with the saved-address picker.
- Crew defaults to the person creating the job (solo accounts already
  auto-assigned). The page passes `actorId`.
- The title is no longer prefilled with the last title typed (it would now
  silently name a hidden field); the services name the job, and the recent
  titles stay as suggestions in the title box.
- Unchecking Anytime leaves a bare day until a time is picked (it used to
  carry a real-looking 12:00).
- The duplicate "+ Add new customer" link is gone — the picker's own "New
  client" sheet does that.

### New Appointment (`app/platform/appointments/new/AppointmentForm.tsx`)

- On top: **Who**, **How** (in-person / phone / video, address for
  in-person), **When** (day chips, start, length chips — 30 min default,
  remembered — Anytime).
- **More details**: purpose, team members, notes, arrival window, the
  confirmation and reminder switches (both still on by default).
- Purpose is no longer prefilled from the last typed one (hidden field);
  blank still saves as "Estimate"; recent purposes stay as suggestions.

### New Invoice (`app/platform/invoices/new/InvoiceEditor.tsx`)

- On top: **Customer** (with "Due Nov 15 · Change" under it), **line items**,
  the totals.
- Tax and discount inputs sit behind **Adjust tax or discount** unless a
  discount is already set; the Tax line in the totals names the rate.
- **More details**: subject, due date, client message, notes. A blank
  subject saves as the services ("House Wash + Gutters").
- Editing an existing invoice opens everything.

### New Quote (`app/platform/quotes/[id]/QuoteEditor.tsx`)

- On top: **Client** (+ service address when they have several), **line
  items**, the totals.
- Tax / discount / deposit behind **Adjust tax, discount or deposit**
  unless one is set (an estimate tool's discount opens it).
- **More details**: title, client message, contract / disclaimer, valid
  until, internal notes. A blank title saves as the services.
- Editing opens everything.

### New Client / Lead (`app/platform/contacts/ContactForm.tsx`)

- Create: Lead / Client / Contact toggle, then **Name** (one box), **Phone**
  (formats as typed), **Email**; the **Address** card's street box
  autocompletes real addresses (picking one fills city / state / ZIP) and
  keeps "Use my location".
- **More details**: company, texts allowed (+ note), lead source, payment
  terms, assign to, notes. Company-defined custom fields stay out front.
- Edit mode is unchanged in shape (First / Last, everything visible) but
  gets the phone formatting, name casing and address autocomplete.

### Quick adds

- `components/QuickContactSheet.tsx` (the picker's "New client"): one Name
  box, phone formats as typed.
- Leads board quick-add: phone formats as typed (an email is left alone),
  name is capitalised on blur, the street box autocompletes.

### Not done (on purpose)

- Lead source is not remembered from last time — a prefilled source would
  mark every job "Google" by default and poison Insights.
- Nothing changed in the APIs except the new suggest route.

## Tests

- `npx tsx scripts/test-phone-input.ts`, `test-day-chips.ts`,
  `test-new-services.ts` (all in `npm run test:unit`).
- `tsc`, `npm run check:design`, `next build` green.
- e2e `theme-contrast` visits /app/quotes/new and /app/invoices/new.

## Test recipes (phone unless noted)

1. **Job in three taps.** `+` → Job → pick a customer → tap a service from
   the book → tap **Tomorrow** → pick 9:00 AM → the length chip already
   reads what you picked last time (first time: 1 hr) → Create job. The
   job page shows the customer's address, 9:00–10:00, you as the crew, the
   service as the title.
2. New Job → under the customer the line reads "Job site: … · Change". Tap
   Change → More details opens scrolled to the fields; the job-site box
   holds the address.
3. New Job → type a service that isn't in your book ("Gutter guard install",
   $450) → save → Settings → Services lists it at $450. New Quote → type
   "Gut" → it autocompletes.
4. New Job → tap **2 hrs** → Start 1:00 PM → the heads-up (if any) and the
   saved job end at 3:00 PM. Tap **Custom** → an End picker appears.
5. New Job → **Pick a date** → choose a day two weeks out → a chip with
   that date appears, selected.
6. New Job with a team of 2+ → More details → Assign to: you are ticked and
   marked "(you)". Untick everyone → Create job → error "Pick who's doing
   this job…" and More details stays open.
7. New Job → tick Anytime → only the day chips show → Create job → the job is
   "Anytime" that day. Untick Anytime → the Start box says "Time…" and
   saving says "Pick a time, or choose Anytime".
8. New Appointment → Client → In-person → Today → 2:00 PM → **30 min** →
   Book. More details is closed; the appointment is 2:00–2:30 on you, with a
   confirmation sent (if they can be reached).
9. New Appointment → More details → change Purpose, untick reminders →
   Book → the appointment page reflects both.
10. New Invoice → Customer → under it "Due <date> · Change" (Net terms) →
    two line items → Save. The invoice subject is "A + B". Tap Change
    before saving → More details opens with the due date box.
11. New Invoice → **Adjust tax or discount** → set 10% discount → the
    totals show it; the link is gone (inputs stay).
12. Invoice a job that had a quote with a discount → the inputs are open on
    arrival (the discount is set).
13. New Quote → Client → lines → Save (no title) → the quote is titled after
    the services. Open it → Edit → everything is visible.
14. New Quote → **Adjust tax, discount or deposit** → 25% deposit → Save →
    the quote asks for the deposit.
15. New Client → Name "mike jones" → tap away → it reads "Mike Jones". Phone:
    type 2145550100 → "(214) 555-0100". Street: type "412 Oak" → pick a
    suggestion → city / state / ZIP fill. Save → the client page shows
    first name Mike, last name Jones.
16. New Lead → More details → set lead source and a note → Save lead → both
    on the lead.
17. Edit an existing client → First / Last boxes, every section visible, the
    phone box formats as typed.
18. Quote → Client picker → "New client" → Name + phone → Add client → they
    are selected. Leads board → + → Name + a phone number → it formats as
    you type; type an email instead → it's left alone.
19. Desktop: the day and length chips sit in one row; phone: the row
    scrolls sideways with no wrap.
20. Dark mode: chips, the dashed More details row and the "Change" links
    read correctly on both pages.

## Status

- 2026-10-16: built, tsc + unit + design checks green, build green. Not
  pushed. Help Center ask pending (create-a-job, appointments,
  create-and-send-a-quote, complete-and-invoice-a-job, add-a-client guides
  describe the old field order).
