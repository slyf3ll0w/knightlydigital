# Atlas, the client-facing surfaces, and the phone header (2026-10-22)

David raised three things on 2026-10-22. This doc records what was found,
what shipped on branch `atlas-smarter`, and the plan for the rest.

1. Atlas refused "assign all my active clients to the client field I just
   made" — it needs that tool, a tool for almost everything, and a view on
   whether Atlas can become the way owners who hate software run WorkBench
   (voice included).
2. Client-facing UI (quotes, invoices, website forms, client portal,
   booking confirmations, emails) looks AI-generated. How do we get it on
   par with, and better than, the app itself?
3. A long quote/invoice title overlapped the buttons in the phone header.

---

## 1. Atlas

### Why it said no

Three things stacked up:

- **No tool took a custom-field value.** `manage_client_fields` could
  create the field; `update_client` only knew name / email / phone /
  address / notes. The PATCH route it posts to already accepted
  `customFields`, so the gap was purely in the tool surface. The model
  answered honestly: it had nothing to call.
- **The prompt gave it permission to say no.** The can't-do list
  ("uploading a logo, importing a CSV …") plus "NEVER refuse doable work"
  left a hole for things it merely *thought* it had no tool for, and no
  procedure for what to do instead.
- **The model is small.** Atlas runs `gemini-2.5-flash` with a 1,024-token
  thinking budget (`lib/assistant/index.ts`). With 105 tools in context, a
  Flash-class model reaches for the first tool whose name matches and
  gives up when none does; it does not compose (query → per-record update)
  unless the prompt spells the recipe out.

### Shipped on this branch

| Change | Where |
| --- | --- |
| `update_client` takes `fields: { "<label>": "<value>" }` — labels resolved to field ids (case-insensitive, fuzzy), SELECT options and NUMBER/DATE shapes checked, empty string clears. One call per client; the drawer already merges same-kind cards into one Confirm, so a 200-client fill is one button. | `lib/assistant/clients.ts` |
| `query_records` entity `clients` takes `field` + `fieldValue` (`"empty"` = not filled yet) and returns that field's value on every row. | `lib/assistant/records.ts` |
| `get_client_details` returns custom fields **by label**, every active field listed (null when blank) instead of a raw `{ cuid: value }` map. | `lib/assistant/client-extras.ts` |
| New `manage_task` — list / create / complete / reopen / update / delete on the Tasks page. Atlas had no way to touch tasks at all ("remind me to call Sarah Friday" went nowhere). | `lib/assistant/tasks.ts` |
| New `request_ability` — the honest fallback. When nothing covers the ask, Atlas says what it *can* do, does that, and stages a card that files the request as a SUGGESTION feedback ticket (lands in the superadmin console). Every unmet ask becomes a to-do for us instead of evaporating. | `lib/assistant/gaps.ts` |
| Prompt: a "never say I can't on reflex" rule with the search order (generic tools first, then the honest fallback), a custom-fields recipe including the bulk fill, and a tasks rule. | `lib/assistant/index.ts` |

Registry test updated (`npx tsx scripts/test-assistant.ts`, 105 tools; tech
and sales gating unchanged — tasks and request_ability are open to every
role, both routes re-check server-side).

### What Atlas still cannot touch (the gap list)

Found by diffing `/api/app/*` against the tool registry. In rough order of
how often an owner would ask:

| Ask | Today | Size |
| --- | --- | --- |
| "Text the Hendersons that we're running late" (a plain SMS, not a portal reply) | `reply_in_portal` posts to the thread, which mirrors to SMS when the line is active — works, but the name hides it. Rename/alias to `message_client` and say "sent as a text" in the card. | ½ day |
| "Who called this morning?" / "Call Maria back" | No call tools. Add `list_calls` (read `/app/calls` rows: who, when, outcome, voicemail, Atlas notes) and `place_call` (stages `POST /api/app/line/call`). | 1 day |
| Job photos ("show me the before photos from the Smith job") | Nothing. Read-only `list_job_photos` returning authed URLs is cheap; upload stays on the page. | ½ day |
| Website (`/app/settings/website`, client sites) | Nothing. `manage_website` for copy/section edits once the sites lane is stable. | 2 days |
| Estimate Library (borrow/share tools) | Nothing. `browse_library` + `install_estimator`. | ½ day |
| Notifications / team chat history | `post_team_message` writes; no read. Add `read_team_chat`. | ½ day |
| Sticky notes | `add_sticky_note` only; no list/edit/remove. | ½ day |
| Booking-page look (theme, font, accent) | `manage_booking_item` does items, `update_company_settings` doesn't take `bookingPage`. | ½ day |
| Attachments on quotes/invoices, agreement PDFs | Read-only links only. | — |

