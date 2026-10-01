# WorkBench operations runbook

What keeps production (`workbenchfsm.com`, Railway project **Workbench**,
environment **production**) healthy, where to look when it is not, and the
things that only exist in Railway/GitHub settings rather than in this repo.
Companion to the deploy flow in `CLAUDE.md` → Deployment. Started 2026-09-30
(Phase 0 of `docs/plans/production-readiness-2026-09-30.md`).

## The moving parts

| Piece | Where | Notes |
|---|---|---|
| App | Railway service `Streamflaire` | One container. `railway.json` runs `npm run db:predeploy` before each deploy. Healthcheck `/api/health`. |
| Database | Railway service `Postgres` (18.x) | Volume `postgres-volume`. **Backups: Railway native, Daily 07:52 UTC · Weekly Sat 07:23 · Monthly 1st 13:07** (schedules created 2026-09-03). Restore = Railway dashboard → Postgres → Backups → Restore. There is no off-Railway copy. |
| Hourly cron | Railway service `Streamflaire Recurring Billing` | Cron `0 * * * *`; its start command POSTs `$NEXTAUTH_URL/api/cron/recurring` with `Bearer $CRON_SECRET`. **Its `NEXTAUTH_URL` and `CRON_SECRET` must equal the app's** — they are separate variables on a separate service and do not follow the app's. Prefer a reference: `${{Streamflaire.NEXTAUTH_URL}}`. |
| Errors | Sentry (DSN `NEXT_PUBLIC_SENTRY_DSN` on both Railway envs) | Server, client, route handlers. Caught errors reach it through `reportError()` (below). |
| Uptime | GitHub Actions `Uptime` (`.github/workflows/uptime.yml`) | Every 15 min: `/api/health` and `/api/health?cron=1`. A red run emails the committer of that file. |
| Release gate | GitHub Actions `CI` + `E2E (staging)` | See CLAUDE.md → Deployment. |

## Health endpoints

- `GET /api/health` → `{ ok, commit }`; 503 `database unreachable` if Postgres
  is down. Railway's deploy healthcheck uses this.
- `GET /api/health?cron=1` → also 503 when the nightly reconcile (last step of
  the hourly cron) has not run in 30 h. **This is the only signal that the cron
  is alive**; the cron service itself cannot report its own absence.

## When something is wrong

**`/api/health?cron=1` is 503 ("cron has not run…").**
1. `railway logs -s "Streamflaire Recurring Billing" -e production --since 24h`.
   HTML in the output = the POST is hitting a wrong host (2026-09-16 → 09-30 it
   was `https://streamflaire.com`, which 404s). `Starting Container` lines
   with nothing after them = the fetch is failing before it answers.
2. Compare `railway variables -s "Streamflaire Recurring Billing" -e production --kv | grep -E 'NEXTAUTH_URL|CRON_SECRET'`
   with the same on `-s Streamflaire`. Fix on the cron service.
3. First tick after an outage catches up everything that was due: subscription
   cycles bill, autopay retries run, each overdue invoice gets ONE reminder (its
   most advanced unsent stage), visit series regenerate, automation sweeps fire
   for records that crossed their thresholds. Idempotent, but expect a burst of
   email and charges in that hour. To rehearse: `POST /api/cron/recurring` with
   the secret from a laptop and read the JSON summary (`results`, `failed`,
   `degraded`, `deferred`).

**`/api/health` is 503 or the site is down.** Railway → `Streamflaire` →
Deployments: is the latest deploy healthy? `railway logs -s Streamflaire -e production --since 1h`.
Postgres service up? Rollback = Railway → previous successful deployment →
Redeploy (code only; the schema is forward-only — see Deploy safety).

**Sentry issue spike.** Each `reportError` carries `tags.where` = the
`[module] what failed` label and `extra.argN` = the ids/objects that were
logged with it. The cron reports per-step row errors as
`[cron] <step>: N row errors` with the step summary attached.

**A tenant says email/texts stopped.** `lib/email.ts` / `lib/sms.ts` log and
report every provider failure; Resend and Telnyx dashboards show the other
half. Texting also needs the company's registration ACTIVE (Settings → Phone &
texting; superadmin company page → Line).

## Deploy safety (read before a schema change)

`db:predeploy` = `prisma db push --accept-data-loss` + seed + backfills, run
before the new container is healthy while the old one still serves.
Until migrations replace it (Phase 1 of the readiness plan):
- **Additive only.** Add columns/tables/indexes freely. Never rename or drop
  in the same release that stops using the thing — ship the code change, let
  it deploy, drop in a later release.
- A rename in `schema.prisma` is a DROP + ADD on production data with no
  confirmation. Use `@map` to keep the column and rename only the field.
- Rollback restores code, not data. Take a manual Railway backup
  (Postgres → Backups → Create) before any risky deploy.

## Conventions this runbook depends on

- **`reportError(...)` not `console.error(...)`** in server code
  (`lib/report-error.ts`): same arguments, also captured in Sentry. Put the
  static label first, ids after it as separate arguments.
- Cron sweeps must never fetch a fixed window of "oldest first" and then skip
  already-handled rows — once the window fills with handled rows nothing new is
  reached. Filter the handled rows out in the query (`reminders: { none }`) or
  order newest-eligible first and page (`freshSweepCandidates` in
  `lib/automations-server.ts`).
- Cloudflare replaces 502/504 bodies; API routes answer 424 for upstream
  failures.

## Access you need

Railway project (owner: David), Sentry org, GitHub repo
`slyf3ll0w/knightlydigital` (Actions + secrets), Finix, Telnyx, Resend,
Cloudflare (DNS + Turnstile), Google Cloud (OAuth clients), Apple + Google Play
consoles. Secrets live only in Railway variables and GitHub Actions secrets;
`scripts/set-ci-secrets.sh` copies the e2e set from Railway.
