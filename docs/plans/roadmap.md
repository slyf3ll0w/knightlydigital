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

### 3. Schedule rebuild — SHIPPED 2026-06-11 commit 892b31a, verified live

Per `docs/jobber-research/jobber-build-spec.md` §6:

- **Month / Week / Day views** with segmented toggle, prev/next/Today;
  URL state `?view=&date=&team=` so views are linkable. Server page loads
  only the visible range; all rendering in
  `app/platform/schedule/ScheduleClient.tsx`.
- **Week/day time grids** — 24h grid (48px/hr) auto-scrolled to 7 AM,
  overlap-aware block layout (greedy column packing), red current-time
  line on today, day headers click through to day view.
- **"Anytime" all-day row** — new `Job.scheduledAnytime` boolean
  (date-only jobs anchored at noon per existing convention). Set via the
  job-detail Schedule editor (new Anytime checkbox) or by dropping on the
  row. Dashboard today-list shows "Anytime" instead of a fake noon time.
- **Unscheduled-jobs drawer** — ACTIVE + no date; drag onto an hour cell
  (keeps previous duration, default 1h), the Anytime row, or a month day
  (keeps time-of-day if it had one, else anytime). Existing blocks drag to
  reschedule. Drop = PATCH `/api/app/jobs/[id]` + router.refresh.
- **Team filter** — select over company users, filters via JobAssignment;
  hidden for single-user companies (demo co), so not yet seen live.
- Verified live 2026-06-11 on the demo account (Playwright): all three
  views, anytime editor, drag-from-drawer → Friday 10 AM. Demo data left
  in place for demos: client Marcus Webb + 3 jobs (Jun 11 2–4 PM, Jun 12
  anytime, Jun 12 10 AM).
- Not built (spec extras, parked): map split view, route optimization,
  "Find an appointment time", layout customization wizard. Touch devices
  can't drag (HTML5 DnD) — they schedule via the job detail editor.

### 3b. Team roles + lead assignment — SHIPPED 2026-06-11 commits 2c2b07f + cdc05c1 (assignments fix) + b91d500, verified live

David's spec (approved matrix in session 2026-06-11): Owner / Admin /
"Sales + Tech" (enum USER) / Sales / Tech. Adding users is free.

- **Roles**: enum now SUPERADMIN/OWNER/ADMIN/USER/SALES/TECH (MANAGER
  dropped — never assigned). `lib/permissions.ts` is the single source:
  `getActor()` loads the user fresh from the DB on every API/page request
  so deactivation + role changes are instant (JWT only updates at sign-in);
  capability helpers (isManager/canSell/canSeeMoney/canSeePricing) +
  Prisma scope builders (contactScope/viaContactScope/jobScope).
- **Lead assignment**: `Contact.assignedToId`. Sales/USER see only their
  assigned leads + those leads' requests/quotes/invoices/jobs; owners and
  admins see all + "My leads" filter tab on Clients/Requests + Assigned To
  column + reassign select on contact detail. In-app leads auto-assign to
  creator; website/booking leads → `Company.defaultLeadUserId` preset else
  the owner (preset dropdown on Team page).
- **Sales money toggle**: `Company.salesSeePayments` (default ON) gates
  Sales' access to invoices/collect-payment (their leads only).
- **Tech**: assigned jobs (JobAssignment) + schedule only; job detail
  shows client name/phone/address (David's call) but NO pricing, billing,
  or profit; can complete jobs, add notes, drag-reschedule own jobs.
- **Team page** /app/settings/team (owner/admin): add member
  (name/email/phone/role/starting password), inline role change, password
  reset, deactivate (last-active-owner guarded), lead routing + sales
  toggle. /app/settings/profile for everyone (name/phone/password —
  password change didn't exist before). Job detail gets a Team checkbox
  card (drives tech visibility + schedule team filter).
- Nav/create-menu/mobile-tabs/dashboard cards all role-filtered; admin
  manages only USER/SALES/TECH, owner manages everyone.
- **Verified live** on demo co with real accounts: Sam Seller (Sales,
  demo-sales@streamflaremedia.com / SalesDemo2026!) sees only his assigned
  lead Marcus Webb + that lead's jobs; Tina Tech (demo-tech@…/
  TechDemo2026!) sees only her assigned job, no prices. Both left in the
  demo co as demo data.
- Bug found in verification: job PATCH with only assigneeIds hit
  updateMany-with-empty-data (0 rows) → 404; fixed (findFirst then
  conditional update).
- NOT built (later): invite emails (needs Resend), per-user notification
  prefs, SUPERADMIN impersonation, audit log.

### 4. Email automations via Resend — Phase 1 SHIPPED 2026-06-11 ← NEXT UP (Phase 2)

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
