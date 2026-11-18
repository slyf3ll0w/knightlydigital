# Connect Google Ads: the one-click route (2026-11-18)

Item 4 of `ahead-of-the-curve-2026-11-17.md`, third slice. David, after
setting up the fetched file by hand on Steadfast and testing a prompt in
Google's Advisor: "let's work on the one-click version, that is what we
need", and for the by-hand route: "include the manual instructions and add
a way for them to easily contact support as a failsafe."

## What a contractor does

1. Insights → Lead sources → Report paid jobs to Google Ads → **Connect
   Google Ads**.
2. Signs in with the Google account they use for Google Ads and ticks both
   boxes on Google's screen.
3. Done. If that sign-in reaches more than one Google Ads account, they
   pick one from a list first.

WorkBench then finds or creates the conversion action `WorkBench paid job`
in that account and sends payments by itself. No file address, no field
mapping, no sample row, nothing to schedule in Google Ads.

## How it works

- `lib/google-ads.ts` (server) and `lib/google-ads-shape.ts` (pure shapes,
  `scripts/test-google-ads-shape.ts`, 20 checks).
- OAuth like Google Calendar: signed state (company + user, 10 minutes),
  tokens AES-256-GCM keyed off `AUTH_SECRET`. Scopes: `adwords`,
  `datamanager`, `userinfo.email`. Routes
  `/api/app/integrations/google-ads/connect` and `/callback`.
- **Accounts**: Google Ads API v26 `customers:listAccessibleCustomers`, then
  for each reachable account a `customer_client` query for the non-manager
  accounts under it (so an owner who signs in through an agency's manager
  account still gets their own account; `loginCustomerId` remembers the way
  in). One account → picked for them. Several → the page lists them.
- **Conversion action**: looked up by name; an enabled `UPLOAD_CLICKS` one
  is used as is (so the one Advisor or a person made is adopted, never
  duplicated); one of the wrong kind or turned off stops with a plain
  message; none → created (Converted lead, many per click, value from each
  payment).
- **Sending**: the same rows the file holds (`loadAdsConversions`), through
  the Data Manager API (`POST datamanager.googleapis.com/v1/events:ingest`,
  2,000 events a request). Each event carries the payment's id as
  `transactionId`, which Google uses to drop a repeat, so nothing records
  what was sent. Cron step `googleAds` (hourly cron; a company is sent at
  most every 6 hours), plus **Send now** on the page and once right after
  connecting.
- One `GoogleAdsConnection` per company (`lastSyncAt`, `lastSyncCount`,
  `lastError`, `needsReconnect`). `/api/app/ads-connection`: GET status (+
  accounts to pick), POST `{ customerId }` or `{ action: "sync" }`, DELETE.
- The file route is untouched and still works beside it.

AI tools: `get_ads_conversion_feed` now also reports the connection;
`set_ads_conversion_feed` gained `disconnect`. Connecting has no tool: it
is a Google sign-in a person does in a browser.

## Why this needs no long approval (checked 2026-11-18)

- Developer tokens were retired on 2026-09-09. Google Ads API access now
  belongs to the Google Cloud project, in levels. **Explorer** (applied for
  on the API's Overview page, "automated review and approval in most
  cases") allows 2,880 operations a day on real accounts, and none of the
  services it blocks are ones this uses. A connect costs a handful of
  operations. https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- Sending conversions goes through the Data Manager API, which is not
  metered by those levels and needs only the `datamanager` scope.
  https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access
- Both scopes are "sensitive", so the OAuth consent screen has to pass
  Google's verification before strangers can use it without a warning
  screen. WorkBench has been through that once for Google Calendar. Until
  it passes, the app can run in **Testing** mode for up to 100 named Google
  accounts (in Testing mode Google expires the sign-in after 7 days).

## What David does at Google (in order)

1. **Google Cloud Console**, the project that already holds the Google
   Calendar sign-in: APIs & Services → Library → enable **Google Ads API**
   and **Data Manager API**.
2. Same project → Google Ads API → Overview → **Upgrade access level** →
   apply for **Explorer**.
3. APIs & Services → Credentials → the OAuth client used for Calendar (or a
   new Web client) → add the redirect address
   `https://workbenchfsm.com/api/app/integrations/google-ads/callback`
   and, for staging,
   `https://streamflaire-staging.up.railway.app/api/app/integrations/google-ads/callback`.
4. OAuth consent screen → Data access → add the scopes
   `https://www.googleapis.com/auth/adwords` and
   `https://www.googleapis.com/auth/datamanager`.
   **Caution:** adding scopes to the app that is already verified for
   Calendar puts the app back into review for the new scopes. If Google's
   console warns that Calendar users would be affected while it is
   reviewed, stop and create a second project just for Google Ads instead
   (steps 1–4 there, with its own client id).
5. Railway → set `GOOGLE_ADS_CLIENT_ID` and `GOOGLE_ADS_CLIENT_SECRET` on
   **staging** first. The Connect button appears as soon as both are set.
6. Test on staging with Steadfast's Google sign-in (add that Google account
   as a test user if the app or the new scopes are in Testing).
7. When it works: set the two variables on production, and submit the
   consent screen for verification (the scope justification text and the
   demo-video outline are in `Documents\google-ads-connect-google-steps.txt`).

## Not verified: this code has never talked to Google

Everything here is written from Google's published pages. The first real
connect has to confirm, in this order (each has a plain error on the page
if it fails, and `lastError` keeps Google's words):

1. Google accepts Ads API calls with only the sign-in's token (no
   `developer-token` header since the September change).
2. `listAccessibleCustomers` + the `customer_client` query return
   Steadfast's account.
3. The conversion action lookup finds the one Advisor made on 2026-11-18,
   and the create body is accepted on an account without one.
4. `events:ingest` accepts the body (`eventSource: "WEB"`, the timestamp
   with `Z`, `transactionId`), and a second send is deduplicated.
5. A conversion action created minutes earlier may refuse events for a few
   hours; the cron retry is the answer, confirm the message reads sensibly.

## Limits today, to build later

1. **gbraid / wbraid clicks** could be sent through this API (the file
   cannot carry them) and are not yet.
2. **Refunds** are not sent as adjustments.
3. **Ad spend** per source (limit 3 of the lead-sources plan) can now be
   read with the same sign-in (a reporting query); not built.
4. **No results read-back**: Google's per-request diagnostics are not
   fetched, so "accepted" is all WorkBench knows.
5. **One account per company.**
6. **No e2e test** (it would need a Google account).

## The by-hand route, as rebuilt the same day

- Part 1, the conversion action: a message for Google's Advisor
  (`ADS_ADVISOR_PROMPT` in `lib/ads-conversions.ts`, copy button on the
  page). Tested on Steadfast: Advisor created the action and could not
  connect the file. A three-step by-hand fallback sits behind "No Advisor
  in your account?".
- Part 2, the file: Google's Data manager screens in order (source,
  connect, select data, map fields, schedule). The screen names come from
  David's screenshot and from Advisor's own description of them; Advisor's
  description is AI output, so treat the names as likely, not certain.
- Failsafe: **Ask for help** files a FeedbackTicket titled "Help setting up
  Google Ads reporting" with where the setup stands (connection, file,
  last Google error, counts), and **Book a free setup call**.
