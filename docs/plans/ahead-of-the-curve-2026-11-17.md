# Staying ahead of the curve (2026-11-17)

David: "what can we do to Workbench to ensure it stays ahead of the curve?"

The thesis: Workbench stays ahead by being the tool where AI does the office
work and can prove it gets it right, not by matching Jobber and Housecall Pro
feature for feature. Seven items, in the order agreed to go through them.

This list is from what was known of the product and the market up to mid-2026.
No competitor research pass was done for it; one is worth doing before
committing to items 3 and 4.

## 1. The estimator scorecard becomes the pattern for every AI worker — IN PROGRESS

The answer key and runner (`estimator-standard-2026-11-14.md`) are live. The
next step, per-company corrections, is built: see
`estimator-corrections-2026-11-17.md`.

## 2. Back-office workers that draft, with a person sending

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
`lead-sources-2026-11-17.md`. Still open from this item: reporting paid jobs
back to Google Ads, tracking numbers for calls, ad spend per source.

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

- **The name "Atlas".** ServiceTitan is believed to have named its AI assistant
  "Atlas" in 2025. Not verified. If true, reconsider the name before marketing
  it harder.
- **The no-AI-to-customers rule.** Competitors are pushing AI receptionists
  hard. The position to hold: "nothing goes out without you seeing it."
