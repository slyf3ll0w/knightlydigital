# Pre-production code audit — 2026-09-18

Trigger: David — "I want to do a code audit for Workbench to work out bugs and
inconsistencies so I feel better about pushing it to production."

Repo at `88df804` (main). Scope = what no reviewer has read yet. The ops-flow
review (`ops-flow-review-2026-09-15.md`) shipped all five batches on 09-16 and
had its own four-reviewer pass, so those flows are NOT re-audited here.

## Baseline (run locally at 88df804)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean (after `npx prisma generate` — the packaging board added two models; a stale local client shows 35 phantom errors) |
| `npm run test:unit` | 10/10 scripts, all tests green |
| e2e | not run locally (staging pipeline is the gate) |

## Slice 1 — auth / identity / onboarding (713cb59..HEAD)

Files: `lib/auth-options.ts`, `lib/social-login.ts`, `lib/google-id-token.ts`,
`lib/native-google-signin.ts`, `lib/account.ts`, `lib/permissions.ts`,
`middleware.ts`, the Google/invite/apply/reset/verify components and routes,
`app/platform/get-started`, calendar OAuth connect/callback.

1. **Tier 1 — CONFIRMED — "Connect Google" honours an evicted session and needs no password re-auth; a password reset never revokes a linked identity.**
   `app/api/auth/[...nextauth]/route.ts:14-21` builds the OAuth link context straight from the raw JWT (`accountId`, `companyId`). `lib/auth-options.ts:201` sets `linkIntent = Boolean(currentAccountId && currentCompanyId)`; `lib/social-login.ts:122-125` then welds the new Google `sub` to that account with no further proof. Neither compares `token.authAt` with `Account.passwordChangedAt` — the eviction rule every other path enforces (`lib/permissions.ts:90-93`, `register/route.ts:51-56`, `apply/route.ts:84-93`). `AccountIdentity` rows are only ever deleted by `unlinkIdentity`.
   Trigger: someone holds a copy of a victim's session cookie (stolen, or a borrowed unlocked device). Victim runs Forgot-password → every page and `/api/app/*` now 401 the attacker → attacker POSTs the dead cookie at `/api/auth/signin/google` → their Google account is linked to the victim's account and signs in indefinitely, surviving the reset. Linking is also the only identity mutation without a `currentPassword` step (email change and password change both require it). Existing mitigation: `signInMethodLinkedEmail` goes to the victim's inbox, and the Connected sign-ins card can disconnect.
   Fix: in `[...nextauth]/route.ts`, after `getToken`, load `account.passwordChangedAt` and pass a null context when `token.authAt < passwordChangedAt`. Require `currentPassword` for the link when the account has a hash (web button behind a re-auth step; `POST /api/app/profile/identities` for native). Have the reset path delete `AccountIdentity` rows, or list them in the "password changed" email.

2. **Tier 2 — PLAUSIBLE (needs Turnstile fully configured) — /apply and /invite submit buttons don't wait for the captcha token; each early click burns a 3/hr rate-limit slot.**
   `components/ApplyForm.tsx:644` `disabled={loading || codeState === "checking"}`; `components/InviteSignupForm.tsx:319` `disabled={loading}`. Login (`LoginForm.tsx:271`) and register (`register/page.tsx:302`) gate on `captchaEnabled && !captchaToken` for exactly this reason. `apply/route.ts:62` 400s on a missing token; the `apply` bucket is 3/hr/IP (`middleware.ts:108-112`).
   Trigger: invisible challenge takes a few seconds (up to the 20 s watchdog in the mobile shell); user taps "Create my account" twice → two 400s → the third try is their last before a one-hour 429 on their very first signup.
   Fix: add `|| (captchaEnabled && !captchaToken)` to both `disabled` expressions.

