# AI-built estimate tools + automations — build plan (2026-09-19)

**Status: Batch 1 (estimate tools) LIVE on main as `6e6e580`, Batch 2
(automation builder + external part-price lookup) LIVE on main as `fe96f5d`
(both 2026-09-19). Batch 3 (estimate tools as website lead-capture forms +
embed, live running total in the runner) BUILT 2026-09-19 — tsc clean, unit
tests green (`scripts/test-estimator.ts`, `scripts/test-estimator-public.ts`,
`scripts/test-automations.ts`, `scripts/test-assistant.ts` 100 tools). Live
Gemini behaviour of the builders is UNVERIFIED — see the § Test sections.**

## The idea (David, 2026-09-19)

Instead of shipping one canned estimate form per industry, let owners
*describe* how they price a kind of job and have Atlas build the estimate
tool for them, inside the app. Two costs, kept separate on purpose:

- **Building** a tool is an Atlas conversation → costs tokens once.
- **Running** a tool must be free when the pricing is "just math" — which
  is nearly always. Only when judgment from a written description is truly
  needed does a tool opt into an Atlas step, and that step is metered per
  use.

Same pattern later for automations: Atlas writes a *definition*, a fixed
engine executes it. Atlas never generates code that runs in the app.

## What shipped (Batch 1)

### Engine — `lib/estimator.ts` (pure, no Prisma)
- `EstimatorSpec`: `inputs[]` (number / select / toggle / text), `variables[]`
  (named, evaluated in order), `lines[]` (each: `when`, `quantity`,
  `unitPrice` expressions, `workItemName` price-book link, `isOptional`),
  `minimumTotal`, `quoteTitle` + `clientMessage` templates, `assist`.
- A tiny safe expression language: arithmetic, comparisons, and/or/not,
  ternary, strings, lists, tables; functions `min max round floor ceil abs
  sqrt if clamp pct roundTo tier lookup price cost len contains lower
  number`. Recursive-descent parser, nesting bound (40 brackets), depth
  bound, length bound (500 chars). Templates are `{expr}`, `{expr|money}`,
  `{expr|int}`.
- `compileSpec()` sanitizes + validates everything (ids, reserved words,
  every expression parses and only references known names, select options,
  limits) and returns human error strings — the model fixes its own spec
  from them. Nothing that fails to compile is ever stored.
- `runCompiled()`: coerce inputs (defaults, min/max, option matching) →
  variables → lines (skip falsy `when` / qty ≤ 0; fractional quantity folds
  into one unit at the extended price because quotes sell whole units;
  negative price clamps with a warning; caps at 9,999 qty / $1M line) →
  minimum top-up line → subtotal (non-optional lines) → title/message.
- `ESTIMATOR_GUIDE`: the reference card the builder tool hands the model.

### Storage — `prisma/schema.prisma`
- `Estimator { id companyId name description spec Json isActive runs assists }`
  (+ `Company.estimators`). Additive — the boot `prisma db push` adds it.
- `AssistantTurn.kind` (default `"chat"`; `"estimator"` for assisted runs)
  so the ledger says what tokens bought.

### Server — `lib/estimator-server.ts`, `lib/atlas-oneshot.ts`
- `checkSpec(companyId, raw)` = compile + every referenced price-book name
  must exist (the gate before any save; used by tool AND routes).
- `runStoredEstimator()` counts runs. `runnerEstimators()` shapes rows for
  the quote editor.
- `meteredOneShot(actor, {kind, system, prompt})`: one Gemini call outside
  the drawer with the SAME access gate / meter / ledger as a drawer turn
  (locked meter → 403 `atlasLocked`; debit after; `recordAssistantTurn`
  with `kind`). Rate limits `atlas-oneshot:*` 60/10 min per company, 30 per
  user.

### Routes — `app/api/app/estimators/**`
| Route | Who | Cost |
|---|---|---|
| `GET /api/app/estimators` | sellers (active) / managers (all) | – |
| `POST /api/app/estimators` | managers; `{name, description?, spec}`; 40 per company | – |
| `GET/PATCH/DELETE /api/app/estimators/[id]` | managers (GET: sellers) | – |
| `POST /api/app/estimators/[id]/run` `{inputs}` | sellers | **free** |
| `POST /api/app/estimators/[id]/assist` `{description}` | sellers; only specs with `assist` | **metered** |

