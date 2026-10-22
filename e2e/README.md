# E2E suite

Playwright suite that drives the **deployed** Workbench app (default: production,
where Finix runs in sandbox mode — fake money) through the paths that lose money
or trust if they break: invoice math, payments, quotes, recurring billing,
autopay, card charges, and tenant isolation — plus the daily-driver workflows
around them: jobs & scheduling, CRM plumbing, PDFs/exports, and the public
booking surface.

The suite runs against two dedicated tenant companies (`e2e-harness`,
`e2e-tenant-b`) that exist only for testing. Auth is a minted NextAuth session
cookie (Turnstile blocks scripted logins by design). Contacts created during a
run are force-deleted afterwards; nothing emails a real person (test contacts
have no email address).

## Where it runs

- **CI (the normal path):** `.github/workflows/e2e-staging.yml` runs this
  suite against the **staging** Railway environment on every push to the
  `staging` branch, after waiting for that commit to be live. Secrets come
  from GitHub Actions (`scripts/set-ci-secrets.sh` fills them from Railway).
- **Locally:** the setup below, against staging (`E2E_BASE_URL=https://streamflaire-staging.up.railway.app`)
  or production (which also runs sandbox Finix today).

## One-time setup

1. Create `e2e/.env.e2e` (gitignored) with values from the Railway dashboard
   (Project → service → Variables; `DATABASE_URL` = the **public** URL from the
   Postgres service). Anything already in the repo's `.env.local` (the FINIX_*
   sandbox creds, `PAYMENT_PROCESSOR`) is picked up automatically:

   ```
   E2E_BASE_URL=https://workbenchfsm.com
   AUTH_SECRET=...            # app service
   CRON_SECRET=...            # app service (optional — enables the cron smoke test)
   DATABASE_URL=...           # Postgres service → DATABASE_PUBLIC_URL
   ```

2. Provision the test companies (idempotent — safe to re-run):

   ```
   npm run e2e:provision
   ```

## Running

```
npm run e2e            # everything
npm run e2e -- smoke   # one spec file by name fragment
```

Card-charge specs are gated per processor on what the deployment reports at
`/api/health`:

- **Square** (`square-charge`): `PAYMENT_PROCESSOR=square`,
  `SQUARE_ENVIRONMENT=sandbox` and `SQUARE_E2E_ACCESS_TOKEN` — the access token
  of a sandbox test seller from the Square Developer Console (Sandbox test
  accounts → the "WorkBench E2E Seller" account → authorize the app). The
  provision step seeds company A's Square connection from it on every run
  (static token: never refreshed, never expires, sandbox-only by code).
- **Finix** (`card-charge`): `PAYMENT_PROCESSOR=finix`,
  `FINIX_ENVIRONMENT=sandbox` and an APPROVED sandbox merchant on company A.

With a live processor environment they are skipped automatically. **If the
target deployment ever runs real money, re-point `E2E_BASE_URL` at a staging
deploy that keeps sandbox keys before running this suite again.**

The HTML report lands in `e2e/report/`; failure traces in `e2e/artifacts/`.

## What's covered

- `smoke` — login page, signed-in dashboard, 404 on bogus pay tokens, cron auth.
- `invoice-money` — server-side totals (discount/tax), partial → full payment
  status flips, payment delete/edit recompute, zero/negative guards.
- `quote-lifecycle` — draft → public client approval (signature check) →
  convert; approved-quote status guard.
- `recurring` — monthly plan first-bill + payment anchoring, run-due
  idempotency, per-visit exactly-one-invoice, ready-to-bill queue.
- `tenancy` — company B can neither read, write, nor list company A's records.
- `square-charge` — real Square sandbox charges through `/pay`: success + 3%
  surcharge + card on file, card-number-triggered decline (4000…0002), autopay
  charge-at-signup from the saved card. (Autopay decline isn't covered on
  Square: its declines are card-triggered and a declining card can't be
  saved through the pay page.)
- `card-charge` — the Finix equivalent: success + 3% surcharge + save-card,
  amount-triggered decline ($x.02), autopay charge-at-signup, autopay
  decline → retry schedule.
- `jobs-scheduling` — schedule-window guards, close-out checklist gate
  (skip-needs-reason, completedAt/closedAt stamps), double-booking heads-ups on
  jobs and appointments, job delete.
- `contacts-crm` — contact edits, saved service addresses → job-site snapshot,
  notes, request → job conversion, ⌘K search.
- `documents-export` — invoice/quote/statement PDFs render as real PDFs; CSV
  exports (clients/invoices/jobs/timesheets) carry the run's rows.
- `public-booking` — self-scheduling slot engine offers times once configured;
  the Turnstile captcha gate rejects scripted public submissions (a red here
  means the deployment lost its captcha keys).

Deliberately not covered: real email/SMS delivery (test contacts have no
email), QuickBooks sync (needs a QBO sandbox), the mobile apps, and live-money
Finix.
