# Ideas backlog

Parked ideas — not scheduled, not promised. Pull into `roadmap.md` when one
gets picked up. (Deferred items that ARE expected to ship stay in the
roadmap's per-feature "Deferred" notes.)

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
