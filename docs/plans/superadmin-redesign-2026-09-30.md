# Superadmin console redesign — scope (2026-09-30)

Status: **SHIPPED 2026-09-30** — 52615986 + three e2e locator fixes, staging
e2e run 36794452482 green (88/88), main fast-forwarded to e78e220d. Built on branch
`superadmin-redesign` (worktree `knightlydigital-wt/superadmin`). Decisions
from his review: retire Packaging outright; the presence dot has three
states (green = in the app now, hollow = active today in the account's
timezone, grey = older, always with the last-seen words); a Referral source
column on the table; **Test accounts**: a Test / Live button on every row
of the home page and on the company page, two lists (Live accounts, Test
accounts), test rows excluded from every total, stat and chart. The demo
company is simply a test account once marked.

What shipped (all under the plan below): `User.lastSeenAt/lastSeenVia/
lastSignInAt/signInCount`, `Company.isTest`, `ConsoleAudit`; `lib/presence.ts`,
`lib/console-audit.ts`, `lib/console-accounts.ts`; `components/console/*`
(ConsoleShell, ConsoleSearch, AccountsClient, SignupsClient, PresenceDot,
DeviceIcons, FinixImportForm); pages: Accounts home, company page with five
tabs (`company/[id]/*Tab.tsx`), Sign-ups, Profitability (with the Finix
import), Feedback, Library, login; redirects from /applications, /invites,
/finix; `/api/superadmin/search`; `e2e/specs/superadmin.spec.ts` +
`e2e/helpers/contrast.ts` (console cookie minted in global-setup);
`check:theme` covers `app/superadmin`. Packaging page, routes and libs are
gone; its two tables stay for a month (`scripts/read-packaging-board.mjs`).

## Why now

Live clients are arriving. The console at `/superadmin` was built (July) as a
profitability report with account controls bolted on. It answers "are we
making money on each account" well and answers "who is using the product, are
they online, are they getting value" not at all. It is also the last surface
still wearing the marketing-site skin (`.wb-site`, Nunito, blue→orange keel,
top-bar nav) instead of the app's design system.

## What is there today (7 nav items, ~5,900 lines)

| Page | What it does | Verdict |
|---|---|---|
| Profitability (home) | Per-company fee revenue vs AI/SMS/email/storage/card cost, 7/30/90 d; Mapbox caps footer | Keep, but it is not the home page any more |
| Company drill-down | Month-by-month P&L, recent processor payments, then a single right column stacking Payments / Atlas / Plan / Add-on / Line / Suspend-Delete controls | Keep everything, re-lay it out as tabs |
| Packaging | Drag-and-drop board that used to build `/pricing` | **Retire.** Since 2026-09-25 the plans are hardcoded in `lib/plans.ts`; nothing outside its own routes reads the board. Keep `scripts/read-packaging-board.mjs` export for a month, then drop the tables. |
| Applications | Approve / reject self-serve sign-ups | Keep, merge with invites into one **Sign-ups** page |
| Invite codes | Mint / revoke codes | Keep as a tab on Sign-ups (the universal code made per-code invites rare) |
| Feedback | Bug / suggestion tickets, roadmap link | Keep |
| Library | Estimate-tool listings, takedown | Keep, low traffic |
| Finix import | Monthly Net Profit CSV → snapshots | Keep as a section at the bottom of Profitability (it is a once-a-month chore, not a destination) |

Also: the "Reading this report" paragraph and the two footer paragraphs on the
home page become InfoTips (design rule 5).

## Proposed console

### Shell (styled like the app)

A small `ConsoleShell` that borrows the app's look, not the tenant `AppShell`
(that one carries softphone, tour, Atlas, wallpaper and brand hooks the
console does not want):

- Same rail as the app on desktop (light-gray rail, Lexend, `.ds` tokens,
  WorkBench blue / orange as the fixed brand), dark theme honored.
- Rail groups: **Accounts** (home, Sign-ups with a pending count) ·
  **Money** (Profitability) · **Product** (Feedback with an open count, Library).
- Header: global search (company name, slug, owner email) and the signed-in
  superadmin + sign out. Search is the fastest way around once there are 30+
  accounts.
- Phones: one column, the rail becomes a horizontal chip row under the
  header. No tab bar, no More sheet.
- Login page restyled to match the app's login.
- Pages use the kit: `DsPage`, `PageHeader`, `Stat`, `Card`, `Chip`,
  `ListRow`, `SectionTitle`, `.ds-num` on money columns.
- `.wb-site` stops wrapping `/superadmin`; `npm run check:theme` extends to
  `app/superadmin` so the dark theme stays guarded here too.

### Home = Accounts

**Stat row:** live accounts · online right now (people) · accounts active in
the last 7 days · new accounts this month · pending sign-ups · open feedback.

**Needs attention** (only shows when non-empty): pending applications,
underwriting asking for more info, texting registration rejected, suspended
accounts, Atlas free tier used up this month, business line in its release
grace period, Mapbox cap at 80 % or more.

**Accounts table** — one row per company, default sort = last active:

