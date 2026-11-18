# Lead sources: where leads come from (2026-11-17)

Item 4 of `ahead-of-the-curve-2026-11-17.md` ("Sell jobs, not software"),
first slice. David: no ad service for now; "make it so a user can easily
track where their leads are coming from", for Steadfast and for WorkBench.

Before this, a lead knew which door it came through (the form, the phone,
the chat) and nothing about what sent the person to that door. A Steadfast
form lead read "Online booking" whether it came from a Google ad, a search
or Facebook. The one typed "Lead source" box let "Google", "google" and
"Google Ads" become three sources.

## What was built

1. **Website forms file the lead by how the visitor arrived.**
   `public/embed.js` (on the business's own site) reads the first page of
   the visit: ad click ids (`gclid`, `gbraid`, `wbraid`, `msclkid`,
   `fbclid`), UTM tags, the site that linked there, and that first page. It
   keeps them in the site's own storage for 90 days (a later visit replaces
   them only when it carries tags of its own) and posts them to each form
   frame (`workbench:arrival`). On our hosted pages (`/book/<slug>…`)
   `lib/arrival-client.ts` reads the page's own address and referrer once
   per tab. The three public forms (request, scheduled booking, estimate)
   send it as `arrival`; the server names the source
   (`lib/lead-source.ts sourceFromArrival`) and keeps the detail on
   `Contact.leadArrival`. No arrival signal = the door's old name ("Online
   booking", "Website estimate"). An owner's `?src=` link tag on an estimate
   tool still wins. Existing clients are never re-labelled.
2. **One pick list** (`components/LeadSourceField.tsx`,
   `GET /api/app/lead-sources`) in place of the typed box on the client
   form, the Leads board's new-lead form, New Job and the job edit form:
   the standard names, then whatever the company has already used, then
   "Something else…". Every write path canonicalizes
   (`canonicalLeadSource`: contacts POST / PATCH, jobs POST / PATCH, CSV
   import, the lead webhook), and both reports group spellings together, so
   old data needs no backfill.
3. **Ask when it can't be known.** Saving a caller as a lead or client on
   the call screen shows "How did they hear about you?" as one-tap chips
   (`LeadSourceChips`). Left alone it stays "Phone call".
4. **The Lead sources report** (`/app/insights/lead-sources`, linked from
   the Insights "By lead source" card; managers). It follows the leads of
   the period: leads, quoted, won, win rate and money collected from them so
   far, per source. A row opens the leads behind it. Read:
   `lib/lead-source-report.ts`. The client page shows the facts behind a
   source under it (campaign, search term, came from, first page).

AI tool: `lead_source_report` (read; managers; filed `CONNECTOR_READ`).
The pick list itself needs no tool: `create_client` / `update_client`
already take a lead source and go through the same canonicalizing routes.

## Limits today, to build later

David, 2026-11-17: "note our limits for further building later." Each is a
known gap in what shipped, in the order worth building.

1. **Paid jobs are not reported back to Google Ads** (offline conversions).
   Google never learns which clicks became money, so its bidding chases
   form fills. The click id saved on `Contact.leadArrival` is what this
   needs. Two routes: a scheduled file Google fetches (small, no approval;
   right for Steadfast alone), or a Connect Google Ads button (needs
   Google's API approval; right once it is offered to everyone). Google only
   accepts a conversion within about 90 days of the click. Check Google's
   current upload docs first; the route has been changing.
2. **Calls from an ad are not labelled on their own.** A call carries no ad
   click, so it reads "Phone call" until someone taps how the caller heard.
   Needs a tracking number per source on the business line, shown on the
   site in place of the main number for visitors who arrived from that
   source.
3. **No ad spend, so no cost per lead or return on ad spend.** The report
   has leads, wins and money collected per source, but not what the source
   cost. Needs the spend typed in per source per month, or read from the ad
   account (which arrives with the Connect Google Ads button in 1).
4. **A Google Business Profile click reads as "Google search"** unless the
   profile's website link ends in `?utm_source=gbp`. Today that is a tip in
   the Help guide. Could be a line in Settings that hands the owner the
   tagged link to paste.
5. **Pages without a form never run `embed.js`.** A visit that starts on
   one is recorded from the first page that has a form, and loses the ad
   click if the visitor got there by an internal link. On WorkBench-built
   sites the fix is one tag in the kit's layout (the workbench-sites repo)
   so every page records the arrival; on other sites, a one-line snippet to
   offer in Booking & forms.
6. **Only the first source is kept.** An existing client who comes back
   through a new ad keeps their original source; the repeat work is not
   credited to the ad. Would need the arrival saved per request, not per
   client.
7. **Existing leads keep their old labels.** Leads filed before this as
   "Online booking" or "Website estimate" cannot be re-sorted; nothing was
   recorded about how they arrived.
8. **The site chat and the lead webhook are not arrival-aware.** A webhook
   lead carries whatever `source` the sender put on it; a site-chat lead
   reads "Website chat".
9. **Managers only.** The report sits with Insights. A salesperson cannot
   see how their own leads break down by source.
10. **The marketing pitch** ("we show you which ad paid for which job") is
    not on the WorkBench site yet, and the done-for-you ad service is
    parked (David: "maybe … in the future but we can't get into that now").

## Source names

Automatic: Google Ads, Google search, Google Business Profile, Facebook,
Facebook Ads, Instagram, Instagram Ads, Microsoft Ads, Bing search, Yahoo
search, DuckDuckGo search, Nextdoor, Yelp, Email, Another website, Website
(direct), plus the door names. An unknown `utm_source` keeps its own name
("home_advisor" → "Home Advisor"). `fbclid` alone says "Facebook", never
"Facebook Ads": Meta adds it to unpaid clicks too.

## Test recipes

Unit: `npx tsx scripts/test-lead-source.ts`. e2e: `lead-sources.spec.ts`.

1. **Ad click.** Open a page of the Steadfast site with
   `?gclid=test123&utm_campaign=recipe` on the address, send the quote form.
   The new lead's source reads **Google Ads**, and the client page shows
   "Campaign: recipe" and "Ad click: Google click ID saved" under it.
2. **It survives a click around.** Open the site with
   `?utm_source=facebook&utm_medium=paid`, go to another page, send the form
   there. Source: **Facebook Ads**.
3. **Search.** Search Google for the business, click through, send the
   form. Source: **Google search**.
4. **Direct.** In a private window type the site's address, send the form.
   Source: **Website (direct)**.
5. **Pick list.** Clients → New client: Lead source is a list. Pick
   "Something else…", type "Home show", save. Open New client again: "Home
   show" is in the list.
6. **Caller.** Calls → a call from an unknown number → Save as a lead: tap
   "Referral", save. The lead's source is Referral. Save another without
   tapping: Phone call.
7. **Report.** Business → Insights → "Lead sources →" on the By lead source
   card. The leads from 1–6 are counted under their sources; tap a source to
   see them; make one a client and its row's Won goes up by one.
8. **Atlas.** Ask "where are my leads coming from this month?" It answers
   from the same numbers.
