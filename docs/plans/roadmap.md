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
- Dedicated **/app/settings/booking** page ("Booking Form" sidebar item):
  field builder + share link + embed snippet. Send button text + color are
  customizable; the color doubles as the whole-form accent (selected cards,
  success check). Accent precedence: ?accent= > button color > brand color.
- First real client: Excellent PC Building — DONE. David configured the form
  in his account; his site's ContactForm.tsx renders the param-free embed
  (commit 8af9e06 in his repo) so saved appearance drives the site.
- Later additions same day: saved appearance (theme/font/text-size in config,
  embed params override), live-preview builder with option rows, transparent
  white-body fix, anti-spam (honeypot + <3s speed gate, fake success), spam
  delete (requests + leads, guarded against real work).

### 3. Schedule rebuild (big) ← NEXT UP

Week/day views, unscheduled-jobs drawer, "Anytime" row, team filter — per
`docs/jobber-research/jobber-build-spec.md` §6. Current schedule is a month
grid only.

### 4. Email automations via Resend — Phase 1 SHIPPED 2026-06-11

- DONE: new-request notification to company.email from booking form + client
  hub (lib/email.ts, env-gated on RESEND_API_KEY; EMAIL_FROM default
  notifications@streamflaremedia.com; Reply-To = customer). David set the API
  key; domain DNS verification was pending — TEST once verified: submit his
  site's form, check email arrives; if not, Railway logs show
  "[email] resend send failed" with the reason (usually from-domain mismatch
  → set EMAIL_FROM to the verified domain).
- TODO Phase 2 (spec §8): quote sent/approved notifications, payment
  receipts, quote follow-ups + payment reminders + visit reminders (need a
  daily cron hitting an API route), email verification at signup. SMS stays
  ON HOLD as a future paid add-on (per-message cost vs free software —
  David's call).

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
  `TURNSTILE_SECRET_KEY` on Railway (captcha code is deployed, inert until
  then). David deferred 2026-06-11 ("a little later"). NOTE: allowed
  hostnames must include streamflaire.com AND excellentpcbuilding.com (the
  embed runs inside his site).
- Confirm Resend domain DNS verified + test a form submission end-to-end
  (see §4 above)
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
