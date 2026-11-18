# Staying ahead of the curve (2026-11-17)

David: "what can we do to Workbench to ensure it stays ahead of the curve?"

The thesis: Workbench stays ahead by being the tool where AI does the office
work and can prove it gets it right, not by matching Jobber and Housecall Pro
feature for feature. Seven items, in the order agreed to go through them.

This list is from what was known of the product and the market up to mid-2026.
A competitor research pass was done on 2026-11-18: see "Competitor check"
at the end.

## 1. The estimator scorecard becomes the pattern for every AI worker — IN PROGRESS

The answer key and runner (`estimator-standard-2026-11-14.md`) are live. The
next step, per-company corrections, is built: see
`estimator-corrections-2026-11-17.md`.

## 2. Back-office workers that draft, with a person sending

The first worker, Follow-ups (stale quotes and unpaid invoices), was built and
then archived on 2026-11-17 at David's request: he was not sure about it going
live. Everything is on branch `follow-ups-archive` (tag
`follow-ups-archive-2026-11-17`), including its plan doc
`docs/plans/ai-workers-follow-ups-2026-11-17.md` and both scorecards. Nothing of
it is in the app.

Keeps David's rule (2026-11-14): AI does not talk to customers, people do.

Candidates, each with its own answer key and the same launch bar as the
estimator before it ships:

- Chasing stale quotes and unpaid invoices (drafts the follow-up, the owner sends).
- Review requests after a paid job.
- Expense categorizing.
- Next-day schedule and route tidy-up.
- Also named on 2026-11-14: bookkeeper, dispatcher, drafter, profit watchdog,
  cleanup, morning brief.

## 3. Let other AIs operate Workbench

Atlas has 116 tools (counted 2026-11-17). Exposing them through a connector (an MCP
server) lets an owner run their business from Claude or ChatGPT. Almost no one
in field service had this as of mid-2026, and most of the work is already done.

Open questions: sign-in and per-person permissions for an outside AI, which
tools are safe to expose first (read-only, then drafts, then sends), and how
the token meter counts outside use.

## 4. Sell jobs, not software

Site, Google Ads conversion tracking, form, estimate and booking in one
pipeline. Steadfast already runs all of it. Packaged as "we get you leads and
show you which ad paid for which job," it is a different product from what
competitors sell.

Needs: the real-submit test of the Steadfast conversion (still owed), then a
report that ties an ad click to a paid invoice.

**2026-11-17, first slice built** (David: no ad service for now; make it easy
to see where leads come from): website forms file each lead by how the
visitor arrived, one pick list of sources, and a Lead sources report with
leads, won, win rate and money collected per source. See
`lead-sources-2026-11-17.md`. Released 2026-11-17 with its Help guide and the
site's first announcement. What it cannot do yet is a numbered build-later
list in that plan ("Limits today, to build later"): first paid jobs reported
back to Google Ads, then tracking numbers for calls, then ad spend per source.

**2026-11-18, second slice built**: paid jobs reported back to Google Ads
through a private file Google fetches (`ads-conversions-2026-11-18.md`).
Not yet tested against a real Google Ads account; Steadfast is the first.
Next in order: tracking numbers for calls, then ad spend per source.

## 5. Speed where crews feel it

- The measured floor is still Railway's distance from the edge: the US-East
  move is the biggest single win (David owns it, with the Cloudflare bypass test).
- After that, offline support for techs with a bad signal.

## 6. Pay down the owed list

Each of these can turn into an incident that costs more than a feature earns:

- Key rotations: CRON_SECRET and the third-party keys; the test Anthropic key
  pasted on 2026-11-14; a workspace-scoped ANTHROPIC_API_KEY.
- Toll-free verification resubmit.
- Android keystore backup.
- Untested paths: photo fill-in on estimate tools (no job photos yet),
  QuickBooks reopen-after-void and AST tax, the Steadfast real-submit test.
- The flaky e2e test `schedule-tools.spec.ts` "lunch slotted by Optimize".

## 7. The gaps a growing crew hits

Custom roles (not started; the `isManager` leak risk has to be settled first)
and Tasks phase 2. These are the ones that make a 5–8 tech company look
elsewhere.

## Two things to check

- **The name "Atlas".** CONFIRMED 2026-11-18: ServiceTitan's AI assistant is
  named Atlas (announced September 2025, an owner's mobile app added October
  2026), and it filed two ATLAS trademark applications on 2025-09-19; a
  trademark listing site shows the software one allowed on 2026-11-10 (not
  checked on the USPTO's own record). Same name, same job, same trade, from
  the largest vendor. David's decision: rename, or get a trademark lawyer's
  read first. Do not market the name harder until then.
- **The no-AI-to-customers rule.** Competitors are pushing AI receptionists
  hard. The position to hold: "nothing goes out without you seeing it."

## Competitor check (2026-11-18)

A web research pass; vendor pages unless marked. Prices and plans change:
re-check before quoting any of this on the site.

- **AI that talks to customers is everyone's headline.** Jobber AI
  Receptionist (calls and texts, books visits; $29 a month add-on, included
  in Plus), Housecall Pro CSR AI (calls and web chat), ServiceTitan AI
  Virtual Agents, Workiz Genius Answering, FieldPulse Operator AI. Holding
  "a person sends everything" is a real difference on calls and texts.
- **Draft-then-approve is no longer ours alone.** Jobber Teammate (beta,
  2026-09-23) is an agent with a daily digest that drafts quotes and
  campaigns "ready for review and approval".
- **Connectors.** Jobber shipped an official ChatGPT plugin and Claude
  connector on 2026-09-25: 20 tools, 14 read and 6 write, and the writes
  cover clients, properties and requests only. Quotes, jobs, invoices and
  the schedule are read-only there. No official connector found at
  ServiceTitan, Housecall Pro, Workiz or FieldPulse. Ours prepares quotes,
  jobs, invoices and scheduling, each waiting for a person's OK.
- **Paid jobs reported back to Google Ads.** Only ServiceTitan does it
  (Marketing Pro Ads Optimizer, a paid extra on top of Marketing Pro).
  Housecall Pro shows return per lead source but the spend is typed in and
  nothing goes back to Google. Jobber has a lead source report with UTM
  capture and no upload. Nobody offers it at the 1–8 tech price.
- **New channel.** Jobber and Housecall Pro both announced booking through
  Google's AI Mode on 2026-11-04 (Jobber live for eligible US paid
  accounts; Housecall Pro "coming soon"). Worth a look after item 4.
- **AI estimate building** as its own shipped feature: not found at any of
  them beyond Teammate's quote drafts.

Sources: servicetitan.com/features/atlas, servicetitan.com/blog/pantheon-2025-vahe-keynote-atlas,
getjobber.com/features/ai-receptionist, getjobber.com/pricing,
housecallpro.com/features/ai-team, workiz.com/ai-genius-answering,
claude.com/connectors/jobber, help.servicetitan.com/how-to/how-revenue-import-works-in-ads-optimizer,
help.housecallpro.com/en/articles/14890593-marketing-dashboard-roi-table.
