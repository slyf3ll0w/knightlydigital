# Paid jobs reported back to Google Ads (2026-11-18)

Item 4 of `ahead-of-the-curve-2026-11-17.md` ("Sell jobs, not software"),
second slice, and limit 1 of `lead-sources-2026-11-17.md`. David: "continue
item 4."

Before this, Google Ads only ever learned that a visitor filled in a form.
Its bidding chased form fills. WorkBench already saved the ad's click id on
the lead (`Contact.leadArrival.gclid`); now the money that lead pays is
reported back against that click.

## How it works

1. An owner or admin opens **Insights → Lead sources → Report paid jobs to
   Google Ads** and presses **Turn on**. That mints a private file address
   (`Company.adsFeedToken`).
2. The file (`GET /api/public/ads-conversions/<token>/conversions.csv`) is
   built fresh on every fetch: one row per payment, from the last 90 days,
   by a client whose arrival carries a Google click id. Columns: Google
   Click ID, Conversion Name (always `WorkBench paid job`), Conversion Time
   (UTC, `yyyy-MM-dd HH:mm:ss+0000`), Conversion Value, Conversion Currency.
   No names, emails, phones or addresses.
3. In Google Ads the owner creates an offline conversion action with that
   name and points an HTTPS data source at the address (user name and
   password `workbench` / `workbench`: Google requires both, the address is
   the real key, they are not checked). Google fetches on its schedule.
4. Nothing remembers what was sent. Google ignores a row it has already
   counted (same click, name and time), so the file is always "everything
   Google will still accept".

Rules (pure): `lib/ads-conversions.ts`. Reads: `lib/ads-conversions-server.ts`.
App route: `/api/app/ads-conversions` (GET status, POST on / new address,
DELETE off; owners and admins). Page: `app/platform/insights/lead-sources/google-ads`.
`Company.adsFeedFetchedAt` is stamped on every fetch and shown on the page,
so the owner can see Google is reading it.

AI tools: `get_ads_conversion_feed` (read; `CONNECTOR_READ`; never returns
the address) and `set_ads_conversion_feed` (on / new_address / off; stages a
card; `CONNECTOR_PREPARE`). Managers only.

## What is left out of the file, and why

- A client with no Google click id (every other source).
- A click older than 90 days: Google refuses it. Counted on the page.
- A click that only carried `gbraid` / `wbraid` (some iPhone traffic): the
  file route takes `gclid` only. Counted on the page.
- A payment whose amount is 0 or less (a returned bank transfer, a full
  refund), dated before the click, or dated in the future.

## Why a fetched file and not Google's API

Checked 2026-11-18:

- Since 2026-06-15 the Google Ads API refuses offline conversion uploads
  from developer tokens that were not already using them; new builds go to
  the Data Manager API, which needs an approved developer token and a
  Connect Google Ads sign-in.
  https://developers.google.com/ads/blog/posts/2026/05/changes-to-offline-click-conversion
- Google Ads Data Manager fetches a file from an HTTPS address: the address
  must end in `.csv` or `.tsv`, a user name and a password are required,
  headers must be in the first row and start with a letter.
  https://support.google.com/google-ads-data-manager/answer/14605515
- The older page (Conversions → Uploads → Schedules) takes the same file.
  Google calls it legacy; no end date is published.
  https://support.google.com/google-ads/answer/7014069

So the file needs no approval from Google and works for every company
today. The Connect Google Ads button stays the later step (it also brings
ad spend, limit 3 of the lead-sources plan).

## Not verified

**No real Google Ads account has fetched this file yet.** The format follows
Google's published pages, but these are unproven until Steadfast's account
is connected: that Google accepts `workbench` / `workbench` against an
address that does not challenge for a password, that the `+0000` time
format is accepted by the HTTPS data source, and the exact names of the
steps in Google's screens (the four steps on the page are from the help
pages, not from clicking through). Google's HTTPS page also lists 27 IP
ranges "to allowlist"; WorkBench does not block by IP, so nothing to do.

First real test: Steadfast. Turn it on, set up the data source in the
Steadfast Google Ads account, run it once by hand, and read Google's
result. Auto-tagging must be on in the Google Ads account (it is what puts
`gclid` on the ad's link).

## Limits today, to build later

1. **Refunds are not sent back.** A payment refunded after Google counted it
   stays counted at its first amount (the file shows the reduced amount, but
   Google keeps the first one it saw). Needs conversion adjustments.
2. **`gbraid` / `wbraid` clicks are not reported.** Needs the Data Manager
   API, or the file format's own columns for them once confirmed.
3. **One conversion name for everything.** No separate action for "quote
   approved" or "job booked", which would give Google a signal weeks earlier
   than the payment.
4. **Every payment is a row.** A client who pays a deposit and a balance is
   two conversions. Right for value-based bidding; an account bidding on
   conversion counts should set the action to count one per click.
5. **US dollars only** (`USD` is written on every row).
6. **Microsoft Ads** (`msclkid`) has the same offline import and is not built.
7. **Enhanced conversions for leads** (Google's recommended upgrade: a
   hashed email or phone next to the click id, which also matches leads
   whose click id was lost) is not built. It needs consent wording on the
   forms first.
8. **No e2e test.** The rules are unit-tested (`scripts/test-ads-conversions.ts`,
   21 checks, most of them traps); the page and the file were checked by
   hand in a local browser.

## Test recipe

Unit: `npx tsx scripts/test-ads-conversions.ts`.

1. Open a page of the business's site with `?gclid=TestClick_1234567890` on
   the address and send the quote form. The lead's source reads Google Ads.
2. Invoice that lead and record a payment.
3. Insights → Lead sources → Report paid jobs to Google Ads: Ad leads 1,
   Payments 1, Collected = the payment. Turn on, copy the file address, open
   it in a private window: a header row and one row with the click id, the
   amount and `WorkBench paid job`.
4. The page now reads "file last fetched" with the time.
5. Make a new address: the old one answers Not found.
6. Atlas: "is Google being told about my paid jobs?" answers from the same
   numbers.
