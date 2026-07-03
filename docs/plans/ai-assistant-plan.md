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
