# JobFlow build roadmap

Living document — agreed priorities and parked work. Last updated 2026-06-11
(after the design polish batch: StatusChip system, denser lists, illustrated
empty states, skeletons, settings hydration fix).

## Next up (agreed order)

### 1. Design polish backlog — SHIPPED 2026-06-11

David's verdict was the app read "AI-generated." Earlier batch: company
logo/name owns the sidebar, gradient avatars, brandColor chrome, PWA install.
This batch shipped the rest:

- **Status chips** — one `components/StatusChip.tsx` (dot + tinted pill)
  everywhere: list pages, detail headers, contact work table, dashboard
  workflow cards. Tones in `lib/statuses.ts`: green = paid/approved/active,
  amber = awaiting/new/lead, red = past due/changes requested, gray =
  draft/archived (awaiting states used to be blue).
- **Denser lists** — rows `py-2.5 px-4`, stronger `text-[11px] font-semibold`
  uppercase column headers; money right-aligned (tabular-nums is global on
  `.app-ui`).
- **Illustrated empty states** — `components/EmptyState.tsx`, line-art SVG per
  section + one solid action button; on all 5 list pages + dashboard
  appointments panel.
- **Micro-polish** — `active:` press states on rows and every green primary
  button; per-route skeleton `loading.tsx` for jobs/quotes/invoices/contacts/
  requests/dashboard (`components/ListSkeleton.tsx`).
- `/app/settings` React #418 fixed — base URL now comes from request headers
  via the server page instead of `window.location.origin`.

NOT yet eyeballed against live demo data (no local `DATABASE_URL`; verified
via build + isolated component render). Worth a quick prod click-through.

### 2. Auto-resizing embed + customizable booking form — SHIPPED 2026-06-11

- Embed posts `jobflow:height` (ResizeObserver, `EmbedAutoResize.tsx`); the
  settings snippet is now an iframe + listener pair that hugs the content.
- Embed params: `?font=` (Google Font loaded in-iframe), `?accent=` hex
  override, `?service=` prefill. Script-tag/WordPress packaging still open.
- Booking form is configurable per company (`Company.bookingForm` JSON,
  `lib/booking-form.ts`): address/date toggles, service question as
  text/dropdown/multiple-choice cards, message label/placeholder/required,
  up to 10 custom fields. Custom answers append to request details as
  "Label - value" lines (David's spec: "Budget - $1,500").
- Settings → "Booking Form Fields" builder card (saves on its own).
- First real client: Excellent PC Building — configure his form (radio
  Build Only / Parts + Build, City dropdown, Budget) in his account, then
  swap his site's static form for the embed.

### 3. Schedule rebuild (big)

Week/day views, unscheduled-jobs drawer, "Anytime" row, team filter — per
`docs/jobber-research/jobber-build-spec.md` §6. Current schedule is a month
grid only.

### 4. Email automations via Resend

Quote follow-ups, payment reminders, visit reminders + email verification at
signup (spec §8). SMS stays ON HOLD as a future paid add-on (per-message cost
vs free software — David's call).

### 5. Payments go-live (blocked on BotPay payfac approval)

`FinixProcessor` in `lib/payments.ts` (one class + `PAYMENT_PROCESSOR` env).
Deposits + online payments light up. Also swap the onboarding wizard's
"Getting paid" placeholder step for the real merchant application, and notify
existing companies from the dashboard.

### 6. Later

- Photo upload (Cloudflare R2; migrate logos out of Postgres at the same time)
- Team management page
- Industry quote templates + industry default lead sources / booking-form
  service dropdowns (see `industry-price-books.md` "Later" section)
- Housecall Pro trial exploration (optional; Jobber spec already covers most)

## Marketing site TODO

- Replace placeholder phone (214) 555-0100
- Wire up ContactForm.tsx (currently fakes submission)
- Header social links are `#`
- Update /crm page to describe JobFlow

## David's own action items

- Create Cloudflare Turnstile widget; set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` +
  `TURNSTILE_SECRET_KEY` on Railway (captcha code is deployed, inert until then)
- Verify daily backups on the Railway Postgres service (highest-priority ops item)
- `railway login` — CLI session expired 2026-06-11

## Useful test accounts

- Demo company: "Streamflare Demo Co" — demo@streamflaremedia.com /
  DemoJobFlow2026! (Pressure Washing price book; brandColor intentionally set
  to blue #2563eb to demo chrome theming)
- Superadmin admin@streamflaremedia.com has NO company → /app redirects it to
  register; use the demo account for UI work
- Cleanup utility for test signups: `scripts/delete-test-company.mjs <slug>`
  (needs `DATABASE_URL` set to the public proxy URL — internal host is
  unreachable locally)