3. **Tier 3 — PLAUSIBLE — the login captcha-skip window is an enumeration side channel and adopts legacy rows before the captcha runs.**
   `lib/auth-options.ts:68-95`: `findOrAdoptAccountByEmail` (a DB write for pre-Account rows, `lib/account.ts:77-84`) runs before the captcha; `justRegistered` is true when `fresh(account.createdAt)` OR `fresh(user.createdAt)`. A legacy User with `accountId: null` gets its Account created by the probe itself → `fresh` → captcha skipped → generic `CredentialsSignin`, while a nonexistent email with the same junk token gets `?error=captcha`. Bounded by the 5/15-min login bucket; only matters if `scripts/backfill-accounts.mjs` hasn't run on prod.
   Fix: only treat `fresh(account.createdAt)` as a bypass when the Account pre-existed the call; drop the `user.createdAt` clause unless teammate-add auto-signs-in.

4. **Tier 3 — CONFIRMED — `/api/auth/callback/google-native` has no rate limit.**
   `middleware.ts:350` matcher lists only `/api/auth/callback/credentials`. The native provider runs `jwtVerify` (JWKS cached) and on a valid token up to ~6 DB round-trips including `prisma.user.create` (`lib/social-login.ts:209`). Not a guessing vector; low.
   Fix: add the path to the matcher with a JSON-429 rule (the client uses `redirect:false`).

5. **Tier 3 — CONFIRMED — `/api/public/apply` reveals account existence before the deliberately generic password path.**
   `apply/route.ts:154-168`: signed-out caller with an `AccessApplication` whose `companyId != null` gets 409 "already applied … account is open" — after the captcha but before the generic "Unable to sign you up" at `:181-191`. Side effect: the "existing login + typed password → second company attaches" path (`:170-193`) is unreachable for anyone whose first company came through /apply.
   Fix: fold the applied-check into the password branch (409 only after the password matched), or return the generic message.

6. **Tier 3 — PLAUSIBLE — double-submit from one company-less Google session can orphan a company.**
   `lib/signup.ts:117-124` finds the placeholder row, `:154` skips creating an owner, `:162-168` re-points the placeholder — check-then-update across two concurrent transactions that both pass `apply`'s JWT-based 409. Second txn wins the placeholder; first company has zero members. Only the client `loading` flag guards it.
   Fix: `tx.user.updateMany({ where: { id: placeholder.id, companyId: null }, data })` and throw on `count === 0`.

Looked solid: linkIntent rules on every door (company-less sessions can never be bound to); rule-3 email match requires `email_verified`; native ID-token verification (JWKS, both issuers, audience, exp, sub); password reset (32 random bytes, SHA-256 at rest, atomic consume before write, 1 h expiry, eviction via `passwordChangedAt`); email change (current password, old inbox notified, POST-not-GET); tenant isolation (`loadActor` returns null actor when `companyId` is null, no `/api/app` route reads `session.user.companyId` directly); middleware gates; invite codes claimed via `updateMany(usedAt: null)` inside the signup transaction; captcha before verdict on register and apply; calendar OAuth state HMAC-bound to userId with 10-min expiry.

## Slice 2 — hub, platform shell, superadmin packaging, CI (e27d24f..HEAD)

1. **Tier 2 (secrets, bounded) — CONFIRMED — failed e2e runs publish the minted staging owner session cookie as a public workflow artifact.**
   `.github/workflows/e2e-staging.yml:69-77` uploads `e2e/report` + `e2e/artifacts` on failure (14-day retention). `playwright.config.ts:19,26` puts traces there with `trace: "retain-on-failure"`. Specs attach the minted NextAuth JWT as a cookie (`e2e/specs/smoke.spec.ts:15`). Playwright's trace HAR recorder runs without `slimMode`, so the raw `cookie` header lands in every trace network entry. Repo is PUBLIC.
   Bound: the JWT is minted with a 4 h `maxAge` (`e2e/global-setup.ts:52`) and only resolves on the staging DB. Blast radius = the two throwaway staging tenants, unless E2E is ever pointed at prod.
   Fix (one line): `trace: process.env.CI ? "off" : "retain-on-failure"`, or drop `e2e/artifacts` from the upload step.

