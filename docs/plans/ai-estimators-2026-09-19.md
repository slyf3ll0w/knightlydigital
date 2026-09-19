# AI-built estimate tools + automations — build plan (2026-09-19)

**Status: Batch 1 (estimate tools) BUILT 2026-09-19 — tsc clean, unit tests
green (`scripts/test-estimator.ts`, `scripts/test-assistant.ts` 98 tools).
Live Gemini behaviour of the builder is UNVERIFIED — see § Test. Batch 2
(automation builder) is designed below, not started.**

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

## Batch 2 — automation builder (designed, not started)

Same shape: Atlas emits a validated definition → card → engine executes.

- **`Automation` model**: `trigger` (event: `quote.sent`, `quote.approved`,
  `job.completed`, `invoice.overdue` + days, `booking.created`,
  `lead.stage_changed`; or a daily schedule), `conditions` (the
  `query_records` filter vocabulary), `actions[]` from an allowlist of
  existing routes (email_client with a template, reply_in_portal, move_lead,
  notify team, create follow-up appointment, request_review, tag).
- **Never in the allowlist**: anything that moves money, deletes, or
  changes team/roles. Automations confirm once at creation and then run
  unattended, so the blast radius has to be bounded by construction.
- **Executor**: an event dispatcher called from the routes that already know
  the event happened (the same spots that call `notifyUsers` / pipeline
  auto-advance), plus a sweep in `/api/cron/recurring` for time triggers.
  Per-company run caps, a run log with a kill switch, dry-run preview
  ("would have fired 12× last month"), depth-1 loop protection (an
  automation's actions never re-trigger automations).
- **Atlas**: `manage_automation` with the same guide → test (dry run) →
  create flow; the card renders the rule in plain English.
- **Cost**: building costs a turn; running is free unless an action calls
  Atlas (e.g. "have Atlas draft the follow-up"), which is metered via
  `meteredOneShot` with the template as the locked-meter fallback.

## Later
- Public instant-quote calculator: the same spec on the company's booking
  page (`quoteMode` draft/send already exists in intake). Needs the
  "estimate, not a final price" disclaimer + caps.
- Lazy tool loading (docs/plans/cost-controls.md) — `manage_estimator`'s
  spec schema is the largest declaration in the registry now.
- Photos as an assist input (Gemini vision) once the metered path is
  proven.
