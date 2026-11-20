# Facebook ads in WorkBench (2026-11-20)

David: "could we make it to where Workbench can integrate with Facebook
ads?" He picked two pieces, **report results back to Facebook** and
**Facebook lead forms straight in**: "i want our clients to be able to do it
but i also want to use it for our own Meta ads that we'll use to advertise
Workbench", with "as little (none if possible) custom features for us as
possible". So it is an ordinary contractor feature, and the WorkBench company
uses it like any customer.

It is the Facebook twin of the Google Ads work
(`ads-conversions-2026-11-18.md`, `ads-connect-2026-11-18.md`) and item 4 of
`ahead-of-the-curve-2026-11-17.md`.

## The one thing that differs from Google

Facebook credits an ad for what happens **within 7 days of the click**, and
it refuses an event dated more than 7 days back. A paid job usually lands
later than that. So Facebook is told each **step** a lead reaches, not only
payments:

| Step | When | Facebook event |
| --- | --- | --- |
| New lead | the lead is made | `Lead` |
| Appointment booked | their first appointment is made | `Schedule` |
| Quote sent | their first quote is sent | `QuoteSent` |
| Job won | the lead is won | `JobWon` |
| Paid | each payment, with its amount | `Purchase` |

In Ads Manager the owner can then pick which step a campaign chases. The
early ones are what Facebook can actually learn from.

## What a contractor sees

Insights → Lead sources → **Facebook ads** (`/app/insights/lead-sources/facebook`).

1. **Get leads from Facebook forms** (only when the server has the Meta app
   set up). **Connect Facebook** → sign in → pick the Page. A lead from a
   Facebook or Instagram instant form lands on the Leads board in seconds as
   "Facebook Ads", with the push and email a website lead gets.
2. **Tell Facebook which leads became jobs.** Paste the dataset ID and an
   access token from Facebook's Events Manager, press Turn on. **Send a test
   event** takes the test code from Events Manager's Test events tab so they
   can watch it arrive. Status: last sent, how many, Facebook's own words if
   it refuses.
3. Foot of the page: **Ask for help** (a FeedbackTicket with where the setup
   stands) and **Book a free setup call**.

## How it works

### Results back (needs nothing from Meta on our side)

- `lib/meta-ads-shape.ts` (pure; `scripts/test-meta-ads-shape.ts`, 28
  checks) and `lib/meta-ads.ts` (server). Route `/api/app/meta-ads` (GET
  status; POST save / `{action:"test"}` / `{action:"sync"}`; DELETE off).
  Owners and admins.
- A lead Facebook can match is one of: a website lead whose
  `Contact.leadArrival` holds Facebook's click id (`fbclid`), or a lead from
  a Facebook form (`MetaLead.leadgenId`). Nothing else is sent.
- A website lead's step is a `website` event with `fbc`
  (`fb.1.<when the click was seen, ms>.<fbclid>`), the first page they
  landed on, and the browser that submitted the form (`Arrival.ua`, set by
  the server with `withUserAgent`; never read from what the browser posted).
  A form lead's step is Facebook's CRM shape (`action_source:
  "system_generated"`, `custom_data.event_source: "crm"`,
  `lead_event_source: "WorkBench"`, `user_data.lead_id`).
- **No name, email, phone or address is sent, hashed or not.** Ids only, the
  same rule as the Google file. Both privacy policies promise it.
- Every step sent is a `MetaEventSent` row, unique on contact + step +
  payment id. Facebook does not reliably drop a repeat from a server-only
  source, so unlike Google something has to remember.
- Sent 100 to a request. Facebook discards a whole request for one bad
  event, so a refused request is re-sent one event at a time; an event
  refused by itself is recorded with Facebook's reason and never retried. A
  refused **token** stops everything and shows "Needs you" (`capiNeedsToken`).
  A hiccup (5xx, 429, timeout) records nothing and the next hour retries.
- Cron step `metaAds`, every hourly run (no throttle: the 7-day clock is
  tight). The token is sealed with `lib/secret-box.ts` (scope `meta-capi`)
  and travels in the request body, never in an address.
