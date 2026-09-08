# Scale + Security Audit — 2026-09-08

Audit of the app as deployed on Railway at commit `cf1576b`. Two questions:
"will too many users online at once crash or slow the server?" and "is security
good enough to be live?" Findings are grouped into fix batches at the bottom.

## Status — 2026-09-08, same day

Batches A–G were worked through in one pass (commits `3e3eea7` Batch A,
`3428e9b` B, `71598eb` C, then D–G). What shipped vs. what was deliberately
left, by item number from the batch list below:

| Item | Result |
|---|---|
| A 1–5 | **Shipped.** next-auth 4.24.15; frame headers on every path but `/embed`; chat sweep once per boot per company; `getSession`/`loadActor` memoised with React `cache()` (+ layout reuses it via `peekActor`); Payment + Invoice indexes. |
| B 6–8 | **Shipped.** `lib/db.ts` pins `connection_limit=20&pool_timeout=20` unless the URL already does; Railway `NODE_OPTIONS=--max-old-space-size=4096`; `AbortSignal.timeout` on Finix (20 s), Resend (15 s), Telnyx (15 s). |
| B 9 | **Partial.** Failed-transfer unwind moved into `next/server` `after()` (no writes during render). The 3 Finix reads + evidence/funding fan-out still happen in SSR but are now time-bounded. Full client-side split of the live section is still open. |
| B 10 | **Shipped.** Invoices past-due flip, leads stray sweep, team/hub read receipts all probe before writing. |
| C 11–14 | **Shipped.** `listChannels`/`totalUnread` = 2 queries total; chat GET writes the seen-marker only when unread > 0; poll 8 s (typing TTL 9 s); nav-counts throttled 3 s; typing map swept on write. Hub thread already had the visibility guard. |
| D 15 | **Shipped.** Insights capped at 730 days (`All time` → `2 years`) and selects only the attribution columns. |
| D 16–19 | **Left.** Dashboard queries already select narrowly (audit overstated); leads/schedule/timesheets are inherently whole-board; contact pickers need a typeahead UI (`lib/contact-search.ts` exists) — a UI project, not a query tweak; import chunking untouched. |
| E 20 | **Shipped.** Cron: in-process overlap guard (409), per-sweep try/catch isolation, 8-minute budget (later sweeps deferred to the next tick), money sweeps ordered first, `timingSafeEqual` on the secret. |
| E 21 | **Shipped.** Reconcile walks invoices in id-ordered windows of 1000; refunds windowed to 90 days. |
| E 22 | **Partial.** Usage rollup upserts batched 50 per transaction. QuickBooks per-tenant pulls left alone (QBO Ph2 not sandbox-verified — don't touch blind). |
| F 23–25 | **Shipped.** Session 14 d rolling (`updateAge` 24 h); `Account.passwordChangedAt` + `token.authAt` — `loadActor` treats any session minted before the last password change as stale (cookie cleared via `/api/app/session-reset`, APIs 401); `normalizeEmail` rejects `%` and other never-legal chars, `emailWhere` escapes `_` (Prisma strips one backslash level, so the source uses `\\_` — verified against prod). |
| F 26 | **Shipped.** 120/hour per company on invoice send, quote send, client message, portal invite; `SMS_DAILY_CAP` (default 500/company/day) enforced inside `sendSms`. |
| F 27–28 | **Shipped.** Cron secret timing-safe; Telnyx webhook rejects timestamps older than 5 min. |
| F 29 | **Partial.** HSTS `preload` added. CSP not added — needs an origin inventory (Finix, Turnstile, Mapbox, Sentry, fonts, R2) and a report endpoint first; a wrong CSP breaks the card form. |
| G 30 | **Shipped.** `railway.json` `deploy.preDeployCommand: npm run db:predeploy` (= `db:push` + `db:seed` + backfills, 15-min timeout); container start is plain `next start`. Schema changes now apply once per deploy, not on every restart, and a second replica no longer races `db push`. |
| G 31 | **Shipped (dark).** `lib/rate-limit.ts` is async and uses Upstash Redis REST when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, falling back to the in-memory map otherwise (and on Redis errors). All 16 call sites await it. **Until those vars exist, stay on one container.** |
| G 32 | **Left.** Mapbox matrix cache stays per-process (accepted). |
| G 33 | **No change needed.** `bcryptjs` is already used through its async API, which yields to the event loop between rounds; cost 12 stays. |
| G 34 | **Shipped (lighter form).** Public `/pay/:token/pdf` and `/quote/:token/pdf` get a 30/hour per-IP GET bucket in middleware. No worker thread. |

**David owes / optional env:** `UPSTASH_REDIS_REST_URL` + `_TOKEN` (only when
going multi-container), `SMS_DAILY_CAP` (default 500), confirm
`TURNSTILE_SECRET_KEY` is set in Railway (captcha fails open without it).

**Post-deploy checks to run** (see Verification recipes): pre-deploy command
ran (`railway logs` shows `db:predeploy`), `/api/health` 200, frame headers on
`/pay/x` + `/superadmin/login` and NOT on `/embed/x`, malformed-Bearer request
to `/app/dashboard` returns a redirect not a 500, e2e suite 34/34.

## Snapshot of production at audit time

| Item | Value |
|---|---|
| Railway plan | Team (vertical headroom up to 32 vCPU / 32 GB per service) |
| App service | `Streamflaire`, 1 container, restart ON_FAILURE, healthcheck `/api/health` |
| Postgres | `max_connections=500`, `shared_buffers=128MB`, 30 open connections (20 idle) |
| DB size | 20 MB, 16 companies, 35 users |
| Cron | Railway cron `0 * * * *` → `POST /api/cron/recurring` |
| DATABASE_URL | internal host, **no `connection_limit` / `pool_timeout` params** |
| NODE_OPTIONS | not set (no `--max-old-space-size`) |
| Logs (last ~400 lines) | no OOM, no restarts, no pool timeouts |
| `npm audit --omit=dev` | 1 critical, 6 high, 1 moderate, 2 low — all fixable |

**Verdict, load:** nothing is broken today, but per-click DB work is 5–10× what it
needs to be, so degradation will start at ~30–50 concurrent users and get
serious at ~100+. The cron/reconcile path will OOM or time out at ~100 real
tenants regardless of who is online.

**Verdict, security:** acceptable to run live with real money and data. Tenant
isolation, payments, webhooks, uploads, secrets, and the superadmin console all
held up. One stale dependency (next-auth) is a one-header crash of the whole
app and must be fixed first. The rest is hardening.

---

## Part 1 — Load / scalability findings

### 1.1 Hot path: team chat + nav counts (HIGH)

- `lib/chat.ts:67-70` — `ensureEveryoneChannel()` runs an **unconditional
  `teamMessage.updateMany`** backfill on every call. It is called from
  `resolveChannel` (`:90`), `listChannels` (`:177`), and `totalUnread` (`:311`),
  so the 4-second chat poll fires it ~3× and every client navigation fires it
  once via nav-counts. A write-lock probe on the fastest-growing table,
  thousands of times a minute at scale.
- `lib/chat.ts:200-260` — `listChannels` does `lastMessageFor()` +
  `unreadCount()` per channel inside `Promise.all` over unbounded memberships.
  2 queries per DM/group, every 4 s per open chat tab.
- `lib/chat.ts:310-330` — `totalUnread` same N+1 shape; called from
  `app/api/app/nav-counts/route.ts:35`, which `components/AppShell.tsx:1568`
  fires on **every client-side navigation**.
- `app/platform/chat/ChatClient.tsx:58,237` — `POLL_MS = 4000`. Each poll:
  `getActor` + `resolveChannel` (read + write) + 100 messages w/ reactions +
  roster + `markChannelSeen` (write) + `listChannels` (N+1). 10–40 queries incl.
  2+ writes per 4 s per tab.

### 1.2 Per-request overhead (HIGH)

One cold dashboard load ≈ **40 DB round-trips**:

| Stage | Work |
|---|---|
| `middleware.ts:250` | `getToken()` JWT decrypt |
| `app/platform/layout.tsx:27,41-76` | `getServerSession()` + company/user/user.count (3 queries) |
| `app/platform/layout.tsx:85` | `await headers()` — forces whole subtree dynamic |
| `lib/permissions.ts:92 → :49` | `getServerSession()` **again** + `user.findUnique` **again** |
| `app/platform/dashboard/page.tsx:122` | 19 queries in one `Promise.all` |
| client mount | `GET /api/app/nav-counts` → 7 + N queries incl. 1 write |
| client mount | `GET /api/app/location` → 2 queries |

- **No `cache()`, `unstable_cache`, or `revalidate` anywhere in the repo.**
  `loadActor` + `getServerSession` run twice per page and are never deduped.
- All 66 `app/platform` pages are dynamic anyway (layout reads cookies +
  headers), so there is no route cache to lose — only per-request dedupe to gain.

### 1.3 Connection pool (MEDIUM)

- `lib/db.ts:7-14` — `new PrismaClient()` with no `connection_limit`. Prisma
  default = `num_cpus * 2 + 1`, `pool_timeout` 10 s. This is the app-side
  ceiling; Postgres allows 500.
- `lib/db.ts:13` — `transactionOptions: { maxWait: 10000, timeout: 20000 }` —
  one stuck interactive transaction pins a pooled connection for 20 s.

### 1.4 Unbounded queries (HIGH → MEDIUM)

204 of 291 `findMany` calls have no `take`. List pages are paginated; the risk
is dashboards, "new record" forms, and the schedule.

- HIGH `app/platform/insights/page.tsx:147` — `payment.findMany` with
  `range=all` and nested `invoice → job, contact, lineItems`, then 3 JS passes
  (`:170,:181,:190`). Biggest OOM candidate.
- HIGH `app/platform/insights/page.tsx:231` — every open invoice + payments +
  contact, never range-filtered.
- HIGH `app/platform/dashboard/page.tsx:150,183` — all AWAITING_PAYMENT /
  PAST_DUE invoices w/ payments; all completed unbilled subscription jobs.
- HIGH contact dropdowns load **every contact** (several w/ `addresses`):
  `quotes/new/page.tsx:16`, `quotes/[id]/edit/page.tsx:20`,
  `invoices/new/page.tsx:16`, `contracts/new/page.tsx:17`,
  `subscriptions/new/page.tsx:17`, `appointments/new/page.tsx:21`,
  `app/api/app/contacts/route.ts:15`. `lib/contact-search.ts` exists and is
  not used by these.
- MEDIUM `app/platform/schedule/page.tsx:233,245,287` — month view on a busy
  tenant = thousands of rows with joins.
- MEDIUM `app/platform/leads/page.tsx:34` — whole kanban, unbounded.
- MEDIUM `app/platform/timesheets/page.tsx:39` — `endedAt: null` leg pulls
  every never-closed time entry ever.
- MEDIUM `business/page.tsx:27`, `payments/page.tsx:157`,
  `subscriptions/page.tsx:12,37`, `settings/team/page.tsx:13`,
  `settings/products/page.tsx:15`.

### 1.5 Other N+1 (HIGH → LOW)

- HIGH `app/platform/payments/page.tsx:173,185` —
  `Promise.allSettled(disputes.map(listDisputeEvidence))` and
  `settlements.map(listSettlementFundingTransfers)` — N+1 over **external
  HTTP** during SSR.
- MEDIUM `app/api/app/contacts/import/route.ts:120-210` — 3–5 awaited Prisma
  calls per row, no chunking.
- MEDIUM `lib/subscriptions.ts:957-1022` — per-visit `findFirst`×2 + `create`
  inside an interactive `$transaction` (`:918-1022`).
- MEDIUM `lib/auto-charge.ts:287-330`, `lib/reminders.ts:88-222,314,479,610` —
  serial loops over up to 1000 rows each with claim + write + email/SMS.
- LOW `lib/signup.ts:36` — slug-collision `while` loop.

### 1.6 Polling inventory

| Component | Interval | Endpoint | Cost |
|---|---|---|---|
| `chat/ChatClient.tsx:237` | 4 s | `/api/app/chat` | 10–40 q, 2 writes — HIGH |
| `components/AppShell.tsx:1565` | every nav | `/api/app/nav-counts` | 7+N q, 1 write — HIGH |
| `messages/thread/[contactId]/TeamThread.tsx:77` | 15 s | `/api/app/messages/[contactId]` | 3 q incl. unconditional `updateMany` (`route.ts:58`) — MEDIUM |
| `hub/[token]/messages/HubMessagesThread.tsx:264` | 20 s | `/api/hub/messages` | same shape (`route.ts:55`), **no visibilityState guard** — MEDIUM |
| `components/TeamLocationReporter.tsx:68` | 180 s | `POST /api/app/location` | 2 q + 1 insert per field user; pruned nightly only — MEDIUM |
| `team-map/TeamMapClient.tsx:130` | 60 s | `/api/app/team-map` | 1 q — LOW |
| `settings/addon/AddonClient.tsx:61` | 2.5 s, 90 s max | `/api/app/addon` | LOW |
| `settings/SettingsClient.tsx:343` | 20 s while PROVISIONING | Finix status | LOW |
| `components/OfflineSupport.tsx:94` | 30 s | outbox flush (no-op when empty) | LOW |

### 1.7 CPU-heavy / untimed in-request work

- HIGH `app/platform/payments/page.tsx:100-104` — SSR awaits 3 live Finix
  calls; `listDisputes` (`lib/finix.ts:442`) is application-wide and loops up
  to 10 sequential paginated requests (`:445`). Then `:127-135` runs a `for`
  loop of `$transaction` deletes **during page render**.
- HIGH `lib/finix.ts:87` — `finixFetch` has **no AbortSignal/timeout**.
- MEDIUM `lib/email.ts:412` (Resend), `lib/sms.ts:51` (Telnyx) — no timeout;
  37 call sites await them inside request handlers. Only `lib/ai.ts:100` and
  `lib/captcha.ts:73` set `AbortSignal.timeout`.
- HIGH `lib/assistant/index.ts:308` — up to `MAX_TOOL_ROUNDS = 12` (`:54`)
  Gemini rounds × 60–100 s each × `MAX_CALLS_PER_ROUND = 24`. One request can
  run >10 min. Rate limits cap turns/day, not concurrency.
- HIGH `bcryptjs` cost 12 (`lib/auth-options.ts:69`,
  `app/api/app/register/route.ts:107`, `app/api/app/team/route.ts:102`,
  `lib/account.ts:98`, `app/api/public/apply/route.ts:139`) — pure-JS, blocks
  the event loop ~0.5 s+ per hash. Login bursts serialize.
- MEDIUM `@react-pdf/renderer` `renderToBuffer` (`lib/pdf.tsx:294,424,670`)
  called synchronously from `app/api/app/invoices/[id]/pdf/route.ts:15`,
  `quotes/[id]/pdf/route.ts:15`, `contacts/[id]/statement-pdf/route.ts:24`,
  and the **public** `app/pay/[token]/pdf/route.ts:13`,
  `app/quote/[token]/pdf/route.ts:13`. Hundreds of ms blocking CPU, no queue.
- MEDIUM `app/platform/invoices/page.tsx:70` — past-due `invoice.updateMany`
  on every render of the list (write + row locks on a GET).
- LOW `lib/pipeline.ts:104` — `ensureStages()` unconditional `updateMany` on
  every leads-page load.

### 1.8 Transactions

Clean: all 62 `$transaction` sites checked; none call fetch/email/SMS/Finix/AI
inside the closure. Residual: `lib/subscriptions.ts:918-1022` loop-in-txn
(above); `lib/pipeline.ts:73-88` 6 sequential creates (first-visit only).

### 1.9 Missing indexes (`prisma/schema.prisma`)

Token fields are all `@unique` (good). Missing:

- HIGH `Invoice` — add `@@index([companyId, status, dueDate])`. Filtered on
  every navigation by `nav-counts/route.ts:26-31` and
  `invoices/page.tsx:70`.
- HIGH `Payment` — add `@@index([companyId, paidAt])`. Range-scanned by
  `dashboard/page.tsx:162`, `payments/page.tsx:157`, `business/page.tsx:33`,
  `insights/page.tsx:147`.
- MEDIUM `Payment.processorRef` (`payments/page.tsx:80`,
  `lib/reconcile.ts:242,252`).
- MEDIUM `Job` — `dashboard/page.tsx:183` filters `companyId + completedAt +
  invoice null + consolidatedInvoiceId null`; no index on `completedAt`.
- MEDIUM `TimeEntry` — timesheets `OR` (`startedAt` range | `endedAt: null`)
  doesn't use `[companyId, endedAt]` cleanly.
- LOW `QuickBooksConnection` (no indexes; `lib/quickbooks.ts:1494`),
  `AccessApplication` (status only), `GeocodeCache` (none).

### 1.10 Single-process in-memory state

- HIGH `lib/rate-limit.ts:14` — `buckets` Map. Also used for app-level limits:
  `app/api/app/assistant/route.ts:87-90` (AI spend caps) and
  `app/api/app/chat/route.ts:60`. Doubles on a second replica.
- MEDIUM `lib/chat.ts:273-274` — `globalThis.__chatTyping`; swept lazily only
  on read (`:283`), so never-read channels leak.
- MEDIUM `lib/routing.ts:37` — `matrixCache` (Mapbox budget per replica).
- OK: cron claims are DB `updateMany` claims (`lib/reminders.ts:348,507,613`,
  `lib/auto-charge.ts:296`, `lib/subscriptions.ts:937`) — never revert.

### 1.11 Cron + reconcile (HIGH)

- `app/api/cron/recurring/route.ts:47-90` — 15 cross-tenant sweeps strictly
  sequential in one HTTP request; no overlap guard on the route.
- Per-sweep caps exist (`runDueSubscriptions` 500 `lib/subscriptions.ts:1122`;
  consolidations 500 `:808`; visits 500 `:910`; reminders 1000 each
  `lib/reminders.ts:83,198,309,474,605`; auto-charge 200 `:284,:408`) but each
  item is serial w/ txn + email/SMS/Finix ⇒ worst case ~5,000 × 0.3–3 s.
- `lib/reconcile.ts:143` — `invoice.findMany({ status: { not: "ARCHIVED" } })`
  w/ payments + line items **across all tenants, no `take`**; also `:119` all
  companies, `:294` all refunds, `:319` all subscriptions. Once/day self-gate.
  Most likely OOM at ~100+ tenants.
- `lib/usage.ts:145` — sequential `upsert` per company.
- `lib/quickbooks.ts:1301-1410` — five unbounded per-company `findMany`s per
  connected tenant.

### 1.12 Boot / runtime config

- HIGH `package.json:8` `start` = `prisma db push && rename-superadmin-email &&
  backfill-doc-numbers && backfill-saved-cards && next start`, and
  `nixpacks.toml:5` wraps it as `db:push && db:seed && start`. **Every boot
  runs `db push` twice + seed + 3 backfills** before accepting traffic. Slow
  restarts; blocks ever running >1 replica (N containers racing `db push`).
- HIGH no `--max-old-space-size` — unbounded queries hit OOM-kill, not backpressure.
- LOW Sentry `tracesSampleRate: 0` — no APM overhead, but blind on latency.

---

## Part 2 — Security findings

### 2.1 Clean (verified, no action)

- **Tenant isolation:** all 62 dynamic `app/api/app/**/[…]/route.ts` handlers
  scope by `companyId`; guard-then-write idiom throughout; child records scoped
  through parent relation (`contacts/[id]/notes/[noteId]`, `addresses`,
  `people`, `jobs/[id]/notes/[noteId]`). `lib/permissions.ts:167-213` scope
  helpers compose with `companyId`. Media routes scoped
  (`app/api/job-photos/[photoId]/route.ts:24-27`, `avatars/[userId]:43-46`).
- **Tokens:** `randomBytes(24)` hex = 192 bits everywhere; reset tokens
  `randomBytes(32)` SHA-256 hashed (`forgot-password/route.ts:37-45`). No
  `Math.random()` in security paths. Every follow-up query off a token is
  re-scoped to the owner.
- **Auth freshness:** `lib/permissions.ts:49-79` `loadActor` re-reads role /
  companyId / isActive / suspendedAt from DB **every request**; JWT claims are
  never trusted for authz. Same for console (`lib/superadmin.ts:23-27`).
- **Role checks:** server-side `isManager()`, `canManageRole()` escalation
  guard (`team/[id]/route.ts:27,40-44`), company delete = OWNER + name retype
  + password + rate limit (`company/delete/route.ts:19-52`).
- **Raw SQL:** 5 sites, all tagged templates; zero `*Unsafe`.
  `lib/contact-search.ts:18` escapes `\ % _`.
- **Mass assignment:** none; no `"use server"` actions exist at all.
- **Webhooks:** Finix re-fetches by id with server creds
  (`webhooks/finix/route.ts:30-63`); Livery HMAC + ±300 s window +
  `timingSafeEqual` (`lib/addon.ts:67-81`); Telnyx Ed25519, fails closed
  (`webhooks/telnyx/route.ts:30-65`).
- **Uploads:** 4 MB photos + 100/job, 2 MB avatar/logo, MIME allowlists, SVG
  blocked (`settings/logo/route.ts:8-9`), server-generated keys, private bucket,
  600 s presigned reads minted after authz (`lib/blob-storage.ts:54-115`).
- **Secrets:** no server env in any `"use client"` file; only
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; nothing logged; no `.env*` ever committed;
  Sentry maps deleted post-upload.
- **XSS / redirects:** 2 `dangerouslySetInnerHTML` sites, both static;
  `callbackUrl` always literal; `app/platform/open/page.tsx:29-30` guards
  `?to=` with `startsWith("/app/")`.
- **Superadmin:** password → emailed 6-digit OTP (`crypto.randomInt`, SHA-256,
  10 min, 5 attempts, `timingSafeEqual`, `lib/superadmin-otp.ts:10-50`) →
  HMAC cookie, httpOnly/lax/secure, 12 h TTL, domain-separated key
  (`lib/superadmin-session.ts:19-65`), DB `role === "SUPERADMIN"` re-check
  every request (`lib/superadmin.ts:27`), double-gated at
  `middleware.ts:222-232`.
- **Error leakage:** only typed domain errors reach clients
  (`FinixError`, `EmailDomainError`); no Prisma errors or stacks.
- **Atlas AI:** four layered buckets (`assistant/route.ts:88-91`) + hard token
  meter (`lib/assistant-billing.ts:238`).

### 2.2 Findings

- **CRITICAL** `next-auth@4.24.14` (advisory range `<=4.24.14`; fix available).
  GHSA-xmf8-cvqr-rfgj: `getToken()` throws an uncaught exception on a malformed
  `Bearer` authorization header. `middleware.ts:250` calls it on **every
  `/app/*` request** ⇒ unauthenticated one-header DoS of the whole app. The
  other two advisories (homoglyph email normalizer, OAuth state binding) don't
  apply (Credentials provider only). Same audit: `sharp <0.35.0` (HIGH, via
  next), `brace-expansion`, `browserslist`, `esbuild`, `postcss-selector-parser`
  (HIGH, DoS-class), `uuid <11.1.1` (MODERATE, via next-auth).
- **HIGH** `next.config.ts:27-31` — `X-Frame-Options: SAMEORIGIN` only on
  `/app/:path*`. `/pay` (live card form), `/hub`, `/quote`, `/contract`,
  `/invoice`, `/book`, `/portal`, and **`/superadmin`** are iframe-able by any
  origin. `/embed` must stay `frame-ancestors *`.
- **HIGH** `lib/rate-limit.ts:14` — process-local Map. Every limit (login
  5/15 min, register, superadmin OTP, pay, magic-link, AI caps) is per
  container; a second replica halves brute-force protection. Interface is
  already shaped for a Redis/Upstash swap.
- **MEDIUM** no rate limit on authenticated spend/send endpoints:
  `contacts/[id]/message` (SMS), `invoices/[id]/send`, `quotes/[id]/send`,
  `contacts/[id]/portal-invite`. `lib/usage.ts:100` meters SMS but nothing
  enforces a cap. One compromised login = unbounded Telnyx/Resend spend +
  client mailbombing.
- **MEDIUM** `lib/auth-options.ts:80` — `session: { strategy: "jwt" }` with no
  `maxAge` ⇒ 30-day default, no revocation.
- **MEDIUM** password reset does not invalidate existing sessions —
  `app/api/public/reset-password/route.ts:39-45` sets the hash and burns the
  token; no `tokenVersion` / `passwordChangedAt` claim checked in the `jwt`
  callback. An attacker holding a cookie survives the victim's recovery.
- **MEDIUM** `lib/user-email.ts:28` `emailWhere` uses `mode: "insensitive"`
  (⇒ `ILIKE`) without escaping `%`/`_`; no email-format check. Feeds
  `forgot-password/route.ts:26`, `superadmin/login-code/route.ts:31`,
  `superadmin/session/route.ts:37`, `team/route.ts:57`,
  `lib/account.ts:55,72,146`. Submitting `%` matches the oldest row
  cross-tenant (all `orderBy createdAt asc`). Not an auth bypass (bcrypt
  compares against the matched row's own hash; `ensureAccountForUser` re-derives
  from `user.email`), but: unsolicited reset emails to arbitrary users,
  **denial-of-recovery** (`forgot-password/route.ts:33-35` deletes the matched
  user's live tokens), false "email in use" on invites.
- **MEDIUM** no Content-Security-Policy on the app (only `/embed`'s
  `frame-ancestors *`). No `script-src` defense-in-depth.
- **MEDIUM** CSRF = SameSite=Lax alone (NextAuth defaults; no `cookies` block
  in `lib/auth-options.ts`). No CSRF token, no `Origin`/`Sec-Fetch-Site` check
  on `/api/app/**`. Defensible, but single control; breaks silently if anyone
  sets `sameSite: "none"` for the mobile shell.
- **LOW** three GET handlers mutate state (read-receipt / view stamps):
  `app/api/app/messages/[contactId]/route.ts`, `app/api/hub/messages/route.ts:55-58`,
  `app/api/public/open/[token]/route.ts`. Cosmetic impact only.
- **LOW** `app/api/cron/recurring/route.ts:43` — `auth !== \`Bearer ${secret}\``
  non-timing-safe compare. (POST-only, 503 when unset — good.)
- **LOW** Telnyx webhook: timestamp is signed but freshness never checked —
  a captured signed `STOP` is replayable forever (impact: `smsOptOut` flip).
- **LOW** HSTS lacks `preload` (`next.config.ts:24`).
- **LOW** bcrypt cost 12 is fine security-wise (it's a load finding, §1.7).
- **CHECK** `lib/captcha.ts:52-53` fails open when `TURNSTILE_SECRET_KEY` is
  unset — confirm it is set in Railway production vars.

---

## Fix batches

Ordered by value per hour. Each batch is independently shippable. Run
`tsc`, the unit tests, and the e2e suite (`npm run e2e`, 34/34 vs prod) after
each. Remember: Railway boot runs `prisma db push`, so index additions ship
automatically; **never** ship a column drop or a new `@unique` without the
manual `--accept-data-loss` dance (see memory).

### Batch A — before anything else (small, low risk, biggest payoff)

1. **Upgrade next-auth** past 4.24.14 (`npm audit fix`; confirm `getToken`
   behavior in `middleware.ts:250` still works; run e2e login paths). Also
   clears sharp / uuid / the build-tool highs.
2. **Frame headers everywhere.** In `next.config.ts` move the
   `X-Frame-Options: SAMEORIGIN` rule to `/:path*` (or add
   `Content-Security-Policy: frame-ancestors 'self'`) and keep the explicit
   `/embed/:path*` override *after* it so `frame-ancestors *` wins there. Verify
   `/pay/[token]`, `/hub/[token]`, `/superadmin` get the header and `/embed`
   does not.
3. **Delete the chat backfill from the hot path.** `lib/chat.ts:67-70` —
   gate the `teamMessage.updateMany` behind a one-time check (e.g. a
   `Company.chatBackfilledAt` column or a `count` of rows with null channel
   first) or move it to a `scripts/` backfill that runs once.
4. **Dedupe the actor loader.** Wrap `loadActor` (`lib/permissions.ts:49`) and
   the layout's session lookup in React `cache()` so layout + page share one
   `getServerSession` + one `user.findUnique` per request.
5. **Add the two hot indexes** in `prisma/schema.prisma`:
   `Payment @@index([companyId, paidAt])`,
   `Invoice @@index([companyId, status, dueDate])`.

### Batch B — connection + timeout hygiene

6. **Set the pool explicitly.** Append `?connection_limit=20&pool_timeout=20`
   to `DATABASE_URL` in Railway (or set via `datasources` in `lib/db.ts`).
   Consider dropping `transactionOptions.timeout` to 15 s.
7. **Set `NODE_OPTIONS=--max-old-space-size=<~75% of container RAM>`** in
   Railway so memory pressure fails loudly and predictably.
8. **Timeouts on every external fetch:** `AbortSignal.timeout(15_000)` in
   `lib/finix.ts:87`, `lib/email.ts:412`, `lib/sms.ts:51` (match the pattern in
   `lib/ai.ts:100` / `lib/captcha.ts:73`).
9. **Move Finix work off the Payments page render.**
   `app/platform/payments/page.tsx:100-135` → client-side fetch or a
   background sweep; and the `$transaction` delete loop (`:127-135`) into the
   reconcile cron, not a GET.
10. **Stop writing on GET:** `app/platform/invoices/page.tsx:70` past-due flip
    → cron; `app/api/app/messages/[contactId]/route.ts:58` and
    `app/api/hub/messages/route.ts:55` → only `updateMany` when there is
    something unread; `lib/pipeline.ts:104` → run once.

### Batch C — chat + polling

11. Collapse `listChannels` (`lib/chat.ts:238`) and `totalUnread` (`:328`)
    N+1 into one `groupBy` for unread counts + one windowed query for last
    messages.
12. Raise `ChatClient.tsx:58` `POLL_MS` from 4 s to 10–15 s (or SSE), and add
    the `document.visibilityState` guard that `TeamThread.tsx:60` already has
    to `HubMessagesThread.tsx:264` and `ChatClient.tsx:237`.
13. Make `nav-counts` cheaper: it fires on every navigation
    (`components/AppShell.tsx:1565`) — throttle client-side (≥10 s between
    calls) and drop the write it does via `totalUnread → ensureEveryoneChannel`.
14. `globalThis.__chatTyping` (`lib/chat.ts:273-283`) — sweep on write too, or
    cap size.

### Batch D — bound the unbounded

15. `insights/page.tsx:147,231` — cap `range=all` to e.g. 24 months and
    aggregate in SQL (`groupBy` / `_sum`) instead of hydrating rows.
16. `dashboard/page.tsx:150,183` — `take` + aggregate counts/sums.
17. Contact dropdowns (§1.4 list) → typeahead against `lib/contact-search.ts`
    with `take: 20`, and `app/api/app/contacts/route.ts:15` gets `take`.
18. `leads/page.tsx:34`, `timesheets/page.tsx:39`, `schedule/page.tsx`
    month view, `business/payments/subscriptions/team/products` pages — add
    `take`/pagination or aggregate.
19. `contacts/import/route.ts:120-210` — chunk rows (e.g. 50) and use
    `createMany` / batched lookups.

### Batch E — cron + reconcile

20. Split `app/api/cron/recurring` into per-sweep endpoints (or a `?sweep=`
    param) with a `?cursor=` and `hasMore` response so the Railway cron (or a
    self-chained call) drains it in bounded slices; add a DB-backed overlap
    guard on the route.
21. `lib/reconcile.ts:119,143,294,319` — iterate per company with `take`
    windows; never load all invoices at once.
22. `lib/usage.ts:145` — batch the per-company upserts; `lib/quickbooks.ts:1301-1410`
    — window the per-tenant pulls.

### Batch F — auth hardening

23. `lib/auth-options.ts:80` — set `session.maxAge` (e.g. 7 d) and
    `jwt.maxAge`; consider `updateAge`.
24. Session invalidation on password change: add `User.passwordChangedAt`
    (or `tokenVersion`), stamp it in `setPasswordForUser` (`lib/account.ts:98`)
    and in `reset-password/route.ts:39-45`, and reject JWTs issued before it in
    the `jwt`/`session` callback (or in `loadActor`, which already hits the DB).
25. `lib/user-email.ts:28` — escape `%`/`_` in `normalizeEmail` (or reject
    them) and add a basic email-format check.
26. Rate-limit authenticated send/spend routes (`contacts/[id]/message`,
    `invoices/[id]/send`, `quotes/[id]/send`, `contacts/[id]/portal-invite`)
    using the `assistant/route.ts:88-91` pattern, and enforce a per-company
    daily SMS segment cap in `lib/usage.ts:100`.
27. `app/api/cron/recurring/route.ts:43` — `timingSafeEqual`.
28. Telnyx webhook — reject `timestamp` older than 5 min.
29. HSTS `preload`; add a starter CSP (`default-src 'self'`, allow Finix /
    Turnstile / Mapbox / Sentry origins) in report-only first.

### Batch G — boot + scale-out readiness (do before ever adding a replica)

30. Remove `prisma db push` / `db:seed` / backfills from `package.json:8` and
    `nixpacks.toml:5`; run migrations as a Railway pre-deploy command or a
    one-off job. (Note: `db:seed` on every boot is also a data-integrity
    smell — confirm it's idempotent or drop it.)
31. Swap `lib/rate-limit.ts` store to Redis/Upstash behind the same `limit()`
    signature (also covers `assistant/route.ts:87-90` AI caps and
    `chat/route.ts:60`). Until then, **treat scaling to 2 containers as a
    security change** and don't.
32. `lib/routing.ts:37` matrixCache → Redis or accept per-replica budgets.
33. bcrypt: move to native `bcrypt` or `argon2`, or drop cost to 10–11 —
    keeps hashing off the event loop.
34. PDF routes (`lib/pdf.tsx:294,424,670` callers) — consider a worker
    thread or a small queue; at minimum a per-IP limit on the public
    `app/pay/[token]/pdf` and `app/quote/[token]/pdf` routes.

---

## Verification recipes

- Pool/DB stats against prod (from memory recipe): write a `.mts` inside
  `scripts/`, `new PrismaClient({ datasources: { db: { url:
  process.env.DATABASE_PUBLIC_URL } } })`, run with
  `NODE_OPTIONS=--use-system-ca npx -y @railway/cli run --service Postgres npx tsx scripts/<file>.mts`.
  Useful queries: `SHOW max_connections`, `SELECT state, count(*) FROM
  pg_stat_activity GROUP BY state`, `pg_stat_user_tables` for seq scans.
- Replica / healthcheck config: Railway GraphQL
  `service(id){ serviceInstances{ edges{ node{ numReplicas healthcheckPath }}}}`
  with the `accessToken` from `~/.railway/config.json`.
- Frame headers: `curl -sI https://workbenchfsm.com/pay/x | grep -i frame` and
  the same for `/superadmin/login` and `/embed/x`.
- next-auth crash repro (after upgrade, should be a clean 401/redirect):
  `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer %%%" https://workbenchfsm.com/app/dashboard`.