2. **Tier 2 (cosmetic) — CONFIRMED — the packaging lane dialog pins every saved column to blue; the orange add-on default is unreachable.**
   `PackagingClient.tsx:556` `useState(lane?.accent ?? BLUE)` and `:566` always sends `accent`; the lane routes store it. Any Save (even a rename) on a lane whose accent is null writes `#0B57D8`, so `laneAccent()`'s orange for ADDON never shows and null can never be restored.
   Fix: initialise to `lane ? lane.accent ?? laneAccent(lane) : ""`, send `accent` only when touched.

3. **Tier 3 — CONFIRMED — concurrent first opens of the packaging board 500 / double-seed.**
   `lib/packaging-board.ts:72-82` `createMany` has no `skipDuplicates` while `PackagingCard.catalogKey` is `@unique`; `page.tsx:13` awaits `syncCatalog()` on every render. Two superadmin tabs opened together after a catalog addition → P2002 → 500. `seedIfEmpty` (:37-43) has the same race and no unique to trip, so it silently creates two backlogs.
   Fix: `createMany({ …, skipDuplicates: true })`; re-check the count inside a `$transaction` for seeding.

4. **Tier 3 (money, latent) — CONFIRMED — `scripts/set-ci-secrets.sh` copies PRODUCTION Finix credentials into a public repo's CI.**
   `:15,22-24` reads `--environment production` for the Finix trio. Comment says "production runs sandbox today". When prod flips to live keys and someone re-runs the script for an unrelated rotation, live keys land in GitHub secrets and the card specs start moving real money.
   Fix: read the Finix trio from staging, `pick FINIX_ENVIRONMENT` and abort unless `sandbox`.

5. **Tier 3 — CONFIRMED — optimistic drag on the packaging board has no rollback.**
   `PackagingClient.tsx:144-149` `setLanes(next)` then `void send(...)`; on failure the banner shows but the card stays moved until reload.
   Fix: capture `prev`, `if (!(await send(...))) setLanes(prev)`.

6. **Tier 3 — PLAUSIBLE — e2e-staging false red on back-to-back pushes.**
   `e2e-staging.yml:12-14` `cancel-in-progress: false`; Railway supersedes the earlier deploy, so the run waiting for the overtaken SHA polls the full 20 min and exits 1, then blocks the newer run. Loud, not silent.
   Fix: `cancel-in-progress: true` for this group, or short-circuit when the live commit is a descendant of `GITHUB_SHA`.

7. **Tier 3 — CONFIRMED (found directly) — dashboard greeting uses the server clock, not the company timezone.**
   `app/platform/dashboard/page.tsx:97` `const now = new Date()`, `:452-453` `now.getHours()` → "Good afternoon" at 11 am Central on a UTC Railway box. The hero already has `heroCompany?.timezone` at `:435`.
   Fix: derive the hour with `Intl.DateTimeFormat` in the company timezone, or render the greeting client-side.

