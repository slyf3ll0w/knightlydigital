# Ideas backlog

Parked ideas — not scheduled, not promised. Pull into `roadmap.md` when one
gets picked up. (Deferred items that ARE expected to ship stay in the
roadmap's per-feature "Deferred" notes.)

## "Streamflaire Books" — accounting-lite paid add-on (proposed 2026-07-16, parked)

A cheaper-than-QuickBooks add-on (~$10–15/mo) for solo operators who only
need profit visibility and a painless tax season — NOT a QuickBooks clone
(no double-entry GL, no bank feeds/Plaid, no payroll; the accountant
network effect makes full accounting unwinnable). Positioning: "your CPA
does real accounting once a year; Books handles everything until then."
Grows out of data we already have (paid invoices = revenue, Expense model
= costs):

1. **Profit & Loss report** — revenue vs expenses for any date range;
   mostly a report over existing data (Insights already shows the three
   cards; this adds monthly breakdown + category detail + PDF).
2. **Schedule C expense categories** — replace `Expense.category` free
   string with IRS Schedule C-aligned category enum so year-end is a
   printout (keep free string as a sub-label).
3. **Receipt capture** — photo attached to an expense (pairs with the
   native mobile app + camera; needs R2 storage like job photos).
4. **Mileage log** — trip entries w/ IRS standard rate; very field-service,
   phone-native.
5. **Sales tax collected report** — sum of Invoice.tax by period (data
   already exists).
6. **Year-end accountant package** — one export (CSV + PDF) of P&L,
   expense detail w/ receipts, sales tax, mileage.

Complements (does not compete with) the QuickBooks Online sync: small
clients start on Books; when they outgrow it, the QBO integration is
waiting. Deliberately excluded forever: bank feeds (Plaid per-connection
cost + reconciliation UX is the slippery slope to rebuilding QuickBooks).

## Embeddable ecommerce module (proposed 2026-07-02, parked)

"Add a store to any existing website with one script tag" — free,
monetized on a payment cut (Finix payfac rail, not Stripe), reusing the
booking-embed iframe/postMessage plumbing. Leaning module-of-Streamflaire
(gift cards, maintenance plans, parts) over standalone product. Full
write-up: `ecommerce-embed-idea.md`.

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
   animate from 0 on first paint (small client component). ~~Page-to-page
   fade~~ DONE 2026-06-12 via template.tsx `.page-enter` (roadmap §3m) —
   count-up still parked.
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
