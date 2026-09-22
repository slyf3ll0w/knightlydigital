# docs/plans — index

One line per document, grouped by what it is right now. Update the line when a
plan's status changes; a document's own header carries the detail. Living
documents (`roadmap.md`, `ideas.md`, `native-release-queue.md`) never "finish".

## Living documents
- `roadmap.md` — agreed priorities + per-feature "Deferred" notes. Started as JobFlow/Streamflaire Hub; still the place a picked-up idea lands.
- `ideas.md` — parked ideas, not scheduled ("Books" accounting add-on, form-editor UX batch, …).
- `native-release-queue.md` — what waits for the next App Store / Play build (mic permissions, Associated Domains, …). Build mechanics live in `mobile-app-runbook-mac.md`.

## In flight / next up
- `ai-estimators-2026-09-19.md` — **Batches 1–9 LIVE, Batch 10 BUILT 2026-09-22** (the Library: share/browse/like/add + superadmin takedown; builder no longer interviews or invents packages; price-sheet photo; price drivers) (AI-built, code-run estimate tools + `manage_automation` when-this-then-that rules + `lookup_part_price`; Batch 3 = any estimate tool as a website lead-capture form at /book/[slug]/estimate/[tool] + iframe embed, exact/range/hidden price, lead + request + draft/sent quote, running total in the runner; Batch 4 = manual editor + version history, onsite Estimate → Create quote, sections / show-when / pick-several, photo fill-in, Try-it on Atlas cards, lead page attribution; Batch 5 = /app/estimates section: streaming builder + animation, tool cards, Ask Atlas, map-drawn measurements, pictures on options, embed code, Settings entry removed, chat hands new tools to the page); live Gemini walkthroughs owed.
- `business-line-voice-2026-09-18.md` — **tiers 1 + 2 BUILT** (tier 1: whisper + press 1, voicemail, `/app/calls`; tier 2, 2026-09-21: browser softphone — calls ring in the app first, cell after, Call in app, dialer); tier 3 (native ringing with the app closed) planned.
- `telnyx-balance-watch-2026-09-22.md` — **PLANNED, build at launch.** Hourly Telnyx balance read → operator email below a threshold + superadmin banner; Telnyx auto-recharge must be on first. (The same-day out-of-funds handling — QUEUED registrations, tenant-safe messages, operator alert — is built.)
- `business-line-2026-09-15.md` — per-tenant Telnyx number: texting registration (10DLC / toll-free), forwarding, attach, 30-day number rights. **BUILT**; Streamflaire's toll-free verification in review.
- `code-audit-2026-09-18.md` — pre-production audit; batches 1–5 shipped, remaining greps listed in the doc.
- `cost-controls.md` — AI / storage / email spend guards. **Partly built** (per-turn usage logging live; caps not).
- `mobile-app-plan.md` — Capacitor shells. Phase 1 (web push) shipped; iOS on the App Store; Android on Play internal track (see `play-store-listing.md`).

## Shipped (kept for the why)
- `ops-flow-review-2026-09-15.md` — 50 operating-flow findings, all fixed and merged 2026-09-16.
- `scale-and-security-audit-2026-09-08.md` — audit at `cf1576b`; batches A–G shipped same week, deliberately-skipped items listed.
- `scheduling-and-routes-2026-09-09.md` — clock-order month view, day-first Routes, blocks; "Not done" list inside.
- `google-calendar-sync-2026-09-11.md` — ICS feed + Google Calendar push/pull.
- `social-login-2026-09-14.md` — Google sign-in on web; Android native Google ships in versionCode 4.
- `universal-invite-code-2026-09-14.md` — one shared invite code + "online payments coming soon".
- `online-booking-v2-plan.md` — Calendly-grade scheduling (phases A–C, 2026-09-02).
- `online-booking-build-plan.md` — booking v1 (2026-07-03).
- `ai-assistant-plan.md` / `ai-setup-wizard-plan.md` — Atlas stages A–C and the setup wizard (2026-07-03). Test it with `atlas-test-guide.md`.
- `industry-price-books.md` — starter price books at onboarding (2026-06-11).
- `crud-cohesion-overhaul.md` — client/appointment editing gaps (2026-07-02).
- `ux-consistency-audit-2026-09-03.md` — list/detail consistency audit; batches F1 + F2 shipped, rest folded into `code-audit-2026-09-18.md`.

## Reference / runbooks
- `mobile-app-runbook-mac.md` — iOS build + submission steps, § PLAY STORE for Android.
- `play-store-listing.md` — Play Console listing copy; `play-assets/` holds the screenshots and feature graphic.
- `atlas-test-guide.md` — how to exercise Atlas v8 + the token meter on a real account.
- `jobber-parity-plan-2026-07.md` — gap analysis vs Jobber (2026-07-02); research in `docs/jobber-research/`.

## Parked
- `ecommerce-embed-idea.md` — embeddable storefront; not scheduled.
