# Production-readiness audit — 2026-09-30

Question from David: "as it stands right now, what stops WorkBench from being a
production-ready app with the full reliability and capability of such?"
Add-on plan gating is known-incomplete and is out of scope here.

Method: six parallel read-only audits of the repo at `da1c42ff` (data safety +
deploy, security, ops/observability, tests + code health, product completeness,
performance), each claim cited to file:line, then spot-verified. Prior audits
this builds on: `scale-and-security-audit-2026-09-08.md`, `code-audit-2026-09-18.md`,
`ops-flow-review-2026-09-15.md`.

## Snapshot

| Item | Value |
|---|---|
| Code | ~174k lines TS, 262 API routes, 149 pages, 3,178-line schema |
| Age / churn | first commit 2026-05-29; 296 commits and ~116k lines added in the last 30 days |
| Tests | 28 unit scripts (CI on every push), 17 Playwright specs (staging only, post-deploy) |
| Runtime | 1 Railway container, Postgres, Cloudflare in front, hourly Railway cron |
| Sentry | wired on server/client/route errors; `NEXT_PUBLIC_SENTRY_DSN` set in prod |
| Rate limiting | in-memory (no `UPSTASH_*` on prod) |
| Lint / formatter / Dependabot | none |
| Root `error.tsx` boundaries | only `app/global-error.tsx` |

## Verdict

The application layer is genuinely careful: tenancy is derived from the DB user
row and every sampled id-based route re-checks `companyId`; charges hold a
per-invoice lease plus Finix idempotency ids; refunds reserve optimistically;
bookings use Serializable txs with retry; auth/reset/superadmin/SSRF/SQL are all
done right; Atlas writes are staged proposals only. No cross-tenant hole and no
security Critical was found.

What is not production-grade is the platform underneath it and the business
wrapper around it:

1. **Data can be lost with no recovery.** Every deploy runs
   `prisma db push --accept-data-loss` (`railway.json:4`, `package.json:10-11`)
   with no migration history and no verified backup/restore.
2. **Failures are invisible.** 1 of 255 API routes reports to Sentry; ~60
   `catch` blocks `console.error` and return 500. No uptime monitor watches
   `/api/health?cron=1`. Automations and outbound sends are not crash-durable.
3. **It cannot take money from a new customer.** Signup is invite-coded,
   payments onboarding is closed platform-wide, only Voice has a checkout.
4. **Three silent correctness bugs** that get worse with growth (below).

## Findings by severity

### Critical

- **C1 Schema deploy** — `db push --accept-data-loss` on every push to main;
  a rename or `@map` slip is DROP+ADD on live data with no confirmation; old
  container serves against the new schema during predeploy; redeploying the
  previous build restores code, not data. (`railway.json:4`, `package.json:9-11`,
  `scripts/db-push-prod.mjs:4`, `prisma/migrations/` has one hand-written file
  that `db push` never reads.)
- **C2 Backups** — nothing in repo or docs beyond a roadmap line "verify daily
  backups"; no dump script, no restore runbook, no restore ever tested.
- **C3 Sweeps stop reaching new rows** — `lib/reminders.ts:95-121` loads all
  overdue invoices `take: 1000`, no `orderBy`, no "already fully reminded"
  filter; `lib/automations-server.ts:332-403, 430-439` takes the oldest N
  candidates then drops already-run ones, so once the oldest N are done, new
  records never fire. Same shape in quote follow-ups, visit/appointment
  reminders, Google Calendar connection sweeps.
- **C4 Company delete fails for most real tenants** — `lib/company-delete.ts:23-55`
  lists 22 child tables; 41 models reference Company, 7 cascade; Automation*,
  Estimator*, BookingType, ClientMessage, PortalMessage, SavedCard, SmsSend,
  AssistantTurn, ActivityLog, QuickBooksSyncRecord are neither → FK error after
  60 s of work rolls back.

### High

