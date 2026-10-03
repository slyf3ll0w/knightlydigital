# Per-person booking pages (Calendly for home services) — parked idea

Raised by David 2026-10-02 while testing online booking. Parked until there
is demand ("I'll wait for it to be in demand"). Nothing built.

## The idea

Every bookable team member gets their own public booking page, the way
Calendly gives each person a link, so a salesperson or tech can hand out a
link that books THEM, not whoever round-robin picks.

## Why it is cheap when the time comes

The engine already works per person: each booking item (`BookingType`) has a
pool of members (`BookingTypeMember`), availability is computed member by
member from working hours, existing jobs and appointments, and Google busy
time (`loadPoolWithBusy` → `EngineMember[]`), and `assignMemberForSlot`
picks one at submit. Users already carry a meeting link and a start address.
A personal page is a FILTER on that pool, not a new engine.

## Sketch

- `User.bookingSlug` (handle; unique per company). Page at
  `/book/<company-slug>/with/<handle>` (also `/embed/<slug>/with/<handle>`):
  photo, name, the SCHEDULE-mode items that member is in the pool for.
  Picking one opens the same `BookingStepper`; slots + submit APIs take a
  `member` param and restrict the pool to that one user; the appointment /
  job is assigned to them; reschedule from the manage link keeps them.
- Team page: each bookable member's personal link with Copy. My Profile:
  own link + QR. Optional per-item "allow personal booking links" (default
  on) and a per-member "hide this item from my page".
- Leads created through a personal link are assigned to that member.
- Company page keeps round-robin. Items stay company-level (services and
  prices belong to the company) — no per-person event types in a first cut.
- Help Center: a guide under Clients ("Give each person their own booking
  link") + a line in "Take bookings online".

Roughly a day: schema (one column), runtime filter, two public pages +
embed, API param, Team/Profile UI, help, one e2e spec.

## Open decisions for David

- URL shape (`/with/<handle>` vs `/u/<handle>` vs `/<handle>` under the
  company slug — the last collides with item slugs).
- Whether a member can hide pool items from their own page.
- Whether the personal page also appears inside the client portal.
