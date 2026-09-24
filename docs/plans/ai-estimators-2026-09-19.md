# AI-built estimate tools + automations — build plan (2026-09-19)

**Status: Batch 1 (estimate tools) LIVE on main as `6e6e580`, Batch 2
(automation builder + external part-price lookup) LIVE on main as `fe96f5d`
(both 2026-09-19). Batch 3 (estimate tools as website lead-capture forms +
embed, live running total in the runner) BUILT 2026-09-19 — tsc clean, unit
tests green (`scripts/test-estimator.ts`, `scripts/test-estimator-public.ts`,
`scripts/test-automations.ts`, `scripts/test-assistant.ts` 100 tools). Live
Gemini behaviour of the builders is UNVERIFIED — see the § Test sections.
Batch 4 (manual editor + version history, onsite Estimate → Create quote,
sections / show-when / pick-several in the spec, photo fill-in, Try-it on
Atlas cards, lead page attribution) BUILT 2026-09-21 — tsc clean, unit
tests green. Batch 5 (the Estimates section: streaming builder with
animation, tool cards, Ask Atlas, map-drawn measurements, pictures on
options, embed code per tool; Settings entry removed; Atlas chat hands new
tools to the page) BUILT 2026-09-21.**

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

## Batch 4 — the estimator grows up (BUILT 2026-09-21)

David (2026-09-21): "implement your suggestions … a tool for companies to
make quotes onsite (there needs to be a way to convert it to a quote) but
also a lead capture mechanism … good enough to create complex tools useful
for different industries." Three jobs, one spec.

### Spec v1 additions (`lib/estimator.ts`, backwards compatible)
- `input.section` — consecutive inputs with the same section render under a
  heading in the app and as ONE STEP EACH on the website form (progress
  bar, Next/Back). `sectionsOf()`.
- `input.showWhen` — an expression over OTHER inputs (no variables, no
  price book — the client evaluates it live); a hidden question reads as
  untouched (its default) even if a stale value is sent, and its `required`
  is not enforced. `visibleInputIds()` is the one implementation; both forms
  and `coerceInputs()` use it. Fails open (a broken condition shows the
  question).
- `type: "multi"` — pick several; the value is a list of option values.
  Functions `has(picks, value)` (1/0 in arithmetic; also text contains),
  `count(picks | a, b, c)`, `sum(list | a, b)`, `join(picks, sep)`. Lists
  render as words in templates.
- Limits: 40 inputs, 60 variables, 60 lines. `describeSpecChanges(from, to)`
  → human lines ("Rate for \"Sealant\": $0.45 → $0.50", "Added question …").
  Guide text teaches all of it; Atlas update cards now list the CHANGES
  instead of re-badging the whole spec (≤10 changes; rewrites fall back).

