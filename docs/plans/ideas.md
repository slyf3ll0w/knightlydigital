# Ideas backlog

Parked ideas — not scheduled, not promised. Pull into `roadmap.md` when one
gets picked up. (Deferred items that ARE expected to ship stay in the
roadmap's per-feature "Deferred" notes.)

## Paper Ledger design — pass 2 (proposed 2026-06-12, after pass 1 shipped)

Pass 1 (commits 91f2083 + follow-up) covered tokens, cards, stamps, serif
numerals, the dashboard rebuild, and the mobile create button. What it
deliberately left out, roughly in impact order:

1. **"Needs attention" priority feed** — replace nothing, add above the
   workflow ledger: past-due invoices, stale AWAITING_RESPONSE quotes (no
   reply in N days), unscheduled active jobs, today's unassigned visits —
   one ranked list with inline actions. The dashboard starts answering
   "what should I do next," not just "what exists." Pairs naturally with
   email automations (same urgency rules drive both).
2. **Schedule grids ledger touch-up** — the month/week/day grids still use
   the old cool-toned hardcoded styles; bring them onto the paper canvas
   (hairline grid lines, stamp-styled all-day chips, Fraunces day numerals
   in the month view).
3. **Insights page** — same treatment + real charts: the dashboard's
   server-SVG sparkline pattern can grow into simple bar/line charts
   (revenue by month, by lead source) with no chart library.
4. **Brand-color reach** — company brandColor currently themes the Create
   button, active nav, mobile tabs, and create-sheet tiles. Could also
   tint the workflow ledger's headline stamps and the time-rail dots, so
   each company's ledger feels like *their* book. Needs the
   sidebarAccent()-style luminance guard anywhere it lands on paper.
5. **Per-entity hue coding** — requests/quotes/jobs/invoices each get a
   fixed accent hue used on their list-page icon tiles and detail headers,
   so screens are recognizable at a glance (the icons already exist; this
   is just consistent color).
6. **Count-up numerals + view transitions** — the big Fraunces counts
   animate from 0 on first paint (small client component); page-to-page
   navigation gets the View Transitions API fade. Pure polish, do last.
7. **Empty-state coverage** — the line-art empty states cover the 5 list
   pages + dashboard; extend the same style to search-no-results, filtered
   tabs with zero items, and the schedule's empty day/week views.

## "Getting started" setup checklist (proposed 2026-06-12, parked)

Dashboard card for new companies that checks itself off from real data —
e.g. *Add your logo ✓ / Add or import clients / Build your first form /
Send your first quote / Invite your team* — each item deep-linking to the
right screen, the card disappearing once complete (or dismissible).
Complements the onboarding tour (roadmap §3k): people skip tours but
finish checklists. Implementation sketch: derive each item from existing
data (Company.logoUrl, contact count, WebForm count beyond the default,
quote count, user count), no new schema needed; optional dismissed flag on
Company if companies want it gone early.

## Form editor UX (proposed 2026-06-12, David: good ideas, not now)

Roughly in impact-per-effort order; #1 + #2 are one refactor, then #3.

1. **Click-the-preview editing** — the live preview is display-only today;
   make each field in the preview clickable to jump to (and highlight) its
   editor card. The preview becomes the navigation map.
2. **Collapsible editor sections** — accordion the left-column cards (one
   open at a time) so the preview stays beside what's being edited instead
   of a long scroll.
3. **Submission counts on the forms list** — "14 submissions · last one 2h
   ago" per form. Needs a formId column on Request (and/or BookingRequest)
   so submissions attribute to their form.
4. **Drag-and-drop field reordering** — replace the up/down arrows; let
   custom fields sit anywhere among the standard fields rather than the
   fixed slot between service and date.
5. **Mobile/desktop preview toggle** — most clients fill forms on phones; a
   width switch on the preview shows the real thing.
6. **QR code for the share link** — one-click QR download for door hangers,
   yard signs, truck decals. Cheap, very field-service.
7. **Add-to-price-book inline** — create a missing service from inside the
   services picker instead of open-new-tab-and-reload.