- Upstream failures answer 424, never 502 (Cloudflare replaces a 502's body).

### Lead forms in (needs WorkBench's Meta app)

- `lib/meta-leads-shape.ts` (pure; `scripts/test-meta-leads-shape.ts`, 20
  checks) and `lib/meta-leads.ts`. Sign-in routes
  `/api/app/integrations/meta/connect` and `/callback` (the Google Ads
  pattern: signed 10-minute state, `?mode=url` for the phone app). Page API
  `/api/app/meta-leads` (GET status + Pages to pick, POST `{pageId}`,
  DELETE).
- Facebook Login for Business (`config_id`) → a long-lived user token →
  the Pages it can advertise for → the picked Page's token (sealed, scope
  `meta-page`; the user token is dropped once a Page is picked) →
  `POST /{page}/subscribed_apps?subscribed_fields=leadgen`. A Page can belong
  to one WorkBench company at a time.
- Webhook `/api/public/webhooks/meta`: GET answers Facebook's handshake;
  POST checks `X-Hub-Signature-256` against the raw body under
  `META_APP_SECRET` first (401 otherwise), records each named lead as a
  `MetaLead` (unique on Facebook's lead id, so a resend files nothing),
  answers 200, then reads the lead's answers from Facebook with the Page's
  own token and files it. The notice is only a hint: a forged one can file
  nothing.
- Filing goes through **`lib/lead-intake.ts` `createInboundLead`**, the code
  the lead webhook route used to hold inline (the route now calls it,
  behaviour unchanged): matched to an existing client by phone or email,
  Request made (`source: "facebook_form"`), onto the board, automations, push,
  email. A form on an ad is filed "Facebook Ads"; one filled in from the
  Page itself, "Facebook". The advertiser's own questions ride along as
  lines of the request.
- Cron step `metaLeads` (before `metaAds`) retries leads whose answers could
  not be read, up to 8 tries. When Facebook refuses because the Page's
  business has not given leads access, the page says so with the fix
  (Meta Business Suite → Settings → Integrations → Leads access).

### WorkBench's own ads, with no WorkBench-only feature

The WorkBench company connects its own Page and dataset on the same page as
anyone. Contact us and Book a setup call are already the ordinary embed, so
they carry the click id. The one gap was sign-ups: the marketing site kept
UTM tags but no click ids, and the sign-up's lead in the WorkBench account
never got an arrival. Now `lib/site-track.ts` also remembers ad click ids
(`getArrival`), the sign-up form posts them, and `ensureBillingContact`
files a NEW sign-up lead by `leadSourceFor(arrival, "WorkBench sign-up")`
and keeps the arrival, exactly as a website form does for any business. A
sign-up that arrived from Facebook is therefore source "Facebook" and its
steps are reported like any other lead's.

### AI tools

`get_facebook_ads` (read; `CONNECTOR_READ`) and `set_facebook_ads` (`off`,
`disconnect_page`; stages a card; `CONNECTOR_PREPARE`). Managers only.
Turning either half on has no tool: one needs a pasted secret, the other a
Facebook sign-in in a browser.

## What David does at Meta (only for lead forms)

Results back needs none of this.

1. developers.facebook.com → **Create app** → type **Business**, in
   WorkBench's business portfolio. Add the products **Facebook Login for
   Business** and **Webhooks**.
2. Facebook Login for Business → **Configurations** → create one (user
   access token) with these permissions: `leads_retrieval`,
   `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`,
   `pages_manage_ads`, `ads_management`, `business_management`. Copy its
   **Configuration ID**.
3. Facebook Login for Business → Settings → **Valid OAuth Redirect URIs**:
   `https://workbenchfsm.com/api/app/integrations/meta/callback` and
   `https://streamflaire-staging.up.railway.app/api/app/integrations/meta/callback`.
4. Railway **staging**: set `META_APP_ID`, `META_APP_SECRET` (App settings →
   Basic), `META_LOGIN_CONFIG_ID`, and `META_WEBHOOK_VERIFY_TOKEN` (any long
   string you make up). The Connect card appears once the first three are
   set.
5. Webhooks → object **Page** → **Subscribe to this object**: callback
   `https://streamflaire-staging.up.railway.app/api/public/webhooks/meta`,
   the verify token from step 4. Then subscribe the **leadgen** field. (One
   app has one callback address: point it at staging to test, then at
   `https://workbenchfsm.com/api/public/webhooks/meta` for production, or use
   a second app for staging.)
6. Test on staging: Connect Facebook as yourself with WorkBench's Page, then
   https://developers.facebook.com/tools/lead-ads-testing → pick the Page
   and a form → **Create lead**. It should be on the Leads board within
   seconds. "Track status" there shows Facebook's side.
7. **Business Verification** (Business settings → Security Center), then
   **App Review** for the permissions in step 2 with Advanced Access. The
   reviewers want a screen recording of the connect and of a lead arriving,
   and a test login. Meta says about a week. Until it passes, only people
   with a role on the app can connect.
8. When approved: set the four variables on production and move the webhook
   callback to production.

## Not verified: this code has never talked to Facebook

Everything here is written from Meta's published pages, read 2026-11-20.
The first real use has to confirm, in this order:

1. Events Manager's generated token is accepted in the request body, and a
   test event shows on the Test events tab (recipe 1).
2. A website event with `fbc` built from a saved `fbclid` is accepted, and
   one from an older lead with no browser string or page is too (Meta lists
   `client_user_agent` as required for website events; if it is refused, the
   refusal is recorded per event and the fix is to send those as
   `system_generated`).
3. `user_data.lead_id` is accepted as a string (a 17-digit id does not fit
   a JavaScript number).
4. The Login for Business address (`config_id`, `response_type=code`,
   `override_default_response_type=true`) returns a code, and the code
   exchange accepts form fields.
5. `/me/accounts` returns `tasks`, and the Page token it returns reads
   leads (`created_time,id,ad_id,form_id,field_data`).
6. **Meta's pages disagree** on whether a lead reaches an app still in
   Development mode. If a test lead does not arrive in step 6 above, lead
   forms cannot be proven end to end until App Review passes.
7. **Meta's pages disagree** on whether its "conversion leads" ad goal
   counts website leads or only form leads. Website steps are sent as
   ordinary website events, which a campaign can optimise for either way.
8. Whether an Events Manager token ever expires (Meta does not say). A dead
   one shows as "Needs you" with Facebook's words.

## Limits today, to build later

1. **No hashed email or phone matching.** It would match more website
   leads, but needs consent wording on the forms and a change to both
   privacy policies first.
2. **Ad spend and cost per job** are not read. Needs Meta's Full access tier
   (500+ Marketing API calls every 15 days to keep it).
3. **Refunds are not reported back.**
4. **One Page and one dataset per company.**
5. **No "Limited Data Use" flags** for the US states that have them.
6. **A step reached more than 7 days before turn-on is never sent.**
7. **"Contact made" is not a step** (WorkBench keeps no time for it).
8. **The dataset ID and token are pasted by hand.** After App Review the
   Connect sign-in could list datasets and mint the token itself.
9. **A lead's campaign and ad names are not stored**, only the ad id.
10. **The webhook's rate limit** is the shared `/api/public/webhooks/`
    bucket (300 an hour per sender). Fine now; revisit with many Pages.
11. **No e2e of a real Facebook lead or a real send** (it would need a
    Facebook account). The page, the API's input checks, the webhook's
    refusals and the shared intake are covered by `e2e/specs/facebook-ads.spec.ts`.

## Test recipes for David

1. **A test event.** Insights → Lead sources → Facebook ads → follow the
   three steps (Events Manager → your dataset → Settings: Dataset ID, then
   Generate access token) → Turn on. In Events Manager open **Test events**,
   copy the code, paste it into Test code, press **Send a test event**. A
   "Lead" appears on that tab within a minute. If the page shows "Facebook
   said: …" instead, send me that line.
2. **A real website lead.** On your phone, open the WorkBench site with
   `?fbclid=WorkBenchRecipeTest12345` on the end of the address, then fill
   in Contact us. In WorkBench's own account the lead is filed "Facebook".
   Back on the Facebook ads page, Waiting to send says 1; press **Send
   now**; Sent this week goes up by one and Events Manager → Overview shows
   a Lead (it can take up to 30 minutes there).
3. **A step.** Book an appointment for that lead, press Send now: a
   `Schedule` event follows. Pressing Send now again sends nothing.
4. **A sign-up.** Open `/apply?fbclid=WorkBenchRecipeTest67890` in a private
   window and sign up a throwaway company. In the WorkBench account its lead
   is filed "Facebook", not "WorkBench sign-up".
5. **A form lead** (after the Meta app exists): steps 6 above.
6. **Turn off.** Turn off → the three steps are back, and the row on Lead
   sources says Off.