### Version history
`EstimatorVersion` (additive): every change to the rules or the words
snapshots the PREVIOUS state first — `PATCH` (source `atlas` → "Atlas
update", else "Manual edit"), create ("Created"), restore ("Before
restoring …"). Last 25 per tool. `GET /api/app/estimators/[id]/versions`
(each row carries what the edit after it changed), `POST …/versions/[vid]`
restores (must still compile against today's price book; the live rules are
snapshotted first, so a restore is undoable).

### Manual editor — Settings → Estimate tools → pencil (`EditEstimatorSheet`)
Tabs: Questions (label, help, section, show-when, options + values,
required, defaults, add/reorder/remove — new questions derive their id from
the label until saved; existing ids never move), Pricing (minimum, variables,
lines: name/description templates, unit price, quantity, only-when,
price-book item with a datalist, optional; formula cheat sheet), Words
(name, description, intro, quote title, client message, Atlas fill-in +
guidance), History (restore). Footer: Check (compile via
`POST /api/app/estimators/preview`), Try it (runs the UNSAVED rules in the
runner), Save (PATCH → exact compile errors inline).

### Onsite: Estimate → Create quote
`/app/estimate` (+ menu "Estimate", shortcut `n e`): the runner as a page.
Result screen → **Create quote** stashes the lines/title/message in
sessionStorage and opens `/app/quotes/new?fromTool=1`, where `QuoteEditor`
applies them once and the user picks the client. The settings "Try it" and
the Atlas card "Try it" (below) offer the same button. `EstimatorRunnerPanel`
is the chrome-less body; `EstimatorRunner` wraps it in the Modal.

### Try it on the Atlas card
`manage_estimator` create/update cards carry the full spec, so the drawer
shows **Try it** next to Skip: the runner opens on the staged, unsaved spec
(`preview: true` → `/api/app/estimators/preview`). See what you approve.

### Photo fill-in
`lib/estimator-assist.ts` is the shared metered step (in-app runner + public
form): description and/or a photo (client downscales to 1280 px JPEG,
`lib/image-downscale.ts`; server accepts jpeg/png/webp ≤ ~2 MB) →
`meteredOneShot` with an inline image part → coerced values. In the app:
"Add a photo" in the runner's assist box. On the website:
`publicConfig.photoAssist` (sheet toggle, only for tools with assist; Atlas
`website.photoAssist`) → `POST /api/public/estimate/[slug]/[tool]/assist`,
6/h per IP and `PUBLIC_PHOTO_ASSIST_DAILY_CAP` (20) per company per day; the
ledger names the company's owner/admin; visitors never see tokens or meter
state. The request notes "filled in from a photo — double-check".

### Lead attribution
The embed snippet now answers the iframe's height message with
`{type: "jobflow:page", href}`; the form also reads `document.referrer`. The
submit carries `page` (https only, 300 chars) → request details `From page:
…`. Hidden questions and multi picks render correctly in the answers.

### Batch 4 Test (owed)
1. Pencil on the driveway tool → Pricing → change Sealant 0.45 → 0.50 →
   Check says "Rules add up" → Try it prices 800 sq ft with sealant at $600
   → Save. History tab shows "Manual edit" with "Rate for Sealant: $0.45 →
   $0.50"; Restore brings 0.45 back and adds a "Before restoring" row.
2. Questions → add a Pick-several "Also clean" (Patio, Fence) in section
   "Extras", a Number "Fence length" with show-when `has(also_clean,
   'Fence')`; Pricing → add line Fence wash, quantity fence_length, price
   1.25, only when `has(also_clean, 'Fence')` → Save. Runner: Fence length
   appears only after picking Fence; the website form shows two steps.
3. + menu → Estimate → answer → Create quote → the new quote opens with the
   lines and title; pick a client; save.
4. Atlas: "change the driveway tool's minimum to $175" → the update card
   lists "Minimum job charge: $150.00 → $175.00" and a Try it button that
   runs the unsaved rules; confirm → History shows "Atlas update".
5. Runner on a tool with assist → Add a photo of a driveway → Fill in →
   inputs populate, note says which came from the photo, tokens shown.
6. Website form sheet on that tool → "Let visitors attach a photo" → the
   public form's first step offers Add photo; a photo fills answers; the
   submitted request says the answers came from a photo. 7th photo from one
   IP in an hour → "please fill in by hand".
7. Embed the snippet on a test page → submit → request details end with
   "From page: <that page's URL>".

## Batch 5 — the Estimates section (BUILT 2026-09-21)

David (2026-09-21): pictures on the website form; build tools in their own
section, not the Atlas chat (chat requests redirect there); an Estimates
entry in the menu with the builder and the active tools; a prompt box with
a "cool animation" while it builds and again while Atlas changes a tool;
test when done; edit by prompt or by hand; fences/areas on a map for
fencing, lawn care etc.; embed code per tool; remove the Settings entry;
find/build/edit must be very user-friendly; cut the paragraph of text.

### `/app/estimates` (`app/platform/estimates/`)
Nav: Work → Estimates (phone groups + desktop rail), hue = quotes. One-line
subtitle. Managers: **Build a tool** card (`BuildPanel`) on top — a
sentence, example chips, "Build it" — then tool cards. Each card: Run
(runner → Create quote), Ask Atlas (`AskAtlasSheet` = the same panel in
change mode), Edit (manual editor), Website (publish sheet), Embed code
(copies the snippet when published), ⋯ → on/off, delete. A just-built tool
gets a green ring + NEW for 4 s. `?run=1` opens the runner picker at once
(the + menu's "Estimate", shortcut `n e`); `?prompt=…` prefills the builder.
`/app/settings/estimators` and `/app/estimate` redirect here; the Settings
index entry is gone. `EditEstimatorSheet` + `PublishEstimatorSheet` moved
into this folder.

### Builder — `lib/estimator-build.ts` + `POST /api/app/estimators/build`
NDJSON stream the panel animates (orb + step list + shimmer status):
`book` → `draft` (one metered one-shot: system = design rules + the guide +
the price book; answer = `{name, description, spec, sampleInputs}` or
`{question}`) → `check` (`checkSpec`, same gate as a save) → `fix` (errors
back to the model, ≤ 3 rounds total) → `test` (runs the model's own sample
job) → `save` (create with name de-dup, or snapshot "Atlas update" + update;
for a change the done event carries `describeSpecChanges`). `{ask}` = the
model needs a price only the owner knows; the panel shows the question with
an answer box and resubmits. Ledger kind `estimator-build`. The model never
writes to the database.

### Atlas chat hand-off
`ToolCtx.navigate` → `AssistantResult.navigate` → `/api/app/assistant`
response → the drawer `router.push`es it 600 ms after the reply and closes.
`manage_estimator` action `create` now takes `request` (the owner's words)
and sets navigate to `/app/estimates?prompt=…`; the prompt rule says never
to draft a spec in chat for a new tool. `update` still stages a card
(with Try it and the exact changes).

### Spec additions
- `type: "map"` with `measure: "length" | "area"` — the customer draws on a
  satellite map (`components/MapMeasure.tsx`: Leaflet, OSM streets + Esri
  imagery, address search via `GET /api/public/geocode` (Mapbox,
  rate-limited, 503 when no token), My location, Undo/Clear, live readout).
  Value = whole feet (line) or square feet (polygon; shoelace on an
  equirectangular projection). Coerced like a number (min/max, required by
  default). The corners stay client-side; the request records "…ft (drawn on
  the map)".
- `input.image` and `option.image` — pictures. `EstimatorImage` (additive;
  R2 or row bytes like JobPhoto), `POST/DELETE /api/app/estimators/[id]/images[/imageId]`,
  public `GET /api/estimate-images/[id]`. Only our route or https URLs pass
  `compileSpec`. Editor: picture button on every question and option (the
  client downsizes to 1024 px JPEG). Both forms render options with pictures
  as a picture grid (one pick or several) and a question's picture above it.

### Batch 5 Test (owed)
1. Sidebar → Estimates. Type the fence example → Build it → the orb spins
   through the five steps → the card appears with NEW. Run → draw a fence
   line on the satellite map → Calculate → Create quote.
2. Ask Atlas on that card: "add a gate option at $250" → animation → the
   card updates; Edit → History shows "Atlas update" with the change.
3. Edit → Questions → picture button on each fence style option → upload →
   Website → Preview shows a picture grid on the public form.
4. Website → Embed code copies; paste into a test page → the form loads, map
   included.
5. Atlas chat: "build me a gutter cleaning estimator, $1.50 per foot" →
   one-sentence reply → the drawer closes and /app/estimates opens with the
   words filled in.
6. + menu → Estimate → the runner picker opens immediately.
7. Settings has no Estimate tools entry; /app/settings/estimators redirects.

## Batch 6 — the marquee pass (BUILT 2026-09-21)

David (2026-09-21): "the estimator is cheeks. the animation to build it looks
wack and does not match the software, the estimate tools its outputs are so
bad and low quality no one would ever use them" → "i want to make this a
marquee feature. the final product needs to be Jobber-quality." Two
constraints: keep the SAME Gemini model (raise its thinking budget), and no
Oxanium — current Workbench styling only.

### Why the tools were shallow (the diagnosis)
- The build ran gemini-2.5-flash with a 256-token thinking budget, one shot,
  from a spec reference with a single pressure-washing example. No trade
  knowledge, no plan, and "does it compile + run once" as the only gate.
- A missing rate stopped the build with a question instead of a placeholder.
- The runner and website form rendered a plain form (number boxes, native
  select, a "qty × price" list). No presets, sliders, tap cards, packages,
  big number or grouped breakdown — nothing a homeowner or a Jobber user
  would recognise as a product.
- The build animation was a generic green orb + fake five-step spinner.

### Build quality — `lib/estimator-build.ts` + `lib/estimator-playbook.ts`
- Two calls on the assistant's model. **plan** (thinking 1024): trade key,
  price drivers, planned questions + controls, packages, one `ask` only when
  the job itself is unknowable. Streams `{plan}` within seconds. **draft**
  (thinking 8192, 16k output, 170 s deadline): the trade's playbook entry
  (`PLAYBOOK`: 20 trades — drivers, questions, line structure, packages,
  gotchas) + `ESTIMATOR_PRINCIPLES` + the plan → `{name, description, spec}`.
  Changes skip the plan (thinking 6144). Fix rounds use 4096.
- `meteredOneShot` gained `thinkingBudget` + `timeoutMs`; `aiChat` maps a
  budget to `thinkingLevel` on gemini-3 models and takes `timeoutMs`.
- Gates: `checkSpec` (compile + price book) → **`auditSpec`** (pure, in
  `lib/estimator.ts`): every line needs a description, no $0 rates, ≥2
  samples that run green with subtotal > 0, small ≤ typical ≤ large;
  warnings for missing units/minimum/sections. Errors go back to the model
  (≤ 2 fix rounds); leftovers surface as warnings on the finished card.
- Missing rates never stall: the spec carries `placeholders: string[]`; the
  tool card shows an amber "N placeholder rates to set" chip → the editor's
  Pricing tab lists them with a Set button per line.
- Events: `{phase}` `{plan}` `{draft}` `{samples}` `{done: tool, changes,
  samples, placeholders, warnings, tokens}` — every row on screen is real.

### Spec v1 additions (`lib/estimator.ts`, backwards compatible)
- number: `control` field | slider (needs max) | stepper; `presets`
  [{label, value}] ≤ 8.
- select: `style` list | cards | packages; options gain `blurb`, `includes`
  (≤ 8), `recommended` (one per picker). Packages need 2–4 tiers, each with
  includes.
- line: `group` (breakdown heading). Result lines carry it.
- spec: `placeholders`, `samples` [{label, inputs}] ≤ 3 (unknown ids
  dropped).
- `parseVariants` + `runVariants`: price one choice's every option with the
  same other answers → package tier prices. Wired into
  `/run?dry=1`, `/preview` and public `/calc` (`variants` body; public
  answers are shaped by showPrice via `shapeVariants`, never on hidden
  forms). `inputsComplete(spec, values, ignore)` lets the live total run
  before the tier is picked.
- `/preview` without inputs now returns `audit` — the editor's Check shows
  "Adds up — a pro would still tweak" tips.
- Guide (`ESTIMATOR_GUIDE`) and the Atlas `manage_estimator` schema know the
  new fields (types enum finally lists multi + map).

### Rendering — `components/EstimatorControls.tsx` (shared)
One themed control set for the in-app runner (`APP_THEME`: brand accent via
CSS vars) and the website form (`publicTheme(dark, accent)`): presets chips
+ slider / −/+ stepper / field, tap cards, package tier cards with live
prices + includes + "Most popular", multi chips or cards, switch rows, a
numbered `StepRail`, `PriceHero` (count-up via `useCountUp`), grouped
`Breakdown` with per-group subtotals, `pickedIncludes`. Inter + tabular
numerals; no Oxanium anywhere.
- Runner: numbered sections, docked "Estimate so far" total + "See the
  breakdown", result = hero price → "<tier> includes" → breakdown → Create
  quote. Managers get "Fill with a sample" chips (`showSamples`).
- Website form: step rail with section titles, same controls, tier prices
  fetched with `variants` once the other answers are in, hero + includes +
  breakdown on the estimate screen and the thank-you screen.

### The build animation — `BuildPanel.tsx`
No orb. A step rail (Sizing up → Questions & pricing → Checking → Pricing
sample jobs → Saving) with the live message in the app's `atlas-shimmer`,
and beneath it **the tool taking shape**: trade pill + note, "what drives
the price" chips (plan), planned questions as shimmer rows → real questions
with control pills grouped by section (draft), packages, pricing-line chips,
three sample tiles that count up when the audit prices them, then a Ready
pill with Try it / Put it on your website / Edit by hand, the placeholder
list and what changed. Rows enter with `.msg-enter`.

### Batch 6 Test (owed)
1. Estimates → paste the house-cleaning example → Build it → within ~5 s the
   trade pill + drivers + planned questions appear; ~30–60 s later the real
   questions, packages, lines and three sample prices count up → Ready.
2. Try it → package tiers show three live prices before you pick; the docked
   total counts up; See the breakdown → hero price, "<tier> includes",
   grouped breakdown → Create quote lands the lines.
3. Build "Roof replacement: draw the roof area; I don't know my rates yet"
   → the tool still builds; the card shows "N placeholder rates to set" →
   Edit → Pricing lists them; set a rate → Set → save → chip gone.
4. Website → Preview: step rail with titles, slider with presets, tier cards
   priced (range mode shows "$800 – $950" per tier), hero + breakdown after
   See my estimate. Embed still auto-sizes.
5. Ask Atlas on a tool: "make the middle package the recommended one and add
   a $99 travel fee" → change lands with the sample tiles re-priced; History
   shows the change.
6. Edit → Check on a tool with a line missing its description → "a pro would
   still tweak" tips.
7. Atlas chat: "build me a gutter cleaning estimator" → hand-off to the page
   as before; the built tool now has packages/presets.

## Batch 7 — tool pages, clarifying questions, Atlas in the loop (BUILT 2026-09-22)

David after Batch 6: "definitely making moves in the right direction" — then
six asks: (1) graphics "a little cooked" on one form: consistent design, no
overlap, good spacing; (2) the Estimates page "looks like terrible AI slop"
and the manual editor "is really difficult to navigate" — redesign both;
(3) the standalone website page said "Too many requests"; (4) when Atlas
needs a clarification (fence material costs) he should ASK, "just like
you'll ask me sometimes"; (5) for really complex forms, and ONLY when
necessary, Atlas can wire himself in for answers (tokens to the business);
(6) he must be able to build almost anything a home-service business wants,
accurately.

### Fixes
- **Rate limit (3):** the estimate submit shared `public-book-ip` (20/h)
  with the booking forms → own bucket `public-estimate-submit-ip` 40/h; calc
  (live pricing on every slider nudge) 400/10 min; assist 8/h per IP. An IP
  of "unknown" (no proxy header) is never used as a shared key — captcha and
  the per-company daily cap stand.
- **Overlap/spacing (1):** the "Most popular" badge was absolutely
  positioned above the tier card and overlapped the card above on phones →
  an inline pill in the card header; tier price line has a fixed min-height
  so cards align; slider row wraps its number field on narrow widths; the
  runner dialog is now header / scrolling body / docked footer (no more
  sticky bar with negative insets); hero price sizes down on phones;
  question blocks use one spacing scale (label mb-1.5, help mt-1.5, blocks
  space-y-5, sections space-y-7 with a hairline under each heading).

### The pages (2)
- `/app/estimates` — a ledger LIST (the app's row idiom): icon tile, name +
  status pills (Off / On your website / N rates to set), shape facts, usage;
  rows open the tool page; desktop rows get a hover "Run". The builder is
  the page when there are no tools (or `?prompt=`), otherwise folds to one
  dashed line and a "Build a tool" button.
- `/app/estimates/[id]` (`ToolClient`) — the tool's home, Settings-style
  left rail (chip rail on phones), `?s=` section: **Overview** (stat tiles,
  the sample jobs priced by today's rules via dry runs, placeholder nag,
  "Atlas assesses …" note, quick actions), **Try it** (the runner inline,
  `EstimatorRunnerPanel inline`), **Ask Atlas** (BuildPanel compact),
  **Questions / Pricing / Words / History** (`EstimatorEditor` — stays
  mounted across sections so edits survive switching; `useUnsavedWarning`),
  **Website** (`PublishPanel`, grouped cards + link/embed up top). The three
  modals (Edit/Publish/Ask sheets) are gone.
- **Editor redesign:** every question and every pricing line is a collapsed
  ROW (type pill · label · section · "only when" · Atlas pill; lines show
  rate × qty · when · optional) that opens to its settings; new items open
  expanded; "Add:" type chips; variables fold into one row; a docked bar
  (Check · Try it · Unsaved changes · Save) replaces the modal footer.
  Question settings gained "Atlas assesses this"; counts questions edit
  their items.

### Clarifying questions (4) — `lib/estimator-build.ts` + `BuildPanel`
The plan call may return `askOwner: [{question, why, suggestions[]}]` (≤ 4)
for things that materially change the pricing and the owner left open —
rates per named material, the minimum, packages, the unit. The build stops
there (`{questions}` event); BuildPanel shows them as a card ("Before I
build this, N quick questions"), each with tap-to-fill example answers and
a text box; "Build with these answers" re-posts with `answers[]` (the plan
runs again with them and is told not to ask twice; blanks → placeholders);
"Skip — use placeholders" sends blanks. The old single `ask` string maps
onto the same card.

### Atlas in the loop (5) — `input.askAtlas`
Any non-text question can be marked `askAtlas: true`: Atlas answers it from
the job description / photo at run time via the existing metered assist
call (compile turns `assist` on automatically). The runner and the website
form lead with "Tell Atlas/us about the job" (words + photo → "Assess &
fill in"); assessed answers get an Atlas tag and stay editable; the public
assist route allows it whenever the tool has askAtlas inputs (owner pays,
existing per-IP/per-company caps). The guide and playbook say: only for
what a pro must LOOK at (condition, access, hazard, scope), ≤ 3 per tool,
never sizes or customer choices; the audit warns past 3 and when an
assessed question has no "help" (what to look for).

### Building anything (6)
- New `counts` question type: items AND how many of each (windows by type,
  trees by size, junk items, fixtures) — value is a table {item: n};
  functions `qty(counts, 'item')`, `total(counts)`; `has()`/`count()`/
  `join()` understand tables ("2 × Sofa, 1 × Fridge"); `CountsControl`
  (−/+ per item) in both forms; coerce accepts a table, [{value,count}], a
  plain list or "a:2,b:1"; `max` per item.
- Playbook grew to 26 trades (carpet/upholstery, appliance repair,
  irrigation, snow, chimney, locksmith).

### Batch 7 Test (owed)
1. Website page (not preview): submit a form twice in a row → both land as
   leads, no "Too many requests".
2. Estimates → list rows → open a tool → Overview shows sample prices;
   Questions: rows collapsed, open one, change a label, docked bar says
   Unsaved changes → Save → History shows "Manual edit".
3. Build "Fence installation, cedar or chain link, gates extra" (no rates)
   → the questions card appears with tapable suggestions → answer two, skip
   one → the tool builds; the skipped one shows as a placeholder.
4. Build "Tree removal — price depends on how close to the house and power
   lines" → the tool has an Atlas-assessed hazard question; Try it → "Tell
   Atlas about the job" → describe → Assess & fill in → the hazard answer
   carries the Atlas tag and can be changed.
5. Build "Window cleaning by window type" → a counts question with −/+ per
   type; the website form prices it; the request's answers read "12 ×
   Standard, 2 × Picture".
6. Phone: tier cards stack with the Most popular pill inside the card, no
   overlap; the runner's footer stays docked while the body scrolls.

## Batch 8 — simpler (BUILT 2026-09-22)

David: "looking really good… still a little complex." Asks: rename
Questions → Advanced (owners should build by talking to Atlas); the
placeholder warnings "look super AI generated"; the main page and editor
are still busy; getting the website link took a checkbox + Save; a finished
build should land in the form.

- **Tool page = six sections:** Overview · Try it · Ask Atlas · Website ·
  **Advanced** (Questions / Pricing / Words as a small segmented control
  inside, with "Most changes are quicker to ask Atlas for") · History.
  `?s=questions|pricing|words` still land in Advanced on the right tab.
- **Rates to confirm** (`components/RatesToConfirm.tsx`): the amber ⚠
  boxes are gone everywhere (build finish, list row, overview, editor).
  It's a plain checklist card — "Atlas used a typical number where you
  didn't give one. Set yours, then tick it off." — each row a check circle;
  ticking on the Overview PATCHes the spec (snapshot "Manual edit"). The
  list row shows a quiet gray "N rates to confirm" pill.
- **Website = one switch.** `PublishPanel` publishes on the tap (PATCH
  isPublic + slug, the server derives a link name) and the link, Open,
  and embed snippet appear right under it. Everything else is folded
  under "Options" (rename link, price display, submissions, ask for,
  photo, words) with its own Save. The Overview's "Put it on your website"
  row publishes on the spot and jumps to the link.
- **List:** one column — icon, name + pills, a facts line, chevron. No
  header row, no hover buttons, no "Close builder" state; managers see one
  "Build a tool" button (sellers "Run a tool"), the builder folds to a
  dashed line.
- **Overview:** rates to confirm → "What it prices" sample tiles → three
  quick actions (Try it / Change it — just tell Atlas / Put it on your
  website + Copy link). Stats are one quiet line, only when non-zero.
- **After a build** the page goes straight to `/app/estimates/[id]?s=try`
  — the form itself, sample chips ready, Ask Atlas one tap away. Changes
  from the tool page stay on the page.

### Batch 8 Test (owed)
1. Build a tool → lands on its page, Try it open, sample chips there.
2. Overview → "Put it on your website" → link appears, Copy link works, no
   Save needed. Website section: switch off/on, Options folded.
3. Rates to confirm on Overview → tick one → gone, History shows "Manual
   edit".
4. Advanced → Questions / Pricing / Words segmented control; ?s=pricing
   deep-links.

## Batch 9 — Atlas knows the business (BUILT 2026-09-22)

David: "make it smarter by also allowing Atlas to pull information from the
services list and any other relevant information about the user's
business." The builder used to see only the price book's names + prices.
`lib/estimator-context.ts` `loadBusinessContext()` now gathers, per build:
- the business (name, trade/industry, city/state, service-area size,
  website, default deposit, tax note — tool prices are pre-tax);
- the price book with cost, duration, deposit and description;
- **what they've actually charged**: quote lines from the last 365 days on
  sent/approved/converted quotes, grouped by name — count, typical (median)
  unit price and range (top 40);
- services offered for online booking (booking types);
- existing estimate tools (no duplicates, consistent naming).
The draft prompt gets the full block; the plan call gets a brief. Rules:
a rate the owner didn't say but the business data shows is a REAL rate
(link with workItemName or take the charged price), never a placeholder;
never ask a clarifying question the data already answers; a vague trade
falls back to the company's industry for the playbook. Also fixed the
clarifying-question chips (each suggestion must be a complete answer;
chips add up) and the "On your website" label (now "Published",
requires a real link).

### Map tracer rebuilt (same batch)
David: "the satellite tracer is also pretty rough, you can't even connect
the dots to make a complete shape." `components/MapMeasure.tsx` now: corner
handles are draggable markers (divIcon), so tapping the first corner CLOSES
an area (it used to add a duplicate point — circleMarker clicks bubbled to
the map); a "Close shape" button does the same; the closing edge is dashed
until closed; midpoint dots drag out a new corner; every edge shows its
length in feet (permanent tooltips); a live readout sits on the map ("so
far" until closed); desktop gets a dashed cursor line; Undo reopens a
closed shape; the map opens on the business's location (EstimateView
passes `mapCenter` from Company.lat/lng), else the last viewed spot
(localStorage `wb.map.lastView`), else the US; taller (h-80 / sm:h-96);
imagery overzooms to 21 with maxNativeZoom 19.

### Batch 9 Test (owed)
0. Website form with a map question: opens on the business; tap 4 corners;
   tap the first → the fill goes solid and the readout drops "so far"; drag
   a corner and a midpoint dot; Undo reopens; each edge shows feet.
1. A company with a price book + past quotes: build "a tool for our
   standard house wash" without rates → the tool links the price-book
   service by name and uses the charged prices; no rates-to-confirm.
2. Same company, describe a tool for a service that isn't in the data →
   clarifying questions ask only for what's missing.

## Batch 10 — fewer questions, no fake packages, price-sheet photo, price drivers (BUILT 2026-09-22)

David: "the estimator seems to be asking me questions just to ask
questions and creating packages that are usually not relevant for the
services I've built the estimators for … in case those things are hard
wired." They were.

### Diagnosis
- **Packages were pushed in four places**: `ESTIMATOR_PRINCIPLES` ("Sell
  packages. Three tiers … convert far better than one number"), the guide
  ("Nearly every trade sells better as 3 packages than as one number — use
  them unless the owner prices a single way"), the plan call's JSON shape
  (`"packages": ["Good tier name", "Better", "Best"] or null` primes the
  model), and the draft rule ("the packages become a packages select").
  22 of 26 playbook entries also list packages as if every business sells
  them.
- **Questions were invited**: the plan prompt listed "the job minimum,
  whether they sell packages, the unit they price by" as typical things to
  ask, allowed 4, and a broad prompt leaves all of those "open" — so a
  broad description reliably produced a questionnaire.

### Fixes (prompt + code)
- Packages are opt-in: only when the owner said tiers / packages / levels /
  good-better-best, or the price book and past quotes show tiered services.
  Plan JSON defaults `"packages": null`; the draft may not add a package
  picker the plan didn't have; the guide and principles say "never invent
  tiers"; the playbook line now reads "Packages SOME businesses in this
  trade sell (only if THIS owner sells tiers — never invent them)".
- Questions: `askOwner` is "almost always []". Ask only when the description
  is SPECIFIC and names a thing whose price drives the whole tool but leaves
  it open, AND the business data lacks it. Never the minimum, packages,
  unit, extras, or anything a pro would decide. A broad description gets no
  questions — the trade's standard tool from the playbook plus the
  business's own rates. Code cap 4 → 2. New principle: "Decide, don't
  interview."
- **Price-sheet photo** (`BuildPanel` "Have a price sheet? Attach a photo",
  `imageBase64`/`imageMime` on `POST /build`, same limits as the photo
  fill-in, 2000 px downscale so small print survives): both model calls get
  the image; rates read from it are real numbers, never placeholders. A
  build can start from the photo alone.
- **What moves this price** — `explainRun()` in `lib/estimator.ts` (pure,
  ≤ 60 extra runs): nudges every visible answer the way a customer would
  (size +10 % rounded to the step, toggle flipped, choice swapped for the
  option that changes the total most, add-on added, one more of an item)
  and returns the top 3 swings in words ("+$450 with sealant", "+$25 per
  extra 100 sq ft", "+$120 for Two stories"). `/run` and `/preview` take
  `explain: true`; the runner's result screen shows the card under the
  breakdown. Free — no model call.

### The Library (same batch)
David: a place on the Estimates page where companies publish their tools to
everyone, anonymously or under their name, with a description (Atlas can
write it) and an industry tag; others filter by industry, see them ordered
by likes, like them, and add a copy; a takedown hides the listing but never
touches copies already added.

- **Storage**: `EstimatorListing` (one per source tool, `estimatorId
  @unique`, cascade; `spec` = a PORTABLE snapshot; `industry` ∈
  `INDUSTRIES`; `anonymous` + `byName`; `likes` / `adds` counters; `status`
  LIVE | HIDDEN (owner unlisted) | REMOVED (Workbench) + `removedReason`),
  `EstimatorListingLike` (one per company per listing),
  `Estimator.sourceListingId` on copies. Additive.
- **Portable spec** — `lib/estimator-portable.ts` (pure, tested in
  `scripts/test-estimator-portable.ts`): `workItemName` links drop and the
  linked price becomes a literal; `price()` / `cost()` calls in every
  expression AND template become literals from the sharer's book;
  `placeholders` becomes one "… — from the Library, set your own rate" per
  line (+ the minimum), so the adopter's Overview shows Rates to confirm;
  the result must compile with zero price-book refs.
- **API**: `GET /api/app/library` (industry, q, sort likes|new, cursor,
  30/page; each card says liked / added / mine), `GET /api/app/library/[id]`,
  `POST …/like` (toggle, transaction), `POST …/add` (managers; LIVE only,
  per-company limit, name de-dup, pictures duplicated — row bytes copied
  or R2 object re-uploaded, failures keep the public URL — snapshot "Added
  from the Library", `adds++`), `GET/POST/DELETE /api/app/estimators/[id]/share`
  (share / refresh the library copy / unlist → HIDDEN; REMOVED → 403 with
  the reason), `POST …/share/describe` (Atlas, `meteredOneShot` kind
  `estimator-share`), `POST /api/app/estimators/library/[listing]/run`
  (Preview for anyone who can sell — the portable spec runs against an
  empty book, nothing counted), `PATCH /api/superadmin/library/[id]`
  (remove with a reason / restore).
- **UI**: `/app/estimates/library` (search, industry chips — the company's
  own preselected — Most liked / Newest, ledger rows with by-line or
  "Shared anonymously", heart with count, "added N times", Preview, Add to
  my tools → link to the new tool); a Library button on the Estimates page
  header; "From the Library" pill on copies; tool page section **Library**
  (`SharePanel`: share as company / anonymous, industry, description with
  "Write it with Atlas", Share / Update the library copy / Remove);
  superadmin `/superadmin/library` (all listings, company even when
  anonymous, Remove with reason, Restore).

### After David's first pass (same day)
David: the build must survive navigating away; the fence tool should have
used the map, not a slider.
- **Builds are server jobs** — `EstimatorBuild` row + `lib/estimator-build-jobs.ts`.
  `POST /build` creates the row, schedules `runBuildJob` with Next's
  `after()` and answers 202 `{buildId}`; every event lands on the row; the
  page polls `GET /build/[id]` and replays what it hasn't seen. Leaving the
  page changes nothing on the server. `resumableBuildId()` lets the
  Estimates page (new-tool builds) and the tool page (changes to that tool,
  opens on Ask Atlas) pick a running or answers-pending build back up.
  A "running" row untouched for 4 min reads as interrupted.
- **Map-first trades** — `TradePlaybook.mapMeasure` on pressure washing,
  lawn care, fencing, roofing, concrete, gutters, irrigation; the playbook
  text says the main size MUST be a map question; and `preferMapInput()`
  (pure, tested) converts the primary ft / sq ft number question of a new
  tool into `{type: "map", measure}` after the draft, whatever control the
  model chose. Map inputs coerce like numbers, so lines and samples are
  untouched.
- **Blank Routes / Team map** — both rewritten pages sized themselves with
  `h-full` inside the shell's flex `<main>`, which collapsed to nothing.
  `lib/use-main-fill.ts` now measures `<main>` (ResizeObserver) and sets the
  page height in px, then tells Leaflet to `invalidateSize()`.

### Batch 10 Test (owed)
0. Share a tool that links price-book items → the listing preview runs with
   the same numbers in a company with an empty price book; Add → the copy
   lands with every rate under Rates to confirm and History "Added from the
   Library"; like it from a second company → count moves; superadmin Remove
   → gone from the browse page, the copy still runs, the owner's Library
   section shows the reason.
1. Build "a tool for my pressure washing jobs" (broad) → no questions, no
   package picker unless the price book has tiers; the tool builds straight
   through.
2. Build "fence: cedar or chain link, gates extra" (specific, no rates, empty
   price book) → at most 2 questions, about the per-material rate only.
3. Attach a photo of a rate card with no description → the tool's rates
   match the sheet; Rates to confirm is empty for anything on the sheet.
4. Run any tool → "What moves this price" lists up to three answers with
   dollar swings that agree with re-running by hand.

## Batch 11 — the ledger redesign, quick actions, and what the best tools do (BUILT 2026-09-23)

David: "the Estimator looks a little off on desktop and looks even worse
on mobile … reference our more established pages (jobs, clients) to
redesign it and then make a simpler iOS look for mobile"; "it is still a
little more on the basic side … reference any existing tools out there";
"introduce right click actions for items (leads, clients, jobs,
invoices…) with quick actions (like edit, archive, delete)".

### The list — `app/platform/estimates/page.tsx` + `EstimatesClient.tsx`
Laid out exactly like Jobs / Clients: `p-4 lg:p-8 max-w-6xl`, `PageTitle`
+ header actions (Library as an icon circle on phones, labelled at `sm`;
Build a tool the same way; sellers get Run a tool), `MobileSearch` (?q=),
`KpiStrip` (Live tools · Estimates run · Website leads — zeros drop out on
phones), `FilterBar` All / Published / Turned off (?status=, segmented on
phones, managers only), the dashed "Describe how you price a job" line,
then ONE `card-ledger`: desktop grid `Tool · Questions · Status · Runs ·
Web leads · ⋯` with a double-ruled foot (counts, run and lead totals);
phone rows are the two-line pattern (accent icon tile in place of the
Monogram, name + `stamp` status, facts line, amber "N rates to confirm"
stamp). Status is one stamp: Off (grey) › Published (sky) › Live (green).
Search and filter live in the URL so the server filters like every other
list; `toolFacts()` is exported and shared with the tool page.

### The tool page — `[id]/ToolClient.tsx`
Desktop: the Settings rail (`230px` column, `bg-green-500/10` active row),
header with the icon tile, name, stamps, Run + "…" (now a `QuickMenu`,
so it is a sheet on phones). Phones: iOS Settings — Overview IS the
index: Rates to confirm, the sample-price card (rows on phones, tiles at
`sm`), then a `card-ledger` list of rows (Try it · Change it — ask Atlas
· Web form · Library · Advanced · History) with icon tiles and sublines;
a row pushes into the one section with "‹ Tool name" + the section's
title and subline; "Run this tool" docks as the glass pill (no transform).
The section is read from `useSearchParams` (`?s=`); `go()` uses
`history.pushState` on phones (browser back returns to the index) and
`replaceState` on desktop; legacy `?s=questions|pricing|words` still land
in Advanced on the right tab. `[id]/page.tsx` wraps the client in
`<Suspense>` for `useSearchParams`.

### Quick actions — `components/QuickMenu.tsx` + `components/EntityRowActions.tsx`
- `QuickMenu` (controlled): desktop = a `sheet-material` popover at the
  pointer (portal, clamped into the viewport, `tile-in`, Esc / outside /
  scroll close, `role="menu"`); phone = `BottomSheet` rows with icon
  tiles. Both render; CSS (`hidden lg:block` / `lg:hidden`) picks one.
  Items: label, icon, `href` (Link or tel:) or `onSelect` (async, busy
  state), `destructive`, `disabled` + `hint`, `heading` rows.
- `RowActions` wraps any row — a server-rendered `<Link>` is fine — with
  right-click (`onContextMenu`), press-and-hold (380 ms, 10 px cancel,
  haptic, swallows the click that follows so the link doesn't open,
  `-webkit-touch-callout: none` kills iOS's link preview) and a hover
  "⋯" handle on desktop (`group-hover`, absolute in the chevron column;
  `handleClassName` moves it when a row already has a control there —
  the clients Call button).
- `EntityRowActions` = the verbs per entity, the same routes and
  `confirmSheet` copy as each record's "…" menu; failures explain in an
  `alertSheet`, success `router.refresh()`es:
  - job: Open · Edit · Complete (confirms when scheduled ahead) · Create
    invoice · Reopen · Duplicate · Close · Delete (managers).
  - client: Open · Edit · Call · New quote · New job · Archive /
    Reactivate · Delete.
  - invoice: Open · Edit · Email to client · Mark as sent · Record
    payment · Duplicate · Archive / Reopen · Delete (with payments → sent
    to the invoice page's typed confirm).
  - quote: Open · Edit · Email · Mark as sent · Mark approved · Convert
    to job · Duplicate · Archive / Reopen · Delete.
  - request: Open · Make a quote · Make a job · Archive / Restore ·
    Delete (spam).
  - tool: Open · Run it (opens the runner right there) · Change it with
    Atlas · Edit by hand · Web form · Turn off/on · Delete.
  - leads board (`LeadsBoardClient`): right-click on a card → Open
    profile · Edit · Call · New quote · Move to <stage> · Mark won · Mark
    lost (opens the reason modal); the touch ActionSheet is unchanged.
  Wired on the Jobs, Clients, Invoices, Quotes, Requests and Estimates
  lists (jobs now select `invoice.id` for the Complete/Close wording).

### What the best tools do (research 2026-09-23) → what shipped, what's next
Sources: Deep Lawn, Roofr Instant Estimator, Instant Roofer, Roofle,
Lawnbot/ServiceBot, Hover, Jobber optional line items, Housecall Pro
Sales Proposal layouts, ServiceTitan Pricebook Pro + financing, Wisetack,
Buildxact/Handoff/FieldPulse markups, QuoteIQ, Outgrow/ConvertCalculator.
Shipped in this batch (the low-effort, high-conversion three):
- **Monthly payment anchor** (`publicConfig.monthly {show, apr, months}`;
  `monthlyPayment()` / `monthlyLabel()` in `lib/estimator-public.ts`,
  clamped 0–36 % APR, 6–180 months, rounded UP, hidden under $10/mo):
  "or about $54/mo with financing" under the hero and under every
  package tier's price (`PublicVariant.monthly` → `ChoiceControl
  tierSubs`), fine print with the APR/term and "subject to approval".
  Web form → Options → "Show a monthly payment"; Atlas `website:
  {monthlyPayment: true}`. Display only — no lender.
- **Per-channel links + QR** (Web form → "Links for each place you share
  it"): Truck & yard signs · Door hangers · Social · Google Business
  Profile · Email signature, each `?src=<key>`, Copy + QR (the `qrcode`
  package, PNG download). The form reads `?src=`, the submit route
  sanitises it (≤ 40 chars `[a-z0-9 _-]`), `createEstimateLead` stamps
  the lead's source "Website estimate · truck" and the request "From
  link: truck".
- **Dictation** (`components/DictateButton.tsx`, browser
  SpeechRecognition; renders nothing where unsupported — Chrome, Edge,
  Safari on iPhone/Mac yes; the Capacitor WKWebView no): in the runner's
  "Tell Atlas about the job" box and the builder's prompt box ("Say it
  instead").
Not built (ranked, see the research notes in the session): address-first
auto-measurement (Google Solar API roof segments + a parcel/turf pass,
tracer as fallback); partial-lead capture / abandoned sessions
(`EstimateSession` per step → Leads); instant checkout (pick package →
e-sign → card/deposit → slot) for recurring services; interactive
proposal (optional add-ons toggle the total and the deposit on the
client's phone, pre-selected recommended); follow-up cadence per tool +
speed-to-lead push with the estimate attached; win-rate per tool
(`Quote.estimatorId`); geopricing by zip/zone; homeowner self-capture
links; kits/assemblies with material-vs-labor and live margin.

### Batch 11 Test (owed)
1. Desktop /app/estimates: title row, KPI cards, All/Published/Off chips,
   grid header, rows, foot; search "wash" filters; right-click a row →
   Run it opens the runner; hover shows ⋯.
2. Phone /app/estimates: search bar, KPI strip, segmented filter, icon
   rows with stamps; press-and-hold a row → the sheet, tap Turn off → row
   greys, the link did NOT open.
3. Phone tool page: index rows; tap Web form → "‹ Tool name" header;
   swipe/back returns to the index; "Run this tool" pill → Try it.
4. Web form → Options → Show a monthly payment → Save → open the form
   with ?preview=1: hero shows "or about $X/mo" + fine print; package
   tiers show it under each price.
5. Web form → Links: Copy the truck link, QR → Download PNG; submit the
   form from that link → the client's source reads "Website estimate ·
   truck", the request says "From link: truck".
6. Runner "Tell Atlas" box on Safari/Chrome: Dictate → speak → text lands;
   builder "Say it instead" the same.
7. Jobs list: right-click → Complete job on a future-dated job asks
   first; Clients: ⋯ sits left of the Call button; Leads board:
   right-click a card → Move to <stage> moves it.

## Later
- **Smarter still (proposed 2026-09-22, not built)** — the upgrade-worthy
  layer on top of the Library:
  1. *Win-rate feedback*: stamp `Quote.estimatorId` when a quote starts
     from a tool, then per tool show quotes → approved % and let Atlas
     propose rate moves ("your Deep clean tier wins 92 % — you're
     underpriced"). Needs the quote editor hand-off to carry the tool id.
  2. *Distance-aware travel fee*: a built-in `distance_miles` variable
     (company → job address, geocode cache, metered like Find a Time) so
     tools can add a trip charge or refuse out-of-area jobs on the website
     form.
  3. *Library benchmarks*: when a build has to guess a rate, show the
     median of the same line across same-industry Library listings as the
     placeholder ("typical in the Library: $0.20–0.30/sq ft") — the
     Library becomes a pricing dataset.
  4. *Quote-edit learning*: when owners edit lines a tool produced, Atlas
     notices the drift on the tool page and offers the change.
  5. *Public "what changes the price"*: the drivers card on website forms
     (homeowners self-qualify; fewer tyre-kicker leads).
- Lazy tool loading (docs/plans/cost-controls.md) — `manage_estimator`'s
  spec schema is the largest declaration in the registry now.
- Map: satellite imagery needs the Esri attribution kept; consider Mapbox
  tiles once MAPBOX_TOKEN is public-safe.
- A11y pass on the multi-select chips and picture grids (keyboard focus
  order on phones).