| Column | Source |
|---|---|
| Company, slug, industry | Company |
| Status chip | Live · Pending review · KYC pending · KYC action needed · Waived · Suspended |
| Presence | green dot "online" if anyone was seen in the last 3 min, else "seen 2 h ago / 3 d ago" |
| Team | user count, how many online |
| Clients | contact count, "+N in range" |
| Activity in range | jobs · quotes · invoices · payments (counts) |
| Collected in range | Payment sum (all methods) |
| Platform cost in range | AI + SMS + email + storage collapsed into one number (hover for the split) |
| Plan & extras | Atlas on/off, Voice line, plan grants, Plus add-on, as small chips |
| Devices | iPhone / Android / web icons from where people were last seen and their push subscriptions |
| Joined | createdAt |

Range picker 7 / 30 / 90 d as today. Filters: All · Live · Needs attention ·
Pending · Suspended. The demo company is flagged so it does not skew totals.

### Company page — tabs instead of one long column

1. **Overview** — identity band like the app's settings page (logo,
   name, industry, city, joined, owner name/email/phone, presence). Status
   chips (access, KYC, texting registration, email domain, line). Counts
   grid (team, clients, jobs, quotes, invoices, payments, storage MB).
   **Activation checklist**: setup wizard done, first client, first quote,
   first invoice, first payment, booking page live, line provisioned, Atlas
   used, app installed on a phone. This is the single best "are they getting
   value" signal and it is cheap (earliest row per table). Recent activity
   timeline from `ActivityLog` (last 20).
2. **Team** — every user: name, role, online / last seen, last sign-in,
   sign-in count, devices, push on/off, softphone online, bookable.
3. **Money** — the existing month-by-month P&L table and recent processor
   payments, unchanged in substance.
4. **Usage** — AI turns/tokens, SMS segments, emails, storage, Mapbox, with
   the Atlas meters that live in the Atlas control today.
5. **Controls** — Payments, Atlas, Plan, Add-on, Line, Suspend / Delete: the
   existing components restyled, each as its own card. A **console audit
   trail** underneath: who did what to this account and when (there are two
   superadmins now).

### Presence and sign-in data (the new plumbing)

Nothing tracks "last seen" today except softphone heartbeats and the chat
read marker. Two stamps, both cheap:

- `User.lastSeenAt` + `User.lastSeenVia` (`web` | `ios` | `android`). Written
  fire-and-forget from `loadActor` in `lib/permissions.ts`, which every
  signed-in page and API call already passes through, throttled to one write
  per user per 60 s. Because the app polls nav counts every 45 s and
  notifications every 20 s while a tab or the phone app is open, "online" =
  seen within 3 min is accurate without any new client code. `via` comes
  from the user agent: the native shell appends `StreamflaireHubShell`
  (capacitor.config.ts), so iPhone vs Android vs web needs **no store build**.
- `User.lastSignInAt` + `User.signInCount`, stamped in the NextAuth `jwt`
  callback's sign-in branch.
- Company presence is derived (`max(lastSeenAt)` over its users) — no
  company column.
- New table `ConsoleAudit` (superadminId, companyId, action, detail,
  createdAt) written by the existing PATCH/DELETE handlers.

Schema adds only nullable columns and one table, so the Railway boot
`prisma db push` is safe (no data-loss flag needed).

## Other things worth adding

Recommended in this round:
- Activation checklist per account (above) and a "stuck" filter: live for
  14+ days with no invoice.
- Growth strip on the home page: accounts and 7-day-active accounts per week
  for the last 12 weeks (small bar chart, no library).
- Console audit trail.
- Global search.

Worth it later, not this round:
- **Open as this company** (read-only impersonation for support). Very
  useful, but it is a security feature and deserves its own design (banner,
  audit, read-only enforcement, no money actions).
- **Sign everyone out** for an account (needs a per-company session epoch,
  like the password-change eviction already does per account).
- Per-account error rate (Sentry already has the company tag; not worth
  duplicating).
- Email deliverability (bounces/complaints) — needs Resend webhooks first.

## Phases

| # | Work | Size |
|---|---|---|
| 1 | Presence + sign-in stamps, ConsoleAudit table, audit writes in existing handlers | small |
| 2 | ConsoleShell, login restyle, search, rail; retire Packaging; Sign-ups merge; Finix under Profitability | medium |
| 3 | Accounts home: stats, attention list, table, filters, growth strip | medium |
| 4 | Company page tabs incl. activation checklist, team, audit trail; controls restyled | medium-large |
| 5 | Superadmin e2e smoke (login, home, company page, both themes, phone width); check:theme scope | small |

Roughly two working sessions. Ships to `staging` first per the pipeline rule,
then main after the e2e run is green.

## Decisions (David, 2026-09-30)

1. Packaging: retired outright.
2. Online: three states — green in the app now (≤ 3 min), hollow active
   today (account timezone), grey older — always with the last-seen words.
3. Extra column: Referral source.
4. Test accounts: mark test / live from the main screen and the company
   page; both lists shown; test accounts out of every total.