The assist route asks for `{"values": {...}, "notes": "..."}`, keeps only
known input ids, coerces them like the form would, and drops anything that
fails. It never invents measurements (prompt rule) and never runs the math —
the runner still calls `/run` (free) with the proposed values, which the user
sees and can change.

### Atlas — `lib/assistant/estimators.ts` (98 tools now)
- `manage_estimator` (managers): `guide` → `test` → `create` / `update`,
  plus `list` / `get`. Create/update stage a `manage_estimator` card into
  the routes above; `test` runs the spec against sample inputs with no card.
  The card says "Cost to run: free" or "Atlas tokens per assisted estimate".
- `run_estimator` (sellers): runs a saved tool with inputs the model took
  from the conversation → returns `lineItems` ready for `create_quote`.
  No extra model call — the chat turn itself is the only spend.
- System prompt: build with the user's rates / price book, never invent
  prices, keep assist OFF unless judgment is truly needed, `run_estimator`
  then `create_quote` when quoting.

### UI
- `components/EstimatorRunner.tsx` — Modal: pick tool → inputs (number /
  select / toggle / text; optional "describe the job → Fill in" box for
  assist tools, labelled *uses Atlas tokens*, hidden when Atlas is
  unavailable, disabled when locked) → result (lines, subtotal, warnings)
  → **Add to quote**.
- `QuoteEditor` gets `estimators` + a **Use an estimate tool** button in the
  line-items header (new + edit quote pages pass active tools). Applied
  lines replace a blank starter row, keep `workItemId`/`unitCost`, and fill
  an empty title / client message.
- `/app/settings/estimators` (managers): list with Free / Atlas badges, Try
  it, on/off, delete, "Build with Atlas" (opens the drawer), example
  prompts in the empty state. No form editor on purpose — Atlas is the
  edit path. Settings hub link under Setup.

## Test (owed — David or a live-key session)
1. As an owner, tell Atlas: *"Build an estimate tool for driveway pressure
   washing: $0.25 per sq ft, $150 minimum, sealant optional at $0.45 per
   sq ft."* Expect: guide call → test call → ONE create card whose lines say
   "Cost to run: free". Confirm → tool appears at /app/settings/estimators.
2. New quote → **Use an estimate tool** → 800 sq ft, sealant on → Calculate
   → lines: Driveway cleaning 800 × $0.25 = $200, Sealant (optional) 800 ×
   $0.45. Add to quote → rows land, title filled.
3. 300 sq ft → expect a "Minimum job charge" $75 top-up line.
4. Ask Atlas to *"add a two-story surcharge of 15% to that tool"* → ONE
   update card. Ask it to *"quote Sarah Lane 1200 sq ft with sealant using
   the driveway tool"* → `run_estimator` then `create_quote`, no math in
   prose.
5. Assist path: *"make a tool for junk removal where I describe the load and
   Atlas guesses the volume"* → spec with `assist`; runner shows the
   describe box; Fill in debits tokens (drawer meter moves; AssistantTurn
   row has kind=estimator); a locked meter shows the amber note and manual
   inputs still calculate.
6. Guardrails: a spec naming a price-book item that doesn't exist is
   refused with the item name; sales role sees `run_estimator` but not
   `manage_estimator`; techs see neither.

## External prices ("how much is the part?") — investigated 2026-09-19

David asked whether an estimate tool could pull a part's price from an
outside site as part of the build. Findings:

- **No public price APIs.** Home Depot, Lowe's, Ferguson, SupplyHouse and
  Grainger expose none; Amazon's Product Advertising API needs an approved
  affiliate account and forbids using prices outside its own linking
  context. Distributor pricing is per-account (contract prices) — a future
  per-tenant integration, not something the platform can offer generically.
- **Scraping product pages** is against every one of those sites' terms,
  bot-blocked (Akamai/PerimeterX on the big boxes), and brittle. Rejected.
