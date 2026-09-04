# AI in-app features — owner assistant + receptionist (2026-07-03)

Both ride the `lib/ai.ts` Gemini wrapper (env-gated on GEMINI_API_KEY; model
per feature via env). Shared rule: the AI never has powers the signed-in user
doesn't have, and it never writes anything on its own.

IMPORTANT prerequisite for real users: flip the Gemini key to the PAID tier
(billing on the same key, no code change). The free tier may train on inputs;
fine for demo data, not for real companies' client names/amounts. At current
volume the paid bill is well under $1/mo.

## 1. Owner assistant (BUILDING NOW — Stage A)

Chat drawer available on every /app page (header button). Per-role, per-company.

**Stage A — read + draft (this build):**
- Answers data questions through a server-side tool registry: search clients,
  client activity, schedule range, invoices/payments, requests/quotes/jobs,
  business summary, price book, company/booking settings.
- Every tool is gated by the same capability checks the pages use
  (canSell / canSeeMoney / canSeePricing / isManager) and scoped by the same
  Prisma scopes (contactScope / viaContactScope / jobScope / appointmentScope)
  — a Tech's assistant sees exactly what a Tech sees, nothing more.
- Drafting: quote descriptions, client messages, follow-up emails — as chat
  text the user copies. No sending, no saving.
- Also answers "how do I…" app questions from a short feature cheat-sheet in
  the system prompt.
- Bounded everything: tool results top-N with minimal fields, conversation
  trimmed to last ~20 messages, response token cap, per-company rate limits
  (burst + daily) via the existing limit() helper.
- Endpoint: POST /api/app/assistant (messages in, reply out; tool loop runs
  server-side, max 5 rounds). Model: AI_MODEL_ASSISTANT env override; pick
  default by live tool-calling reliability test (flash-lite vs flash).
- History is client-side (sessionStorage) — nothing persisted server-side.