Looked solid: hub tenant isolation (all six pages resolve `contact` by `hubToken` and read only through relations; `/api/hub/requests` derives ids from the token, rate-limits per token and per IP); superadmin gating (all 7 packaging handlers call `getSuperadmin()`, page under `requireSuperadminPage()`, board tables hold no tenant data, inputs capped, BACKLOG immovable); health endpoint (one indexed-row read for `?cron=1`); CI (placeholder secrets only, SHA-only echo, `curl -f` treats 503 as not-up-yet, branch guard also skips manual dispatch); platform shell (no server/client boundary mistakes, `x-wb-path` overwritten by middleware so the standalone set can't be spoofed, `leaveDeletedRecordPage` only redirects when the deleted id is in the path).

## Slice 3 — consistency (re-verified `ux-consistency-audit-2026-09-03.md` at 88df804)

Batch F1 + F2 (list sort + FilterBar) shipped. Batches 1–5 still open; every grep count has grown since 09-03:

| Verification grep | 09-03 | 09-18 |
|---|---|---|
| `const inputCls` files | 17 | 15 |
| `toFixed(2)` in tsx | 18 | 46 |
| `text-xs` + `text-gray-400` pairs | 122 | 180 |
| `text-[10px]`/`[11px]` | 129 | 174 |
| `router.refresh()` / toast calls | 96 / 7 | 137 / 16 |
| `role="alert"` | 0 | 0 |
| `useUnsavedWarning` users | 0 | 0 |
| `window.confirm` stray | 1 (ManageBooking.tsx:137) | 1 (same) |
| Lists with `loading.tsx` + search | 5 of 13 | 5 of 13 |
| "Agreements" vs "Contracts" in the same rail | yes | yes (`AppShell.tsx:166,182`) |
| Business hub page that is only a menu | 114 lines | 115 lines |

Still no `<Button>`, `<Field>`, `<FormError>` primitives (`components/Input.tsx` only). The Recurring list query (`subscriptions/page.tsx:12`) is still unbounded.

## Fix plan (decide once, then batches)

**Batch 1 — before the next prod push (½ day).** Slice 1 #1 (eviction check + password re-auth on link + reset revokes identities); Slice 2 #1 (traces off in CI); Slice 1 #2 (captcha gate on apply/invite buttons); Slice 2 #4 (Finix trio from staging + sandbox assert). Tests: unit for the eviction rule; e2e signup-doors already covers the buttons.

**Batch 2 — same week (½ day).** Slice 1 #4 #5 #6; Slice 2 #2 #3 #5 #7. Tests: `test-ops-guards.ts` gains the placeholder claim; packaging sync idempotency.

**Batch 3 — consistency Batch 1 from the UX doc (1 day, zero risk).** Vocabulary + nav + settings index + Insights in nav.

**Batch 4 — consistency Batches 2–4 (4–5 days).** Primitives, list-page parity, forms. Verification targets unchanged from the UX doc.

**Deferred.** Slice 1 #3 (only if `backfill-accounts.mjs` hasn't run on prod — check); Slice 2 #6 (CI ergonomics); UX Batch 5 (Inbox, product call).

## Housekeeping noticed

- `e2e/specs/zz-verify-routes.spec.ts` (2026-09-10, header says "TEMP deploy verification for 03f8506 (deleted after the run)") and `scripts/_q_decl.tmp.ts` (2026-09-02) are untracked leftovers — delete.
- `docs/plans/business-line-2026-09-15.md` and `docs/plans/play-assets/` are untracked and unpushed.

Progress log (append as batches ship):
- 2026-09-18 audit written.
- **2026-09-18 Batch 1 (ac353e4)** — Slice 1 #1: `lib/link-grant.ts` + `POST /api/app/profile/identities/grant` (password re-entry mints a 10-min account-bound cookie); the NextAuth handler only passes a link context when the session is a company session, minted after `passwordChangedAt`, and carries a valid grant (password-less logins skip the grant); native `POST /identities` requires `currentPassword`; the Connected sign-ins card asks for the password before Connect. Slice 1 #2: captcha-gated submit on /apply + /invite. Slice 2 #1: `trace: process.env.CI ? "off" : …`. Slice 2 #4: `set-ci-secrets.sh` reads Finix from staging and aborts unless `FINIX_ENVIRONMENT=sandbox`. Test: `scripts/test-link-grant.ts` (9).
- **2026-09-18 Batch 2 (b3a6278)** — Slice 1 #4 `login-native` bucket (20/15 min) + matcher; #5 applied-check moved behind the password with the generic message; #6 `updateMany({ companyId: null })` claim → `PlaceholderClaimedError` → 409 on both signup routes. Slice 2 #2 lane dialog sends `accent` only when touched and shows the kind's default; #3 `skipDuplicates` + serializable seed with P2034 retry; #5 drag rollback on a failed save; #7 dashboard day/week/month/greeting/date labels via new `lib/timezone.ts` helpers (`zonedParts`, `zonedMidnight`, `startOfDayIn/WeekIn/MonthIn`) — the "today" window was also UTC, not just the greeting. Test: `scripts/test-timezone.ts` (15).
- **2026-09-18 Batch 3 (24d22bc)** — UX A1/A3/A4: "Agreement templates" (settings) vs "Agreements" (issued); "Services" everywhere; "Booking & forms" in settings; "Recurring" section / "plan" noun (New plan, Plan name, Start plan); Business group = Overview + Insights + Expenses + the four settings pages with the same labels as the Settings index; `lib/mobile-nav.ts` labels + roots follow; Overview hub stats on company time.
- **2026-09-18 Batch 4 (this commit)** — UX B/C/D primitives: `.btn-primary` (+ `.btn-sm`/`.btn-lg`), `.form-error`, `.text-meta` in `globals.css` (phone block mirrors the tool-button press physics); codemod turned 103 hand-typed green CTAs into `btn-primary` (11 left: icon-only, FAB, badge, two responsive hybrids) and 40 red banners into `role="alert" className="form-error …"`; `text-xs text-gray-400` → `gray-500` (180 → 43 pairs; the rest are split across attributes); `lib/format.ts` (`fmtDate`, `fmtDayShort`, `fmtDayLong`, `fmtTime`, `fmtDateTime`, `fmtPhone`) with phones formatted on the contact, job, appointment and people cards; `money()` replaces the 12 `toFixed(2)` totals on the quote/invoice/job editors and the item picker; `components/Input.tsx` exports `inputCls` / `inputClsAuto` and all 15 local constants import it; `loading.tsx` on all 13 list pages; the last `window.confirm` (ManageBooking) uses `confirmSheet`. Verified: tsc clean, 12/12 unit scripts, Tailwind compiles the new classes.

- **2026-09-18 Batch 5 — "Verify it's you"** (David's prod test: a Google-only login couldn't delete its account because delete demanded a password it never had). Replaced the Batch 1 link grant with a general recent-authentication step, the way Google / GitHub / Apple gate account changes: `lib/reauth.ts` (10-min account-bound HMAC grant + intent cookie), `POST /api/app/auth/reauth` (password, native Google ID token that must belong to this login, or `start` for the web Google round-trip — the OAuth callback mints the grant when the identity is the session's own and returns to `?reauth=ok`), `proveIdentity()` on company delete, email change, password set/change, provider connect/disconnect. UI: `components/VerifyIdentity.tsx` (`useVerifyIdentity` hook + dialog: password and/or "Continue with Google", web round-trip resumes via sessionStorage), `components/SignInMethodsCard.tsx` replaces the Connected sign-ins card with a Password / Google / Apple (coming) list — a Google-only login sets its first password here instead of via Forgot password; the Danger Zone asks to verify instead of showing a password field. Rate limit `reauth` 10/15 min. Test: `scripts/test-reauth.ts` (20) replaces `test-link-grant.ts`.

- **2026-09-18 CI**: Slice 2 #6 fixed — `e2e-staging.yml` cancels in-progress runs on a newer staging push, and a run whose commit is already contained in the live (newer) deploy passes as "superseded" instead of polling 20 min and failing (this was the red notification David got after the two-commit push).

Still open from the UX audit after Batch 4 (needs product decisions or per-page server work): toast on every mutation (no toast primitive exists yet); search + CSV export on the eight lists that lack them; `useUnsavedWarning` wiring (no editor tracks a dirty flag today); one required-field convention; the Inbox merge (UX Batch 5); `rounded-lg` vs `rounded-[10px]` normalisation; the 22 remaining `toFixed(2)` are input values and helpers, not display.
