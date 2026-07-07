# Cost controls — AI / storage / email

Status: **PLANNED, not built** (2026-07-07). None of this is needed until the Hub has
regular real users. Build it when flipping Gemini to the paid tier, or when the first
outside tester starts using Atlas daily — whichever comes first.

## What things actually cost (measured 2026-07-07)

Atlas's static payload — system prompt (~1,850 tokens) + all 60 owner tool
declarations (35,124 chars ≈ 8,781 tokens) — is **~10,600 tokens resent on every
Gemini call**. A typical message runs ~3 tool rounds ≈ 40k input + 1–2k output tokens.

On paid Gemini 2.5 Flash ($0.30/M input, $2.50/M output) that's **~2¢ per message**
uncached. Outlier action: drafting a full agreement body (~12k output tokens ≈ 3¢,
re-billed as input if the chat continues).

Generous per-client-per-month estimate:

| Component | Power-user ceiling | Realistic |
|---|---|---|
| Atlas chat | ~$17–20 (≈1,000 msgs) | $2–4 (100–200 msgs) |
| Setup wizard | ~$0.25 one-time (grounding) | ~$0 |
| DB storage (Railway) | ~$0.03 | ~$0.01 |
| Email (Resend) | ~$0.50 (after $20/50k tier) | $0 (free until 3k/mo total) |

AI is >95% of marginal cost and the only component that scales with usage. The Hub is
free, so Atlas is per-user cost with no revenue attached — hence the cap below.

## Planned controls, in build order

### 1. Per-company daily Atlas message cap — **30/day** (David's number)
- Enforce in `app/api/app/assistant/route.ts` before calling Gemini.
- Count = assistant runs per company per calendar day (company timezone). Simplest
  storage: a small `AssistantUsage` table (companyId, day, count) upserted per run —
  or a count on Company reset by the existing cron.
- Over cap → friendly 429-style reply in the drawer: "Atlas has hit today's message
  limit for your company — resets at midnight." No Gemini call made.
- 30/day is generous for legit use (worst case ≈ $0.60/day/company uncached, ~$0.20
  cached) while killing the scripted-abuse scenario.
- Consider exempting/raising for the demo company so live demos never hit it.

### 2. Log Gemini `usageMetadata` per company
- Gemini responses include `usageMetadata` (promptTokenCount, candidatesTokenCount,
  cachedContentTokenCount). Sum across rounds in `runAssistant` and persist per
  company (same `AssistantUsage` table: add tokensIn/tokensOut/tokensCached columns).
- This gives real per-client cost instead of estimates, spots outliers before the
  bill does, and **verifies implicit caching is actually hitting** (cachedContentTokenCount > 0).
- Do this BEFORE or at the paid flip.

### 3. Verify implicit caching (free 75% off cached input)
- Gemini 2.5 Flash auto-discounts repeated request prefixes (min 1,024 tokens). Our
  ~10.6k static prefix qualifies **only if byte-identical between calls**:
  - System prompt must contain nothing that changes per-message. Date-only is fine;
    a timestamp with minutes would break it. (Check `systemPrompt()` in
    `lib/assistant/index.ts` when touching it.)
  - Tool declaration order must be stable (it is — assembled statically per role).
- Expected effect: ~2¢/msg → ~0.7¢/msg; power-user ceiling $17–20 → $6–8.
- No code needed if the prefix is already stable — just confirm via #2's
  cachedContentTokenCount.

### 4. Google Cloud budget alert
- Set a ~$25/mo budget + email alert on the Gemini project when flipping to paid.
  Zero code, catches surprises.

### 5. Trim chat history 20 → 10–12 messages, clamp per-message length server-side
- History is the input segment caching can't help. `AssistantDrawer.tsx` sends the
  last 20 client-side messages; route should also clamp count and per-message chars
  (client is not trustworthy). ~10–15% input savings.

### 6. Email dedupe guard (when reminder volume grows)
- Ensure the reminder cron sends once per invoice/visit (sent-flag on the record),
  never once per cron run. This is the only way email spend goes wrong by accident.
- Ride Resend's free tier (3k/mo, 100/day) until combined tenant volume crosses it;
  the $20/50k tier makes marginal email cost negligible (~$0.04 per 100).

## Deliberately NOT doing
- **Shrinking tool declarations** (~30% possible by terser descriptions): real work,
  savings mostly mooted by caching, and terse descriptions hurt tool-selection accuracy.
- **Downgrading Atlas to flash-lite**: 60-tool routing accuracy isn't worth pennies.
- **Storage optimization**: per-tenant data is pennies; ignore until proven otherwise.