- **H1 Route errors never reach Sentry** — `onRequestError` only sees uncaught
  errors; `lib/email.ts:439`, `lib/sms.ts:155`, `lib/automations-server.ts:232`
  log and drop.
- **H2 Automation runs not crash-durable** — fire is `void (async…)()`
  (`automations-server.ts:216`); `AutomationJob` flipped `waiting→done` before
  steps run (`:277`); no `attempts`/`lockedAt`; dedupe key guarantees a lost
  run is never retried. Sends have no retry (`lib/email.ts`, `lib/sms.ts`,
  `lib/push.ts`, `lib/apns.ts`).
- **H3 Finix webhook unauthenticated** — `app/api/public/webhooks/finix/route.ts:29-50`;
  re-fetch prevents forgery, but a replayed genuinely-FAILED transfer id makes
  `handleTransfer` remove a recorded payment; bounced ACH payments are hard-
  deleted (`:151-153`) instead of marked RETURNED.
- **H4 Login throttle is per-IP and in-memory** — `middleware.ts:11-17`; no
  per-email counter in `lib/auth-options.ts:167-213`; captcha `return true`
  when `TURNSTILE_SECRET_KEY` unset (`lib/captcha.ts:56`); memory buckets reset
  every deploy (`lib/rate-limit.ts:97-106`).
- **H5 Cron cannot finish under load** — 27 serial steps, 8-min budget checked
  only between steps, LLM + QBO + GCal inside; Cloudflare 524 at 100 s means the
  money-failure 500 never reaches the pinger; in-process overlap flag (`:66`).
- **H6 Missing indexes** — Job `(contactId)`, `(subscriptionId)`, `(status,
  scheduledAt)`; Invoice `(contactId)`, `(status, dueDate)`; Call `(companyId,
  updatedAt)` (polled every 4 s by `calls/pulse`); Appointment `(status,
  scheduledAt)`; Quote `(status, sentAt)`; ClientMessage `(contactId, createdAt)`;
  LocationPing `(timeEntryId)`; Automation JSON trigger filter.
- **H7 Polling load** — nav-counts 20 s (~10 queries), calls pulse 4 s +
  `router.refresh()`, thread 3 s, inbox 4 s, softphone presence 30 s *write*;
  no ETag/304, no SSE; `connection_limit=20` on one container.
- **H8 No revenue path** — invite-only register (`app/api/app/register/route.ts:87-91`,
  universal code in `lib/invites.ts:22`); `PAYMENTS_ONBOARDING_OPEN` unset →
  Online Payments "Coming soon" for every unapproved company; Pro/Max/seats/
  Atlas paid plan have no checkout (`lib/plans.ts:33-40`,
  `lib/assistant-billing.ts:37`); seat cap not enforced (`team/route.ts:41`);
  no Plan & billing page, receipts, cancel/downgrade.
- **H9 Money code untested** — `lib/auto-charge.ts`, `lib/subscriptions.ts`
  (bill/generate/run), `lib/reconcile.ts`, `lib/finix.ts` imported by no test;
  Finix e2e skips unless sandbox merchant APPROVED; role matrix
  (`lib/permissions.ts`) has no runtime test; e2e only runs after a deploy to
  staging.
- **H10 Bus factor 1** — no README, no runbook (0 hits for rollback/incident/
  on-call), `.env.local.example` lists 2 of 113 env vars, CLAUDE.md header
  stale (Tailwind v4 / Oxanium / green).

### Medium

- No `error.tsx` under `app/platform`, `app/hub`, `app/pay`; no ChunkLoadError
  handling; `public/sw.js:232-239` caches `/_next/static` cache-first → white
  screen on client-nav after a deploy.
- LLM calls inline in the Telnyx voice webhook (`lib/voice.ts:843→889`) and
  unstreamed 12×60 s Atlas turns vs Cloudflare 100 s.