**Stage B — actions with confirmation [SHIPPED 2026-07-03, commit c1dbbf4
alongside David's feedback round: floating bubble UI, linkified /app paths,
per-word client search + recent-roster fallback, list_agreements /
list_subscriptions / whats_needing_attention tools, model → gemini-2.5-flash]:**
- The AI proposes; the UI renders a confirmation card ("Create this quote?
  [preview] Confirm / Cancel"); Confirm submits through the SAME existing API
  routes the buttons use. The AI has no write path of its own.
- Shipped five: create client, update client, draft quote, schedule
  appointment, record payment. Grow by demand (candidates: send quote/invoice,
  convert quote to job, add client note, create job).

**Stage C — full coverage + identity [SHIPPED 2026-07-03, commit fa9e712]:**
- 40 tools total. v4 (7cd1042) added delete_client (typed-name danger card),
  archive/reactivate, portal invite, expenses, price updates, quote convert.
- v5 opened the formerly-held-back areas at David's direction: mark quotes
  sent/approved + invoices sent (honest wording — no email goes out; the
  prompt reminds users to share the link), refunds as bookkeeping
  (edit_payment / delete_payment, manager-only so Sales can't refund), team
  management (list/add/update members + policies; canManageRole hierarchy
  enforced in-tool AND by the routes), company settings + business hours +
  service-area ZIPs.
- Identity: the assistant is "Atlas" by default; Company.assistantName
  (Settings → AI Assistant, or ask Atlas to rename itself) customizes it
  per business. Settings PATCH is now partial-safe.

**Stage D — "anything a user can do" parity, v7 [BUILT 2026-07-07]:**
- 60 tools. Registry split into per-domain modules: lib/assistant/{core,
  clients, pipeline, schedule, money, agreements, company, deletes,
  index}.ts — lib/assistant.ts is gone; "@/lib/assistant" imports resolve
  to the directory index unchanged.
- Growth came with CONSOLIDATION so the per-turn declaration list stays
  lean: update_quote absorbs update_quote_status (edit + status),
  update_invoice absorbs update_invoice_status, update_job absorbs
  reschedule_job (+ crew via assigneeIds + line items), update_appointment
  absorbs reschedule_appointment (+ reassign), update_service absorbs
  update_service_price, and ONE delete_record tool (10 entities, always
  danger-carded) replaces delete_client/delete_payment/delete_expense.
- New coverage: email_document (REAL quote/invoice emails via the /send
  routes — the old "no email goes out" caveat now only applies to status
  marking), respond_to_booking (approve/decline online bookings + client
  email), update_request, collect_deposit, manage_subscription
  (pause/resume/cancel/billNow/reprice), add_job_note, update_client_note
  (author/manager rules mirrored), update_agreement (void/unvoid/edit
  unsigned), manage_client_fields, manage_web_form (list/create/update/
  duplicate — flat args, config built/merged in code, price-book
  name-matching for form services), undo_import (lists batches, stages the
  batch DELETE), team resetPassword, get_document (full line items for
  quote/invoice/job — required before any edit since edits full-replace
  the item list).
- BUG FIXED IN PASSING: the work-items PATCH route re-derives the
  recurring/agreement block from every request body, so the old
  update_service_price silently wiped recurring settings on price changes;
  update_service now echoes the item's current recurring/agreement fields
  into every payload.
- Still deliberately excluded: company deletion, logo/photo upload, CSV
  import (file uploads), web-form deletion.
- Gating tests updated (scripts/test-assistant.ts, 60-tool owner list);
  tsc + next build clean. NOT yet live-verified against Gemini — free-tier
  quota is the blocker; verify after the paid-tier flip.

**Stage E — v8: parity refresh, power reads, spend-metered plan, card
redesign [BUILT 2026-09-01]:**
- 95 tools. Four new modules: lib/assistant/records.ts (query_records —
  one structured search across 11 entities with filters/sort/paging up to
  200 rows; report — aggregates by month/week/client/tech/status/category
  without listing rows), client-extras.ts (get_client_details, addresses,
  people, email_client, reply_in_portal, get_statement, manage_saved_card),
  field.ts (checklists, clock, on-my-way + review sms prep, job sign-off,
  manage_time_entry, manage_time_block, team_map, get_route_plan,
  optimize_route, find_a_time, post_team_message), money-extras.ts
  (refund_payment — REAL processor refunds now, charge_saved_card,
  duplicate_document, manage_recurring_expense, quickbooks status/sync,
  send_payout, export_data, run_recurring_billing). log_expense gained
  repeatMonthly; delete_record gained time_entry/time_block/address/person.
- Proposal gained `money` (amber, unmergeable "moves real money" card),
  `confirmLabel` (verb buttons) and `href` (Open link after Confirm).
- Loop: 12 rounds × 24 calls, 16k output cap, ATLAS_THINKING_BUDGET
  (default 1024 on 2.5-flash), an atlasNote on the last tool round so bulk
  work wraps up cleanly and offers "continue". Usage is summed per turn.
- **Monthly free tier replaces the trial [2026-09-04]** (David): every
  account gets ATLAS_FREE_TOKENS (10,000) per calendar month on the meter,
  refilled on the 1st, no "start trial" step — `Company.atlasFreePeriodStart`
  + `atlasFreeTokensUsed` (the trial columns are unread legacy until dropped
  manually). Plan defaults moved to ATLAS_PLAN_TOKENS 150,000 for
  ATLAS_PLAN_PRICE_CENTS 2000 ($20/month), refilled on the billing day
  (planPeriod anchored on atlasPlanActiveAt) — still not sold; the drawer
  upsell shows the price with a Coming Soon button. Access levels are now
  full / off / plan / free / locked(free-spent | plan-spent, resetsAt).
  Rates live in lib/atlas-pricing.ts (no Prisma) so the marketing site
  quotes the same numbers. Superadmin: "Refill free tier" replaces "Reset
  trial". The /api/app/assistant/trial route is gone.
- Access ladder (lib/assistant-access.ts): full → off → PLAN → free. The
  plan (lib/assistant-billing.ts) is NOT sold yet — superadmin grants it.
  It meters SPEND, not messages: each turn's Gemini usage is priced with
  lib/platform-costs unit prices and converted to "Atlas tokens"
  (ATLAS_TOKEN_CENTS, default 0.01¢/token; ATLAS_PLAN_TOKENS, default
  100,000 per monthly period anchored on activation). Debited after the
  turn (overshoot ≤ one turn). Every turn is logged to AssistantTurn for
  every access level; the superadmin company page shows the 30-day ledger,
  the live meter, and grant/refill/revoke.
- **Trial on the same meter [2026-09-02]**: the free trial no longer counts
  messages — it is a one-time allowance of ATLAS_TRIAL_TOKENS (default
  10,000 ≈ $1 of raw spend, roughly 25–60 messages) debited exactly like
  the plan (`Company.atlasTrialTokensUsed`; `atlasTrialUsed` dropped —
  `db:push` needs `--accept-data-loss` for that one column). `AtlasAccess`
  trial and plan variants both carry `meter` (refillsAt null for the
  trial); the drawer shows one TokenMeter for both plus per-reply cost on
  every metered turn. Superadmin gained "Reset trial" (atlas-trial-reset)
  so a burn-down can be re-run on a test company. Measured static payload
  2026-09-02: 95 tools = 57,397 chars ≈ 15k tokens + ~2.5k system prompt
  per model call — see cost-controls.md for the reduction plan.
- **Queued next step + card v2 [2026-09-02]** (David: "assign the jobs,
  then I had to prompt him again for the route"). Writes only happen on
  Confirm, so step two of a dependent task can't run in the same turn.
  New tool `queue_next_step(instruction)` (96 tools; every role): the model
  stages step one and queues the exact follow-up; `AssistantResult.nextStep`
  rides the reply only when cards were staged. The drawer fires it as the
  next turn BY ITSELF once every card in that reply is `done` (skipped or
  failed → dropped, the user steers), rendered as a quiet "Continuing on
  its own" line instead of a bubble; chains cap at MAX_AUTO_CHAIN=3. Prompt
  gained a FINISH THE WHOLE JOB rule: ask only when a wrong guess is costly,
  ask everything at once, and after an answer resume the original request
  end to end. Cost: an auto turn is a normal metered turn — the saving is
  the dropped clarification round-trips, not the continue itself.
  Cards v2: tinted header band in the decision's ink (accent / amber /
  red / green) with kicker + Oxanium title, numeral-ledger values, batch
  rows numbered, one solid pill commit ("Save all 3"), quiet Skip, DONE
  rubber stamp (stamp-slam) on applied cards.
- Drawer: approval cards rebuilt on .card-ledger — colored rule (accent /
  amber money / red permanent), status stamp, key/value ledger rows,
  batch preview with "Show all", typed-name arming, verb-specific commit
  button, Done/Failed footer with Open + Try again, skipped cards collapse
  to one line. Plan meter (bar + refill date) above the composer; per-reply
  token cost on plan accounts; plan-spent lock state.
- Still deliberately excluded: company deletion, logo/photo upload, CSV
  import, adding a NEW card (finix.js form), dispute evidence upload,
  QuickBooks connect, email-domain setup.
- Deploy order: `npm run db:push` (additive: 4 Company columns + the
  AssistantTurn table) BEFORE the code deploy — the platform layout selects
  the new columns on every page.

## 2. AI receptionist (DAVID BUILDS LATER — likely behind a paywall)

Chat bubble on the public /book/[slug] page + embed. Answers pre-booking
questions (prices, service area, hours, how it works) and steers visitors to
the slot picker / request form. Candidate first paid add-on: Jobber charges
$29/mo for the equivalent, so even $5–10/mo undercuts hard while covering AI
cost with huge margin; free tier could cap at N chats/mo instead of hiding it.

Design notes (from the 2026-07-03 discussion):
- No tools, no DB access at request time: system prompt is stuffed with the
  company's PUBLIC facts only (price book + durations, hours, serviceZips,
  arrival-window policy, phone). The setup wizard populates all of it.
- Strict instructions: only answer from provided facts, never invent prices,
  route unknowns to the message/request form. No PII in context → worst-case
  jailbreak = silly text, nothing leakable.
- Per-company opt-in toggle on the Forms page, default OFF (add-on rule).
- Abuse control (public endpoint spending our tokens): per-visitor cap
  (~20 msgs), per-company daily cap (~200), message length caps, limit() per
  IP, short maxOutputTokens. Consider requiring a Turnstile pass before the
  first message. Flash-Lite is sufficient here.
- Escalation path: "want us to call you?" → creates a Request via the
  existing public submit flow.
- Paywall shape when ready: Company.plan or a feature-flag Json column;
  settings toggle greys out with an upgrade nudge when unpaid.

## 3. LATER CONCERN — API cost as assistant usage grows (noted 2026-07-03)

Not a problem during the testing stage; revisit before/at real-user scale.

Atlas is convenient enough that users may lean on it heavily, and the app is
free — so AI spend has no matching revenue. Where things stand:

- **Free tier (today): $0 risk, availability risk instead.** The key cannot
  bill; Google 429s when quota runs out (~250 req/day on 2.5-flash, shared
  across ALL companies; one chat turn = up to 8 requests via tool rounds).
  A few heavy users could make Atlas go quiet platform-wide by afternoon.
- **Paid tier: bounded, small.** Existing guards cap the worst case:
  20 msgs/10min + 200 msgs/day per company (app/api/app/assistant/route.ts),
  history capped at 30 msgs × 4000 chars, 8 tool rounds max. At 2.5-flash
  paid pricing a turn costs ~$0.005–0.015 → hard ceiling ~$2–3/day/company,
  realistic heavy use ~$0.15–0.30/day/company. Only a line item at hundreds
  of active companies.

When flipping to paid (do these, no code needed):
1. Set a budget alert AND a hard spending cap on the key in the Google Cloud
   console — a hard cap turns runaway spend into 429s the app already handles.
2. Check the usage dashboard after the first week for real per-company burn.

If it ever matters, code-side knobs: lower the 200/day limit, make the cap a
per-plan setting, or move Atlas behind the paid tier (already a paywall
candidate alongside the receptionist).
