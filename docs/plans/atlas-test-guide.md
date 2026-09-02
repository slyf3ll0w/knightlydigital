# Atlas test guide — v8 (95 tools) + the token meter

How to put the 2026-09-01/02 Atlas batch through its paces on a real account.
Everything here is safe to run against the demo company or a bypass-code test
company; the money-mover prompts at the bottom need a sandbox-approved merchant.

## 0. Setup (5 minutes)

1. Deploy order: `npx prisma db push --accept-data-loss` (drops the old
   `atlasTrialUsed` turn counter, adds `atlasTrialTokensUsed`; the Stage E
   columns + `AssistantTurn` table are additive) → then the code deploy.
2. Pick a NON-whitelisted test company (the whitelist bypasses every meter).
   Superadmin → company → Atlas assistant card should read **Paywalled — trial
   not started**. If the company is whitelisted, "Reset to default" first.
3. Open the app as that company's owner. The Atlas bubble shows the paywall.

## 1. The meter (trial, then plan)

| Step | Expect |
|---|---|
| Owner presses **Start my free trial** | meter above the composer: "10,000 of 10,000 free tokens left · Full plan coming soon" |
| Sign in as a TECH on the same company, open Atlas | paywall says "Ask your account owner or an admin to start the free trial" (before the owner starts it); after, the tech chats on the shared meter |
| Ask "What's on the schedule today?" | reply ends with a small coin line like "142 tokens"; meter drops by the same amount |
| Ask a bulk job (see §4) | one reply costs 1,000–2,000 tokens — the point of metering spend instead of messages |
| Superadmin → company page | Atlas card: "trial — N of 10,000 tokens used", 30-day ledger with turns / our cost / tokens metered / tool calls, avg $/turn |
| Superadmin **Reset trial** | company back to "trial not started" with a fresh 10,000; drawer shows the offer again after a refresh |
| Burn it down fast: set `ATLAS_TRIAL_TOKENS=300` on Railway, reset trial, chat twice | second or third reply flips the drawer to "Your free trial tokens are used up" + Coming Soon card; the input strip becomes the notice; a direct POST to /api/app/assistant returns 403 `atlasLocked` |
| Superadmin **Grant plan (test)** on the spent-trial company | drawer meter: "100,000 of 100,000 tokens left · refills <date>"; spent trial is ignored while a plan is on |
| **Refill period** / **Revoke plan** | refill zeroes the period; revoke returns the company to its trial state (still spent → locked) |
| Set `ATLAS_PLAN_TOKENS=200`, refill, chat twice | "This period's tokens are used up … refill on <date>" lock state; MoreSheet/bubble teaser says "Out of tokens for this period" |

Whitelisted accounts: no meter, no coin line, but every turn still lands in
the superadmin ledger (access = full, atlasTokens = 0, costCents real).

## 2. Power reads (query_records + report)

These are the two tools the prompt steers everything toward; they replace
chains of top-15 lists. Each should answer in one or two rounds.

- "How many jobs did we complete last month, and what did they bill in total?"
- "List every invoice over $500 that's more than 30 days past due, oldest first."
- "Break down August revenue by client — top 5."
- "Which tech logged the most hours this week?"
- "Compare quotes sent vs. approved for the last 3 months, month by month."
- "Which clients have an unpaid invoice AND a job scheduled this week?" (cross-entity — needs two lookups combined)
- "Show me leads that came in from the website form this month and where they are on the board."
- Paging: "List all my active clients" on a company with >200 contacts — reply should say it paged / how many total.

## 3. Client extras + messaging

- "Pull up everything on Sarah — addresses, other contacts, saved cards, and what she owes."
- "Add a second service address for Sarah: 44 Elm St, label 'Rental'."
- "Send Sarah a statement PDF link." (get_statement — link in reply, no card)
- "Email Sarah a friendly note that her invoice is due Friday." (email_client → card, says a real email goes out)
- "Reply in Sarah's portal thread: we'll be there Tuesday at 9." (reply_in_portal card)
- "Send Sarah a portal invite."

