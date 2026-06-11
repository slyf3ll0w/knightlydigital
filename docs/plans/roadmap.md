# JobFlow build roadmap

Living document — agreed priorities and parked work. Last updated 2026-06-11
(after the onboarding wizard + responsive/design batch shipped, commits
`569a814` and `bc3520c`).

## Next up (agreed order)

### 1. Design polish backlog (approved 2026-06-11, ride along page by page)

David's verdict: the app reads "AI-generated." Shipped already: company
logo/name owns the sidebar ("Powered by JobFlow" footer), gradient avatars,
brandColor accents in the chrome, PWA install. Remaining:

- **Status chips, one system everywhere** — green = paid/approved/active,
  amber = awaiting/draft-sent, red = past due/changes requested,
  gray = draft/archived. Same component on list pages, detail pages,
  dashboard cards.
- **Denser, column-aligned lists** — tighter row height, right-aligned money
  columns with `tabular-nums`, stronger column headers (Jobber-style density
  is what makes it feel like established software).
- **Illustrated empty states** — small line-art + a single action button
  instead of centered gray text. New accounts see empty states first; this is
  the first impression.
- **Micro-polish** — row hover states, button press states, skeleton loaders
  instead of blank flashes during navigation.
- Small bug while in there: `/app/settings` throws React #418 (hydration —
  embed snippet builds from `window.location.origin`; render it client-only
  or from a server-passed base URL).

### 2. Auto-resizing embed iframe (small)

postMessage height script so the embedded request form hugs its content.
Other embed ideas David liked: `?font=` matching, `?service=` prefill,
script-tag/WordPress packaging.

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