Budget: about five working days clears the whole table.

### Making Atlas actually smart (not just complete)

Tools are necessary, not sufficient. In order of leverage:

1. **Model.** Move the drawer to a Pro-class model (`AI_MODEL_ASSISTANT` is
   already a Railway variable). The cost is roughly 5–8× per token on
   input; a typical turn today is ~1¢, so ~5–8¢. Atlas tokens already meter
   spend, so heavy users pay for it. Keep Flash for `atlas-oneshot`
   (drafting, summaries). Expect the biggest single jump in "it figured out
   what I meant."
2. **Raise the thinking budget** for turns that call tools (2048–4096);
   leave it low for plain questions. One env var today, could be dynamic.
3. **Few-shot the compositions.** The prompt now carries the custom-field
   recipe; add four or five more worked examples of multi-tool jobs (bulk
   price increase, "close out Friday", "chase everyone over 30 days") so the
   small model copies a pattern instead of inventing one.
4. **Eval harness.** `scripts/test-assistant.ts` tests gating, not
   behaviour. Add 30 real asks (David's "assign all active clients to the
   field" first) with the expected tool calls, run nightly against the live
   model, fail the build when a known-good ask regresses. Without this,
   every prompt tweak is a guess.
5. **Read the gap tickets weekly.** `request_ability` makes the backlog
   write itself.

### Atlas for people who hate software

The pitch: *you never have to learn WorkBench; you talk to Atlas and it
drives.* The pieces that make that true, cheapest first:

- **Push-to-talk in the drawer (1–2 days).** A mic button; audio goes to
  the model as audio input (Gemini takes audio natively, no separate
  transcription step), Atlas answers in text and, optionally, speaks the
  reply back (browser TTS or the model's audio out). Works on the phone app
  today — the Capacitor shell already has mic permission for the softphone.
  This alone covers "I'm in the truck, quote the Hendersons $450 for the
  spring cleanup and send it."
- **Call Atlas on the business line (3–4 days).** The owner calls their own
  number (or a second "assistant" number); the line already runs through
  Telnyx Call Control. Fork the audio with Telnyx media streaming (or the
  Telnyx AI Assistant product) into a Gemini Live / realtime session with
  the same tool registry. Writes still stage cards — Atlas reads them back
  ("I'm sending Maria a $450 quote — say yes to send") and a spoken yes
  confirms. This is the no-screen version: a plumber with wet hands books a
  job from a flip phone.
- **Text Atlas (2 days).** Inbound texts to the business line from the
  owner's own cell (`User.phone`) route to Atlas instead of the client
  inbox. "atlas: what's tomorrow look like" → the day's schedule back as a
  text. Zero UI.
- **Morning brief (1 day).** `whats_needing_attention` as a 7 am push /
  text: three lines, each a tap into Atlas with the next action staged.
- **Photo-of-paper intake (2 days).** Snap the paper invoice / the
  handwritten estimate; Atlas reads it (vision) and stages the record. This
  meets the pen-and-paper crowd exactly where they are.
- **Proactive Atlas (later).** Automations already fire on events; let
  Atlas author the *message* in each ("quote sat a week → Atlas drafts the
  nudge in the owner's voice and asks before sending").

Recommendation: push-to-talk first (it is the cheapest way to learn whether
owners will talk to it), the morning brief second, the phone-call Atlas
third. Model upgrade before any of them.

---

## 2. Client-facing surfaces

### What's there (survey 2026-10-22)

None of the pages a *client* sees use the app's design system. They sit on
the older `globals.css` layer (`.app-ui`, `.card-ledger`, `.stamp`, the
green bridge), with three competing brand-color helpers (`lib/branding.ts`,
`lib/hub-brand.ts`, `lib/ds-theme.ts`) that disagree on when a color is
"too light," and four fonts across the set (Inter + Lexend on the web,
Helvetica in PDFs, the system stack in email, any Google font on booking
pages).

| Surface | Files | Styling |
| --- | --- | --- |
| Quote accept, Pay | `app/quote/[token]`, `app/pay/[token]`, `components/paper-doc.tsx` | Paper letterhead (the good one) |
| PDFs | `lib/pdf.tsx` | react-pdf, Helvetica, same letterhead idea |
| Booking menu / stepper / request forms / instant estimate / manage booking | `app/book/[slug]/**`, `components/PublicEstimateForm.tsx`, `EstimatorRunner.tsx` | Six copies of the same `card`/`input`/`choiceCls` ternaries, hard-coded hexes, `focus:ring-green-500` (not the brand) |
| Client hub, portal login, message viewer | `app/hub/[token]/**`, `app/portal/[slug]`, `app/message/[token]` | Three hand-copied 135° gradient heroes, one with a dot grid |
| Agreement e-sign | `app/contract/[token]` | Centered logo over a card, own header |
| Emails | `lib/email.ts` (1,970 lines) `clientShell()` | Inline styles; two outliers skip the shell entirely |
| SMS | `lib/sms.ts` | Plain strings (fine) |

The copy is not the problem (no emoji, no "we're excited"). The *layout
vocabulary* is: gradient heroes, centered success cards with a tinted
check circle, "Hi {firstName}", everything centered, everything rounded,
every surface designed alone.

### Why it reads as generic

1. **No point of view.** The app has one (ledger rows, Lexend, the two
   brand colors, explanations in an (i)). The client pages have whatever
   each session reached for.
2. **The tenant's brand is a tint, not a system.** One accent swatch on a
   button. A real branded document uses the brand in the letterhead,
   rules, numerals and stamps, and nowhere else.
3. **Three gradient heroes.** The single most "template SaaS" tell.
4. **Success states throw the document away** for a gray card that says
   "Quote approved!" — the client just made a decision and the page that
   mattered vanished.
5. **Email ≠ web ≠ PDF.** The same quote looks like three products.

### The fix: one Client Kit

Build the client-facing design system the way the app's was built, then
roll every surface onto it. The spine already exists: `paper-doc.tsx` +
`lib/pdf.tsx` + `clientShell()` share one letterhead language and are the
best-looking things a client sees today.

**Principles (the client-facing rules, to go in `docs/design-system.md`):**

- *The business is the brand, WorkBench is the paper.* Tenant logo, name,
  two colors. WorkBench appears once, small, at the foot.
- *Documents look like documents.* Letterhead top-left, document type and
  number top-right, a single brand rule, a totals ledger, a stamp for
  state (Approved / Paid / Signed). Same on web, PDF and in the email.
- *Forms look like a good intake clipboard.* One column, one question per
  row, labels above, big tap targets, the brand only on the primary button
  and the focus ring. No cards-inside-cards.
- *No heroes, no gradients, no icon-in-a-tinted-circle.* State changes
  stay on the document: the stamp slams on (we already have the animation),
  the primary action becomes the receipt.
- *Lexend for headings and numbers everywhere a font can be chosen*
  (web, PDF via an embedded TTF, email as a web font with a system
  fallback). One numeral style (`tabular-nums`).
- *One brand resolver.* Merge the three helpers into `lib/client-theme.ts`
  (WCAG contrast like `ds-theme.ts`), emitting CSS variables for the web,
  hex for PDFs and email.
- *Copy is the owner's voice, short, second person.* "Your quote from
  Brightwire Electric" not "Quote #1042 has been generated."

**Pieces:**

| Piece | Replaces |
| --- | --- |
| `lib/client-theme.ts` — brand vars + readable-on checks, one source | `branding.ts`, `hub-brand.ts`, the booking `appearanceFor` color half |
| `app/client.css` — tokens scoped under `.client` (type scale, spacing, paper, ledger, stamp, input, button) | the `.app-ui` bits the public pages lean on |
| `components/client/` — `Letterhead`, `DocFrame`, `Ledger`, `Stamp`, `Field`, `Choice`, `PrimaryButton`, `Steps`, `Receipt`, `Footer` | the six copies of card/input/choice, three heroes, per-page success blocks |
| `lib/email-client.tsx` — the same `Letterhead`/`Ledger` rendered to table-based inline-styled HTML (keep `clientShell()` as the outer frame) | hand-written HTML in `lib/email.ts`; the two outliers join the shell |
| `lib/pdf.tsx` restyled to the same tokens with Lexend embedded | Helvetica |
| `/app/design/client` — a gallery page rendering every client surface for a fake company (Brightwire Electric) at phone and desk widths, light brand / dark brand / ugly brand | nothing (today you can only see these by sending yourself a quote) |

**Rollout (each phase ships alone; David reviews on the gallery page first):**

1. Kit + gallery + **quote accept and pay pages** (they're closest already) — 3 days.
2. **Emails** (quote sent, invoice sent, receipt, booking confirmation, reminders, review request, portal invite, the two outliers) — 2 days. Send the full set to a test inbox; screenshot in Gmail, Outlook, Apple Mail.
3. **Booking family** (menu, stepper, request form, instant estimate, manage booking, embeds) — 3 days. This is where "AI-looking" is worst and where most first impressions happen.
4. **Hub + portal login + message viewer** (kill the heroes; the hub becomes a document folder: a ledger of quotes, invoices, visits) — 2 days.
5. **Agreement page + PDFs** — 1 day.
6. Delete the old helpers and the `.app-ui` dependencies — ½ day.

Roughly two and a half weeks, reviewable piece by piece.

**How to make it *better* than the app, not just on par:** the client
pages have one job each and no navigation, so they can afford the touches
the app can't: a real letterhead, generous paper margins, the stamp
animation on every state change, a printable layout that looks
intentional, the business's photo (the Gallery lane) on the hub cover, and
a receipt the client wants to keep. Housecall Pro and Jobber both ship
generic blue templates here; a branded paper document is a visible step up.

---

## 3. Phone header title overlap (fixed)

**Cause.** The collapsed page title that rises into the phone bar was an
absolutely positioned box, centered, `max-w-[55%]`. Its left edge sat at
22.5% of the bar (≈85 px on a 375–390 px phone) while the "‹ Quotes" /
"‹ Invoices" back control reaches ≈110–125 px, so any title long enough to
fill the box ran under the back label; its right edge also kissed the bell.

**Fix (`components/AppShell.tsx`).** The phone bar is now three flex
children: left slot, title, right slot. Both slots are `flex-1 basis-0
min-w-max` (split the spare width equally, never shrink under their own
content); the title is in flow, `min-w-0 shrink truncate text-center`. So a
short title sits dead centre, a long one shrinks and truncates between the
controls and can never overlap them — the iOS nav-bar behaviour. The back
label caps at `38vw`, the top-level company name at `52vw`, so a long
company name can't starve the title either. Desktop bar untouched.

---

## Test recipes

Atlas (any account with Atlas on; create a SELECT field "Tier" with Gold/Silver first, or let Atlas make it):

1. "Set every active client's Tier to Silver." → one combined card listing N clients; Confirm; open two clients, the field reads Silver.
2. "Which clients have no Tier yet?" → a list (query_records fieldValue empty).
3. "Set the Hendersons' gate code to 4471" when no such field exists → Atlas stages *Add client field "Gate code"* and says it will fill it after you confirm; after Confirm it stages the fill.
4. "Remind me to call Maria Lopez Friday at 2" → *Add task* card pinned to Maria, due Friday 14:00, reminder at the time; appears on /app/tasks after Confirm.
5. "What's on my list?" → open tasks.
6. Ask for something impossible ("export my clients to Salesforce") → Atlas says what it can do (CSV export link) and stages *Send this request to the WorkBench team*; after Confirm the ticket shows under /superadmin feedback as "Atlas couldn't: …".

Header (phone, or Chrome devtools at 390 px):

7. Open a quote titled "Kitchen remodel phase 2 — drywall, texture, paint and trim", scroll down until the small title appears in the bar → it is centred, truncated with "…", and never under "‹ Quotes" or the bell.
8. Open a quote titled "Mow" → the small title sits in the exact centre of the bar.
9. A company with a long name, Home page, scroll → the company name truncates and "Home" still fits.

---

## Addendum (same day): Atlas on Claude

David chose Claude Haiku 5.5 for Atlas (he has Anthropic API credits).
Built on the same branch:

- `lib/ai-claude.ts` — Messages API adapter behind `aiChat`: any
  `claude-*` model id routes here, everything else stays Gemini. It
  translates the loop's Gemini-shaped history (tool-call ids, Claude's
  thinking blocks replayed within a turn, synthesized ids for a call Gemini
  made earlier in the same turn), maps tool declarations to `input_schema`,
  derives `output_config.effort` from the old thinking budget, sends no
  temperature (a 400 on the 5.5 models), and puts the cache breakpoint on
  the stable half of the system prompt so tools + instructions are cached
  per company. Usage maps onto the same meter (`tokensIn` = full prompt,
  `tokensCached` = cache reads).
- `lib/assistant/index.ts` — default model is `claude-haiku-5-5` when
  `ANTHROPIC_API_KEY` is set (Gemini 2.5 Flash otherwise);
  `AI_MODEL_ASSISTANT` overrides either way. The system prompt is split into
  a stable half and a volatile half (date, clock, user). The whole assistant
  message is replayed between rounds, not only the calls. The Gemini
  Flash-Lite fallback still catches a Claude outage mid-turn; `lib/ai.ts`
  strips Claude-only parts before Gemini sees them.
- `scripts/test-ai-claude.ts` — pure mapping tests; with `ANTHROPIC_API_KEY`
  set it also runs one live tool round trip on Haiku.

**Turning it on (Railway, staging first):** set `ANTHROPIC_API_KEY`; optionally
`COST_AI_IN_PER_M_CENTS=10`, `COST_AI_OUT_PER_M_CENTS=50`,
`COST_AI_CACHED_PER_M_CENTS=1` so Atlas tokens bill at Haiku's rates
(leaving the Gemini defaults over-charges tenants about 3×). Switch models
without a deploy via `AI_MODEL_ASSISTANT=claude-sonnet-5-5` when Haiku isn't
enough. Remove the key to go back to Gemini.

**Cost picture.** Haiku 5.5 is $0.10 in / $0.50 out per million tokens,
cache reads $0.01: cheaper than Gemini 2.5 Flash ($0.30 / $2.50). A tool
turn today is roughly 25k prompt tokens (mostly cached after the first
call) and 1–3k output, so about 0.1–0.3¢ a turn. $200 of credit is on the
order of 100k Atlas turns.

**What the switch buys.** Haiku 5.5 composes multi-tool work (query → N
updates) far more reliably than 2.5 Flash and follows the never-say-can't
procedure. It does not add tools: the gap list above still stands.

## Addendum (same day): the gap list, closed

David picked "finish Atlas's tool gaps" as the next lane. Shipped on the
same branch (114 tools now; `scripts/test-assistant.ts` updated):

| Ask | Tool | Notes |
| --- | --- | --- |
| "Who called this morning?", "any voicemails?", "what did Atlas note on that call" | `list_calls` (`lib/assistant/calls.ts`) | Same scope as /app/calls; outcome words, talk time, voicemail link, call notes + Atlas notes. Says plainly when the account has no line. |
| "Call Maria back" | `place_call` | Stages `POST /api/app/line/call`; card says the user's phone rings first. Refuses with a reason when the line can't place calls. |
| "Text the Hendersons we're late" | `reply_in_portal` (description + card rewritten) | It already was the text when the line is active; now the card states the route: "sent as a text to (469)…" vs "portal + email". |
| "Show me the before photos" | `list_job_photos` (`lib/assistant/extras.ts`) | Links to `/api/job-photos/<id>`; upload stays on the page. |
| "What did I miss in chat?" | `read_team_chat` | Channel list with unread + last line, or the latest messages in one. |
| "Take down that note" | `manage_sticky_notes` | list / update / delete; author or manager-for-team-notes, same as the page. |
| "Is there a driveway tool I can use?" | `browse_library` | search (+ industry, sort) and add (managers) — a card that copies it into Estimate tools. |
| "Make the booking page dark with our blue" | `update_company_settings` bookingTheme / bookingFont / bookingFontSize / bookingAccent / bookingTitle / bookingDescription / bookingShowBusinessDetails | Merges over the stored look and sends the whole object, as the route expects. |

Still not a tool, on purpose: the website lane (`/app/settings/website`,
unstable), uploads of any kind, connecting processors.

Test recipes (add to the list above):

10. "Who called today?" → the day's calls with outcomes; on an account with no line, a one-line explanation instead.
11. "Call Maria Lopez" → *Call Maria Lopez from the business line* card; Confirm → your phone rings.
12. "Text the Hendersons that we're running 20 minutes late" → card titled *Text …* with "Sent as a text to (…)" on a texting-active account, *Message …* with the portal/email line otherwise.
13. "Show me the photos on job 1042" → list with links; open one.
14. "What did I miss in chat?" → channels with unread counts; "read Everyone" → the messages.
15. "Remove the sticky note about the filters" → list then a red *Remove note* card.
16. "Find me a pressure-washing estimate tool" → Library results; "add the first one" → *Add … from the Library* card; after Confirm it is on /app/estimates.
17. "Make the booking page dark with Lexend and our blue" → *Update company settings* card listing theme, font, accent; /book/<slug> reflects it after Confirm.