- Unbounded pages: `invoices/new`, `quotes/new`, `contacts/[id]` (13 relation
  includes incl. `user: true` → passwordHash), `jobs/[id]` loads legacy bytea
  photo data, `api/app/jobs` GET returns every job; dashboard/insights sum in JS
  over full history.
- Retention: ActivityLog, AssistantTurn, AutomationRun/Job, SmsSend, Call/
  CallLeg, all message tables, GeocodeCache never pruned; photos written to
  Postgres bytea before R2.
- `hubToken`/`publicToken` are `cuid()` (~41 bits random) and are sole
  credentials for `/api/hub/*`; newer paths use `randomBytes(24)`.
- No signup email verification (squatting on someone's address). Captcha
  action not checked on superadmin login-code / apply / book / estimate.
- No CSP beyond `frame-ancestors`; `/pay` hosts a live card form.
- 10DLC/toll-free Telnyx webhooks unsigned (re-read only). Site-chat creates
  Contacts without captcha.
- No per-account soft-delete/grace period, no legal hold; delete is immediate.
- Finix `listDisputes()` for all tenants on every `/payments` render; PDFs
  rendered per request with `no-store`, public PDF routes.
- Predeploy runs 8 backfill scripts on every deploy; several swallow errors,
  others abort the deploy on a data quirk.
- Onboarding: CSV import is contacts-only; no jobs/invoices/price-book import,
  no demo data. No status page, changelog, or outage contact besides
  `contact@workbenchfsm.com`. No audit-log UI; invites require a manager-typed
  password; one notification tri-state. Terms lack subscription refund/
  auto-renew language; Privacy omits Telnyx and Mapbox.
- Single-replica assumptions: rate limiter, cron lock, GCal debounce map,
  5-min GCal poller in `instrumentation.ts`, typing/presence maps.

### Low

- `npm audit --omit=dev`: 2 High (build-time transitive), 0 Critical;
  next-auth v4 + jose v4 are maintenance-only.
- 3 client fetch sites ignore non-OK (`SavedCardManager.tsx:114`,
  `SettingsClient.tsx:1198`, `register/page.tsx:79-87`).
- `Payment.processorRef` not unique; money math in `Number` with epsilon.
- Giant files: `AppShell.tsx` 3,105 lines, `business-line.ts` 2,395, etc.
- No min-shell-version enforcement for the native apps.

## Path to production

**Phase 0 — stop the bleeding (1–2 days, before anything else)**
1. Turn on Railway Postgres backups, nightly `pg_dump` to R2 via GitHub Action,
   restore once into staging and write `docs/runbooks/restore.md`.
2. Add a free uptime check on `/api/health?cron=1` and `/` with alerting.
3. `reportError()` helper (Sentry + console) and a sweep of `app/api` +
   `lib/{email,sms,push,automations-server}.ts`.
4. Fix C3 sweep starvation with anti-join filters and cursors.

**Phase 1 — platform (1 week)**
5. Baseline `prisma migrate`, remove `--accept-data-loss`, `migrate deploy` in
   predeploy, CI `migrate diff --exit-code`; fold backfills + the partial index
   into migrations; written rule: additive-only, drop one release later.
6. Concurrent-index migration for H6.
7. `onDelete: Cascade` on every `companyId` relation + DMMF unit test; 30-day
   soft-delete with purge cron.
8. `AutomationJob` lease (`lockedAt`, `attempts`), stale-run requeue, fire via
   `after()`; outbox table for email/SMS/push with 3 attempts.
9. Cron: 202 + `after()`, advisory lock, per-step deadlines, LLM off the voice
   webhook.
10. Finix webhook auth + event dedupe; ACH bounce → `RETURNED` not delete.
11. Per-email login throttle; Upstash (or Postgres) rate-limit store; rotate
    `hubToken` to `randomBytes`.
12. Route `error.tsx` + ChunkLoadError reload; nav-counts 60 s + cache, pulse
    `findFirst` + index, presence heartbeat.

**Phase 2 — confidence (1 week)**
13. Unit tests for auto-charge/subscriptions/reconcile decision logic, role
    matrix, Atlas write-tool args, quote totals, doc numbers, Telnyx signature.
14. Playwright against `next start` + throwaway Postgres in `ci.yml` on every
    push (non-Finix specs).
15. `next lint`, Dependabot, complete `.env.example`, root README + runbook
    (deploy, rollback, vendor failure symptoms), fix CLAUDE.md header.

**Phase 3 — sellable (2–3 weeks, parallel with 1–2)**
16. Decide launch posture: open signup or publish the code; reopen Finix
    onboarding when Finix allows.
17. Livery products + webhooks for Pro/Max/seats/annual, seat-cap check,
    Settings → Plan & billing (status, receipts, cancel), Voice usage metering.
18. Jobs/invoices CSV import, demo-data toggle, invite-by-link, activity-log
    tab, per-event notification prefs, status page link, Terms/Privacy pass.

**Later (structural)**: SSE event channel replacing polls, retention/pruning
steps, SQL aggregates for dashboard/insights, R2-first uploads, CSP, Auth.js v5,
email verification at signup, split `AppShell.tsx`.

## Verified solid — do not redo

Tenancy scoping, charge/refund/booking concurrency, doc numbering, auth +
reset + superadmin + social-token verification, SSRF guard (reused by the
automations webhook action), parameterized SQL, escaped email HTML, private R2
with presigned GETs and company-scoped photo reads, Telnyx voice/messaging
webhook signatures, Livery HMAC webhook, cron secret timing-safe, Atlas
propose-then-confirm model, PCI SAQ-A posture (finix.js tokenization), CSV
export for 6 entities with role scoping, Sentry plumbing, DB-checked health +
cron dead-man switch, Prisma pool pinning, quiet hours + STOP/HELP handling.

## Status — 2026-09-30, same day (branch `phase0-reliability`)

Corrections after checking Railway directly:
- **Backups exist.** Railway native schedules on the production Postgres volume
  since 2026-09-03: Daily 07:52 UTC, Weekly Sat 07:23, Monthly 1st 13:07;
  backups present through 2026-09-30. No off-Railway copy and no restore drill
  yet. The R2 bucket holds only `companies/` (no dumps).
- **The hourly cron has been dead since 2026-09-16.** The production cron
  service `Streamflaire Recurring Billing` has `NEXTAUTH_URL=https://streamflaire.com`
  while the app has `https://workbenchfsm.com`; every tick POSTed to a 404.
  Evidence: `/api/health?cron=1` → 503 (last reconcile 2026-09-16 15:05 UTC),
  last PaymentReminder 2026-08-31, zero `/api/cron` hits in 48 h of HTTP logs,
  13 HTML 404 bodies in the cron service log. Not changed by Claude — the
  first good tick bills every cycle due since then (David decides when).

Phase 0 built (uncommitted → this branch):
1. ~~Backups~~ confirmed (above). Restore drill + runbook entry still owed.
2. Uptime: `.github/workflows/uptime.yml` probes `/api/health` and
   `/api/health?cron=1` every 15 min; a failed scheduled run emails the
   committer of the file.
3. `lib/report-error.ts` `reportError(...)` = console.error + Sentry; swapped
   in at 237 call sites across 94 files (all `app/api/**/route.ts` and `lib/**`,
   except the cron route, which already reports per step, and the three
   edge-imported files).
4. Sweep starvation: dunning and quote follow-ups now select only rows with a
   due-and-unsent stage (`OR` over stages with `reminders: { none }`), newest
   first; appointment/visit/tech reminders ordered soonest first; automation
   sweeps order newest-eligible first and page through already-fired rows
   (`freshSweepCandidates`, 5 pages max).
5. `docs/runbook.md` + pointer in CLAUDE.md.