- **What the repo already has:** Gemini with Google-Search grounding
  (`askAI({ useSearch: true })`, used by the setup wizard's business lookup).
  That gives a *ballpark with sources* — good enough to seed a price-book
  cost the owner then confirms, not good enough to quote from blind.

**Decision — lookups happen at BUILD time, never per quote.** Shipped
`lookup_part_price` (managers; `lib/assistant/parts.ts`): grounded search →
`{item, unit, typical, low, high, sources[], confidence, notes}` with a
caveat the prompt makes Atlas repeat ("ballpark from public listings —
confirm with your supplier"). The confirmed number goes into the price
book as a PRODUCT with `unitCost` (existing `create_service`), and estimate
tools read it with `price("Name")` / `cost("Name")` for free forever.
The grounded call's tokens fold into the chat turn's meter via the new
`ToolCtx.addUsage` + `askAI.onUsage`. **Not metered:** Google Search
grounding's own per-request fee on the paid tier ($35/1k as of 2026) — see
cost-controls.md; if usage grows, add a flat Atlas-token surcharge per
lookup. Live per-run lookups (an estimator input that fetches a price at
quote time) were considered and rejected: slow, metered, and no more
accurate than the counter price.

## Batch 2 — automation builder (BUILT 2026-09-19)

Same shape as estimate tools: Atlas emits a validated definition → the user
confirms a plain-English card → a fixed engine executes it, no model in the
loop, free per run.

### Spec — `lib/automations.ts` (pure)
- `AutomationSpec = { trigger: {event, days?}, when?, actions[] }`.
- **Event triggers** (fire on the app event, after commit): `request.created`,
  `appointment.scheduled`, `quote.sent` (first send), `quote.approved`,
  `job.completed`, `invoice.paid`.
- **Sweep triggers** (hourly from `/api/cron/recurring`, need `days`):
  `quote.unanswered`, `invoice.overdue`, `lead.stale`.
- **Conditions + templates** reuse the estimate tools' expression language
  over a flat field context (`client_first_name`, `quote_total`, `days`,
  `pay_link`, …; `fieldsFor(trigger)` is the per-trigger list, `FIELD_HELP`
  the meanings). `compileAutomation()` rejects unknown fields with the list
  of valid ones so the model self-corrects.
- **Action allowlist (the whole list):** `notify_team` (managers | assigned
  | everyone; push), `email_client` (subject/body templates; sent as the
  business, logged as a ClientMessage so it shows on the timeline),
  `add_client_note`, `move_lead` (existing stage by name), `request_review`
  (reuses `sendReviewRequest`, which self-dedupes). Nothing moves money,
  deletes, schedules, texts, or touches the team.
- `describeAutomation()` renders the card / settings text: "When a sent quote
  has had no answer for 5 days · Only if: quote_total >= 300 · → Email the
  client: “…” · → Notify the managers: “…”".

### Engine — `lib/automations-server.ts`
- `fireAutomations(companyId, event, entityId)` — fire-and-forget, never
  throws; called from: `POST /api/app/requests`, `POST /api/app/appointments`,
  `POST /api/app/quotes/[id]/send` + manual mark-sent in `PATCH
  /api/app/quotes/[id]`, `finishQuoteApproval()` (public + office approval),
  `PATCH /api/app/jobs/[id]/status` (→ REQUIRES_INVOICING),
  `recordPayment()` when the invoice becomes fully paid, the public booking
  routes (`/api/public/book/[slug]`, `/api/public/schedule/[slug]/[type]`)
  and `createServiceBooking()` after commit.
- `runAutomationSweeps(now)` — cron step `automations`, right after
  `quoteFollowUps`; ≤ 200 candidates per rule per tick.
- **Guardrails by construction:** one `AutomationRun` row per (automation,
  entity, event) is the dedupe key (a sweep never re-nags; a quote re-send
  never re-fires); per-company cap of 300 successful runs per rolling 24 h;
  robot email caps (3 per client per day, 200 per company per day, shared
  with the human route's count); every email/review/push goes through the
  same lib helpers and gates the app uses; actions never emit events, so
  rules cannot cascade; `isActive=false` is the kill switch.
- `previewAutomation()` — the builder's 'test': "would have fired N of M
  times in the last 30 days" with 3 rendered samples + any condition errors.
- Every fired run also lands in ActivityLog (`action: "automation"`,
  userName "Automation") on the entity.

### Storage
`Automation { name description spec isActive createdById runs lastRunAt }`
+ `AutomationRun { automationId companyId event entityType entityId status
detail }` (cascade on delete). Additive — boot `prisma db push` adds them.

### Atlas — `manage_automation` (managers; 100 tools now with `lookup_part_price`)
guide (triggers, per-trigger fields, allowlist, the company's stage names,
whether email/review link are live) → test (compile + dry run + warnings:
missing stage, email not configured, no review link) → create/update card
(`confirmLabel: "Turn it on"`). Prompt rule: never promise an action outside
the allowlist; write client emails warm and short.

### Routes + UI
`GET/POST /api/app/automations`, `GET/PATCH/DELETE /api/app/automations/[id]`
(GET includes the last 50 runs). `/app/settings/automations`: each rule in
plain English, Pause/Resume, Delete (confirm sheet), "Fired N× · last 2h
ago", collapsible recent-activity log linking to the entity, "Build with
Atlas", example prompts in the empty state. Settings hub link under Setup.

### Test (owed)
1. Owner: *"When a quote has sat unanswered for 5 days, email the client a
   friendly nudge and notify me."* Expect guide → test ("would have fired X
   of Y in the last 30 days") → ONE card reading as plain English → confirm →
   rule listed at /app/settings/automations.
2. Send a quote, then in the DB set its `sentAt` 6 days back (or use
   `days: 0` while testing) and POST the cron → the client gets the email,
   a ClientMessage shows on their timeline, the owner gets a push, the run
   log shows `ok` with "emailed …". POST the cron again → no second email
   (dedupe).
3. *"When a job is marked complete, send a review request"* → complete a job
   → ReviewRequest row (needs the company review link; the test action warns
   when it's missing).
4. Pause the rule → complete another job → nothing fires. Resume → fires.
5. Guardrails: ask Atlas for *"text the client"* or *"charge the card"* in an
   automation → it must decline (not in the allowlist); a condition with an
   unknown field is rejected with the valid list.

## Batch 3 — estimate tools as website forms (BUILT 2026-09-19)

David (2026-09-19): "the estimator is still kind of rough. can we make it so
they can also be lead capture forms and can be embedded on the website?"
Any saved tool can now be published as a public instant-estimate form. Same
spec, same engine, same free math — the visitor only ever sees the tool's
questions and the number the owner chooses to show, never the formulas or
the price book.

### Config — `lib/estimator-public.ts` (pure)
- `EstimatorPublicConfig = { heading, intro, buttonLabel, showPrice:
  exact|range|hidden, rangePct (5–50, default 15), reveal:
  instant|after_contact, onSubmit: draft|send|request, fields: {email, phone,
  address, message}, disclaimer, successMessage }`; `sanitizePublicConfig()`
  is the one gate (defaults, clamps, "must be able to reach someone", at
  least one contact detail required, hidden price can't email a quote).
- `estimateRange()` rounds to friendly steps ($10/$25/$50/$100) and never
  drops under the job minimum; `shapeEstimate()` produces what the visitor
  gets (exact lines / range / nothing); `describePublicConfig()` is the card
  and settings prose; `publicSlugFrom()` derives the URL part.

### Storage
`Estimator.isPublic publicSlug publicConfig publicViews publicCalcs
submissions` (+ `@@unique([companyId, publicSlug])`), `Request.estimatorId`
(source `estimate_form`). Additive — boot `prisma db push` adds them.

### Public surface
| Route | What |
|---|---|
| `/book/[companySlug]/estimate/[publicSlug]` | hosted form in the company's booking-page look (ScheduleFrame) |
| `/embed/[companySlug]/estimate/[publicSlug]` | the same inside an iframe; auto-resizes via the existing `jobflow:height` message, slug `company/estimate/tool` |
| `POST /api/public/estimate/[slug]/[tool]/calc` `{inputs}` | server-side math → estimate shaped by showPrice (forms that reveal after contact get `hidden` here); 60/10 min per IP; counts `publicCalcs` |
| `POST /api/public/estimate/[slug]/[tool]` | submit: re-runs the math (client totals never trusted), captcha + honeypot + 3 s floor + 20/h per IP + 200 requests/company/day, then `createEstimateLead()` |

Both pages accept `?preview=1` for a signed-in manager of that company
(unpublished form renders, nothing submits) and the booking-page appearance
overrides (`?theme/?transparent/?accent/?font`). Published forms are also
listed on `/book/[slug]` and `/embed/[slug]` under "Instant estimates"
(`EstimateMenu`); the single-item shortcut only applies when there are none.

### Lead — `lib/estimator-lead.ts`
`createEstimateLead()`: `upsertBookingContact` (shared with the booking form;
new `leadSource: "Website estimate"`) → Quote from the tool's lines (all
lines count toward the subtotal, the app convention; optional lines keep
`isOptional`; price-book lines carry cost/recurring/agreement; deposit via
`derivedQuoteDeposit`; `send` = AWAITING_RESPONSE + sentAt) → Request
(answers as words, the estimate and how it was shown, `estimatorId`) →
pipeline enter + REQUEST_CREATED (+ QUOTE_SENT) → `submissions++`. After
commit: `fireAutomations` request.created (+ quote.sent), push, company
email, quote-link email when `send`. Never throws on a notification.

### Settings — `/app/settings/estimators`
Globe button per tool → `PublishEstimatorSheet`: On your website toggle,
link name, heading/intro/button, what the visitor sees (exact / range ±% /
no price), when (right away / after details), each submission (draft quote /
email the quote / request only), ask-for fields, fine print, thank-you text,
the link + Preview, the iframe snippet, and the funnel (views → estimates →
leads). "On your website" badge + "N website leads" on the row.
`PATCH /api/app/estimators/[id]` accepts `isPublic / publicSlug /
publicConfig` (slug derived from the name when publishing without one;
409 when another tool has it); `POST` accepts them too for the Atlas card.

### Atlas — `manage_estimator` `website` argument
`website: { enabled, slug?, showPrice, rangePct, reveal, onSubmit, heading,
intro, buttonLabel, askPhone, requirePhone, askAddress, requireAddress,
disclaimer, successMessage }` on create/update → the card gains "Website
form: ON at /book/…/estimate/… · Form shows … · Asks for … · Each submission
…". `list`/`get` report `website: {on, url, …}`; `guide` explains the two
questions to ask (what visitors see, what happens). Prompt rule: offer it
when they mention their website, leads, or self-serve pricing; visitors never
spend the owner's tokens (public forms have no assist step).

### Runner polish (the "rough" part)
`EstimatorRunner` shows a **running total** while typing: once every
required input has a value, a debounced dry run (`/run?dry=1`, no counter)
prints "Running total: $X" next to Calculate.

### Test (owed)
1. Settings → Estimate tools → globe on the driveway tool → On your website,
   range ±15%, right away, draft quote → Save → link + snippet appear.
   Preview opens the hosted form with the company's booking look.
2. Open the link signed out → 800 sq ft, sealant on → "See my estimate" →
   "Estimated range $180 – $220" (range of $200), disclaimer, then name +
   email → Send my request → thank-you. In the app: new lead "Website
   estimate", Request #N with the answers + "Estimate: $200.00 (shown as
   $180 – $220)", draft Quote linked to it, push + company email received.
   Row now says "1 website lead"; the sheet's funnel counts 1 → 1 → 1.
3. Switch to "after they leave details" + "email the quote": the first
   screen says Continue, the estimate appears only on the thank-you screen,
   the visitor gets the quote-approval email, the quote is AWAITING_RESPONSE.
4. "No price": no number anywhere for the visitor; the request still carries
   the computed estimate marked "not shown to the client"; the sheet refuses
   "email the quote" in that mode.
5. Paste the snippet into any HTML page: the iframe hugs the form and grows
   on the estimate screen. `/book/[slug]` lists the form under "Instant
   estimates".
6. Atlas: *"put the driveway tool on my website showing a price range and
   emailing me the lead"* → ONE update card with the Website form lines →
   confirm → link works. *"build a gutter cleaning tool and put it on my
   site"* → create card carrying both the rules and the website lines.
7. Guardrails: submit with a filled honeypot → fake 201, nothing created;
   21st submit from one IP in an hour → 429; a suspended company's form →
   404; turning the form off → link 404s, embed shows nothing.

## Later
- Lazy tool loading (docs/plans/cost-controls.md) — `manage_estimator`'s
  spec schema is the largest declaration in the registry now.
- Photos as an assist input (Gemini vision) once the metered path is
  proven.
