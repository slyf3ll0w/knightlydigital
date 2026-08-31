# E2E money-path suite

Playwright suite that drives the **deployed** Workbench app (default: production,
where Finix runs in sandbox mode — fake money) through the paths that lose money
or trust if they break: invoice math, payments, quotes, recurring billing,
autopay, card charges, and tenant isolation.

The suite runs against two dedicated tenant companies (`e2e-harness`,
`e2e-tenant-b`) that exist only for testing. Auth is a minted NextAuth session
cookie (Turnstile blocks scripted logins by design). Contacts created during a
run are force-deleted afterwards; nothing emails a real person (test contacts
have no email address).

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

Card-charge specs run only when the deployment's processor is `finix`,
`FINIX_ENVIRONMENT=sandbox`, and the harness company holds an APPROVED sandbox
merchant — with `FINIX_ENVIRONMENT=live` they are skipped automatically. **If
Workbench ever flips to live Finix keys, re-point `E2E_BASE_URL` at a staging
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
- `card-charge` — real sandbox charges through `/pay`: success + 3% surcharge +
  save-card, amount-triggered decline ($x.02), autopay charge-at-signup,
  autopay decline → retry schedule.
