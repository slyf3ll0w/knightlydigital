# Telnyx balance watch — planned, build at launch

**Status: PLANNED (2026-09-22), not started. Build when the platform goes live
with paying tenants.** Decided by David the day the Telnyx account ran dry and
a texting registration plus the softphone both failed with "insufficient
funds" — see the sibling change that shipped the same day (queue + operator
alert, `lib/ops-alert.ts`, `QUEUED` registration status).

## Why

Every tenant's business line runs on Streamflaire's one Telnyx account. When
its prepaid balance hits zero, Telnyx refuses *every* mutation — buying a
number, filing a 10DLC brand ($4.50) or campaign ($15 + 3 × $1.50 up front),
placing a call, even creating the free SIP credential the softphone needs.
Tenants see a pause; the operator finds out only when someone complains.

Telnyx's own auto-recharge (Mission Control → Billing, threshold + recharge
amount, $10 minimum) is the first line of defence and must be on before
launch. This watch is the second: it notices the balance sliding *before*
Telnyx says no, and it notices when auto-recharge silently stops working
(expired card, failed charge).

## What to build

1. **`lib/telnyx.ts`: `getBalance()`** — `GET /v2/balance` → `{ balance,
   available_credit, credit_limit, currency }` (all strings in Telnyx's
   response; parse to numbers).
2. **Hourly cron step `telnyxBalance`** in `app/api/cron/recurring/route.ts`,
   next to `lineRegistrations`. Reads the balance, stores the reading on a
   `PlatformMetric`-style row (or the existing `RateLimit`/KV store if a model
   is overkill), and:
   - below `TELNYX_BALANCE_WARN` (default $25): email the operator via
     `alertOperator("telnyx-balance-low", …)` — deduped to once per 24 h.
   - below `TELNYX_BALANCE_CRITICAL` (default $10): dedupe 6 h, subject says
     "will start refusing".
   - back above warn after an alert: one "recovered" email.
3. **Superadmin banner** on `/platform/superadmin` when the last reading is
   below warn: amount, time read, link to Telnyx billing.
4. **Forecast line in the email**: last 7 days of spend from the readings
   (delta per day) → "at this rate, empty in N days". Cheap once readings are
   stored.
5. **Env**: `TELNYX_BALANCE_WARN`, `TELNYX_BALANCE_CRITICAL` (dollars,
   optional). Add to CLAUDE.md's env table.

## Not in scope

- Charging tenants for their own Telnyx usage — the paid plan already prices
  the line in (`business-line-2026-09-15.md`).
- Auto-recharging via API. Telnyx exposes auto-recharge preferences over the
  API, but the card is on the operator's account; keep that in the portal.

## Test plan

- Unit: threshold logic (warn / critical / recovered transitions, dedupe) as a
  plain `tsx` script under `scripts/` like the others.
- Live: set `TELNYX_BALANCE_WARN` above the real balance on staging, run the
  cron once (`/api/cron/recurring` with `CRON_SECRET`), expect one email and
  the banner; run again, expect no second email.
