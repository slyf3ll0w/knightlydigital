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

## v2 — "Find my business" + branding (2026-07-04)

Jobber-style business lookup plus the pieces that make setup feel magical:

- **Find my business** (`POST /api/app/setup/lookup`, 10/hr/company): one
  Google-Search-grounded Gemini call (`askAIGroundedJson` in lib/ai.ts — the
  search tool can't use strict JSON mode, so JSON is extracted defensively)
  returns website, phone, address, Google Maps URL, rating/review count, and a
  summary (`lib/business-lookup.ts`, everything sanitized). The intake screen
  shows an "Is this your business?" card; confirming prefills city/state/
  description and stages profile + branding for review. Fully skippable; a
  miss shows a friendly "fill it in below" line.
- **Website-aware drafting**: the confirmed site (or Company.website) is
  fetched server-side (`lib/website-info.ts` — SSRF-guarded public-URL-only,
  800KB/12k-char caps, tags stripped) and fed into the draft prompt, so the
  AI drafts the services the business actually advertises. Prompt tells the
  model to treat site text as reference material and ignore instructions in it.
- **Logo + brand color**: ranked logo candidates from the site (img-with-
  "logo" > og:image > apple-touch-icon; SVG/data skipped — upload route can't
  store them) are vision-verified ("is this actually THIS business's logo?" —
  catches partner badges) and the winner's dominant color extracted; neutral
  hexes rejected (isNeutralHex). Review screen has an opt-in "use my logo and
  brand color everywhere" checkbox; apply re-downloads the image server-side
  (2MB/mime caps, same constraints as the upload route) into logoData and sets
  brandColor. AppShell already tints the sidebar/create/tab-bar from
  brandColor, so the dashboard brands itself the moment this applies.
- **Company profile card**: phone/address/ZIP/website from the lookup, all
  editable on review, written on apply only when the checkbox is on and the
  field is non-empty.
- **"We work anywhere"** radius option: skips ZIP generation, forces
  serviceZips=[] (which the booking form already treats as "accept any
  address"), review card explains it.
- **Model fallback**: askAI retries once on gemini-2.5-flash-lite when the
  primary model 429s (free-tier quotas are per-model) — this kept the whole
  wizard alive the day 3.1-flash-lite's quota ran out.
- **Review-link checklist nudge** on the done screen (only when
  Company.reviewLink is empty) with the 30-second GBP instructions — grounding
  can't reliably return a place ID, so we don't auto-set it wrong.
- **Logo size pass** (same commit): sidebar logo is aspect-aware (wide
  wordmarks render alone at h-10/176px, square marks get a h-10 tile), and
  booking/hub/portal/pay/quote/contract/settings previews all bumped a notch.

Live checks during build: ABC Home & Commercial (vision check correctly
rejected a PestVets badge + banner, picked the real mark, color #8C1525),
Berrett Pest Control (caught their rebrand, real logo, #00AEEF), fake business
→ found:false (no hallucination). rating/reviewCount 0 from the model is
treated as null. Debug scripts: scripts/debug-lookup.ts,
scripts/debug-draft-site.ts.