## 4. Bulk work (the batch-card path)

Seed 10–20 clients with messy phone numbers first, then:

- "Reformat every client phone number to (xxx) xxx-xxxx." → ONE batch card, "N changes — update client", **Confirm all**; reply states staged vs. skipped counts.
- "Archive every lead we haven't touched since June."
- "Raise the price of every active subscription by 3%." → per-record cards merge; money cards never merge.
- "Add the tag 'Fall 2026' to every client with a job scheduled in October."
- Interrupt test: ask for a 60-record change with `ATLAS_THINKING_BUDGET` at
  default — the last tool round carries an atlasNote; reply should say what's
  left and that "continue" picks it up. Say "continue" and confirm it finishes.

## 5. Field ops

Sign in as a TECH for these; techs only see the field/schedule tools.

- "What's my route today and how long is the driving?" (get_route_plan)
- "Reorder my day to cut drive time." (optimize_route card)
- "Find a 90-minute slot for Mike on Thursday afternoon near downtown." (find_a_time)
- "Clock me in on job 1042." / "Clock me out."
- "Show the checklist for job 1042 and tick 'Photos taken'."
- "Text the client I'm on my way to job 1042." → reply hands back the sms: link; card just logs it
- "Log a time block: Friday 12–1 lunch, every week."
- "Where's everyone right now?" (team_map — managers only; as a tech it should refuse)

## 6. Money movers (amber cards — sandbox merchant only)

- "Refund $25 of the last card payment from Sarah." → amber card, "moves real money", never merges
- "Charge Sarah's card on file for invoice 2031."
- "Send today's payout early."
- "Run recurring billing now."
- "Duplicate invoice 2031 for next month."
- "Log rent, $1,800, repeats monthly." → card says "Repeats on day N of every month"; then "Pause the rent expense."
- "Export all payments from August as CSV." (export_data → link in reply)
- "Is QuickBooks connected? Sync now." (quickbooks tool; expect honest "not connected" if not)

## 7. Deletes (red cards)

- "Delete the time entry Mike logged yesterday on job 1042."
- "Remove the 'Rental' address from Sarah." → card notes how many jobs/quotes lose the link
- "Delete client Test Wizard." → typed-name arming; nothing happens until the name matches
- "Delete Sarah's payment from Tuesday." (bookkeeping delete for hand-recorded payments)

## 8. Forms, agreements, settings

- "Build me a booking form for estimate requests with a question about pets." → manage_web_form create card; next turn "Give me the embed code" → exact tags + link, no page pointer
- "Write a residential cleaning service agreement with a 30-day cancellation clause." → full numbered agreement staged as a template
- "Rename yourself to Scout." → update_company_settings card; drawer name flips after confirm
- "Set our hours to 8–5 Monday to Friday, closed weekends."

## 9. Guardrails (should NOT work)

- As SALES with payments hidden: "Refund Sarah's payment" → no such tool; Atlas says it can't.
- As TECH: "Delete client Sarah" → declined.
- "Upload my logo" → the one legit page pointer (/app/settings).
- Off-topic: "Write me a poem about trucks" → one-sentence decline.
- Direct POST /api/app/assistant with `messages: []` → 400 before any AI spend (the zero-cost gate check).

## 10. Automated

- `npx tsx scripts/test-assistant.ts` — 9 pure tests (role gating, batch merge,
  plan periods + pricing, trial meter + access ladder). With
  `LIVE_GEMINI_KEY` + `DATABASE_URL` it also runs 4 live prompts against the
  demo company and prints replies + staged proposals.
- Superadmin ledger sanity after a session: turns × avg cost should be within
  a few cents of Gemini's console for the same window; `tokensCached` > 0 on
  most multi-round turns means implicit caching is hitting (see
  cost-controls.md).
