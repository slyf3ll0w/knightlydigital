# AI Setup Wizard — build plan (2026-07-03)

**[SHIPPED + LIVE-VERIFIED 2026-07-03]** — commits 0bbf0a3 (chunk 1: ai.ts /
setup-wizard.ts / generate endpoint / schema), bce2cac (chunk 2: wizard UI),
5085d7d (chunk 3: apply/dismiss + dashboard card + Settings entry), plus a
polish fix (AI durations snapped to review choices; ≤55-char label prompt
rule). Verified end-to-end on production with a fresh throwaway signup
("Pecan Ridge Pressure Washing", deleted after): dashboard card → intake
(prefilled from signup) → live Gemini draft (durations on all 8 seeded
services, 2 new services, Sat hours, 12 correct Collin-County ZIPs,
trade-specific contract + questions) → edits honored (price change, unchecked
items excluded) → apply → checklist → public booking page offered real slots.
Fallback + hostile-payload behavior covered by scripts/test-setup-wizard.ts.

Goal: a "Set up your business in 2 minutes" assistant that turns the thin
signup answers (industry, team size) into a fully personalized, booking-ready
account — drafted by AI, reviewed and edited by the owner, applied through the
existing validated APIs. Strictly an add-on: companies that skip or dismiss it
see zero change, and nothing writes without explicit Apply.

## What already exists (integrate, don't duplicate)

- Signup (`app/api/app/register/route.ts`) already asks industry + team size
  and seeds a canned starter price book (`lib/pricebooks.ts`, 16 verticals,
  prices + costs, **no durations**). "Other" industries start empty.
- Company already has `city/state/timezone/businessHours/serviceZips/
  arrivalWindowMinutes` fields and a default BOOKING WebForm (lazily created).
- Manager-gated CRUD APIs exist for everything the wizard writes:
  work-items, contract-templates, contact-fields, web-forms, settings PATCH.
- All input paths have sanitizers: `sanitizeBusinessHours`, `sanitizeServiceZips`,
  `sanitizeDuration`, `sanitizeBookingForm`, contract/custom-field clamps.

So the wizard is the **personalization layer**: durations + booking-readiness
for the seeded price book, region-aware ZIPs, timezone from city, a
trade-specific contract, trade-specific intake questions, and a filled-in
booking form — plus a full price book for "Other" companies that got nothing.

## User flow

1. **Entry**: dashboard card (managers only, hidden once completed or
   dismissed) + a "Setup assistant" entry in Settings (always available).
2. **Intake**: industry (prefilled from signup, editable, free-text allowed),
   city + state (prefilled if known), service-area radius (my city / ~15mi /
   ~30mi / 50+), team size (prefilled), optional one-sentence description.
3. **Generate**: one Gemini call (`gemini-3.1-flash-lite`, JSON mode) drafts:
   - durations (+ optional description upgrades) for existing price-book items
   - new services (only what's missing; everything for empty books), with
     price/cost/duration/recurringInterval
   - business hours + arrival window (trade norms)
   - service-area ZIP list (from city + radius)
   - timezone (IANA, from city/state — validated with Intl)
   - a contract template using {{client_name}}/{{company_name}}/{{date}}
   - up to 4 booking-form intake questions (custom fields)
   - up to 4 client custom fields (ContactFieldDef drafts)
   - recurring plan ideas (text for the next-steps checklist only — per David,
     subscriptions are NOT auto-created; shown as a checklist suggestion when
     the trade is recurring-friendly)
4. **Review**: every draft editable — services table (checkboxes, price/duration
   inputs), hours grid, ZIP textarea, contract preview, question lists, and an
   "Enable online self-scheduling on my booking form" checkbox (checked by
   default when durations + hours exist). Nothing saved yet.
5. **Apply**: one POST, one transaction, everything through existing sanitizers.
6. **Next steps checklist**: booking-page link + copy-paste embed snippet,
   invite your team (+ mark bookable), import clients (CSV importer),
   recurring-plans suggestion (only when relevant to the trade).

## Technical shape

- `lib/ai.ts` — `askAI({ prompt, system?, maxOutputTokens? })`: fetch wrapper on
  the Gemini REST API. Env-gated like `sendEmail()`: no `GEMINI_API_KEY` → null
  (feature hides). Model from `AI_MODEL` env, default `gemini-3.1-flash-lite`.
  JSON mode (`responseMimeType: application/json`), one retry on parse failure.
- `lib/setup-wizard.ts` — prompt builder, draft schema + `sanitizeDraft()`
  (clamps every field through existing helpers), deterministic fallback draft
  from `INDUSTRY_PRICEBOOKS` + defaults when AI is unavailable/fails.
- `POST /api/app/setup/generate` — manager-only, rate-limited
  (10/company/hour), sends ONLY business facts to Google (industry, city,
  state, team size, description, existing service names/prices) — never client
  data or PII.
- `POST /api/app/setup/apply` — manager-only; validates + writes in one
  transaction: company update (timezone/hours/ZIPs/window/city/state),
  work-item duration updates (companyId-checked) + creates, ContractTemplate
  create, ContactFieldDef creates, default BOOKING form config merge
  (services + selfSchedule + customFields via `sanitizeBookingForm`), stamps
  `Company.setupWizardAt`.
- `POST /api/app/setup/dismiss` — stamps `setupWizardAt` without applying
  (hides the dashboard card; Settings entry remains).
- UI: `app/platform/setup/` — SetupWizardClient (intake → generating → review
  → done/checklist), card-ledger styling throughout.
- Dashboard card on `/app/dashboard` for managers when `setupWizardAt` is null.

## Schema change (single additive column)

- `Company.setupWizardAt DateTime?` — set on apply or dismiss. Pushed to prod
  via the proven `railway run --service Postgres` + `prisma db push` path
  (migrate diff first to confirm additive-only). Deviation from the earlier
  "no schema changes" note: a durable per-company flag beats localStorage
  gating (works across devices/browsers); one nullable column is the cheapest
  correct answer.

## Guardrails

- AI output is never trusted: every field re-sanitized server-side; prices
  clamped 0–100k, durations through `sanitizeDuration` (15–480), ZIPs through
  `sanitizeServiceZips`, timezone Intl-validated, contract/labels length-clamped.
- AI failure → deterministic fallback draft (canned price book + defaults +
  generic per-trade contract + generic questions); the flow never dead-ends.
- Existing WorkItems only ever get `durationMinutes`/`description` updates the
  user approved on review; prices of seeded items are only changed if the user
  edits them (their edits, not AI's, are what apply for existing items).
- Free-tier Gemini may train on inputs → only non-PII business facts are sent.
- No emails sent, no team invites, no subscriptions created — checklist links only.

## Build order

1. Chunk 1: schema push + `lib/ai.ts` + `lib/setup-wizard.ts` (prompt,
   sanitize, fallback) + generate endpoint + manual live-call test script.
2. Chunk 2: wizard UI (intake → generating → review).
3. Chunk 3: apply/dismiss endpoints + dashboard card + Settings entry +
   next-steps checklist.
4. Live verify on production with a fresh throwaway signup; clean up after.
