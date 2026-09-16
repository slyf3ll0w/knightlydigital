# Universal invite code + "online payments coming soon" — 2026-09-14

David's ask: get testers on without minting invite codes. One shared code,
**Workbench123**, bypasses application review and Finix underwriting; anyone
who comes in that way can't connect online payments yet (Settings says
Coming soon) and their client-side invoices never show a pay option.

## How it works

- **`lib/invites.ts`** — `universalInviteCode()` reads `UNIVERSAL_INVITE_CODE`
  (default `Workbench123`; `off` disables it). `checkInviteCode` accepts it
  case- and whitespace-insensitively and returns `{ ok, id: null, universal }`
  — nothing to claim, so it's reusable. Minted single-use codes still work.
  Both entry points (`/api/public/apply` for `/invite`, `/api/app/register`
  for "New company") go through `checkInviteCode`, so the code works on both.
- The company opens exactly like an invite-code signup: `accessPendingAt`
  null (no review), `paymentsWaived: true` (no `/app/activate` gate).
- **`paymentsWaived` now also means "online payments held"** —
  `lib/payments-gate.ts`:
  - `onlinePaymentsHeld(company)` = waived AND not Finix-APPROVED.
  - `canChargeOnline(company)` = the four-part test (Finix, live, merchant,
    APPROVED) that client-facing surfaces share.
- **Settings → Payments** (`GET/POST /api/app/settings/payments`): held
  companies get `{ comingSoon: true }`; the card shows a "Coming soon" pill
  and copy instead of the Finix application; POST answers 403.
- **Pay page** (`app/pay/[token]/PayPage.tsx`): when the company can't charge,
  the remittance stub (amount, method, Pay button) is gone; a "How to pay"
  note with the business's phone/email replaces it.
- **Client hub → Invoices**: the "Save a card" card and the "pay online"
  empty-state copy only appear when the company can charge.
- **Invoice email / text / reminders** (`invoiceLinkEmail`, `invoiceLinkText`,
  `paymentReminderEmail` gain `payable`): button/text say "View Invoice" /
  "View:" instead of "View & Pay". Callers: send-invoice, collect-deposit,
  public quote acceptance, recurring billing, reminder cron.
- Superadmin company page copy explains the waived state and that
  **Require verification** is how a tester graduates: the owner is then held
  at `/app/activate` until the Finix form is done and approved, after which
  every surface switches on by itself.

## Handing out the code

Tell testers: go to **workbenchfsm.com/invite**, enter **Workbench123**
(or send `https://workbenchfsm.com/invite?code=Workbench123`, which
prefills it). `/invite` stays unlisted (noindex, not in the sitemap).

## Not changed / worth knowing

- Receipt emails after a manually recorded partial payment still say "pay the
  remaining balance" (link works, page is view-only). Low traffic; fix if seen.
- Staff-side "Copy payment link" label is unchanged — the link is still the
  client's invoice page.
- `/api/public/apply` is rate-limited 3/hour/IP in middleware, which also
  bounds guessing of the shared code.
- Rotate the code by setting `UNIVERSAL_INVITE_CODE` on Railway; no deploy
  logic depends on the literal.

## Follow-up 2026-09-16 — the code had nowhere to go

A tester was handed **Workbench123**, went to Get started, and still landed on
the Finix underwriting gate; David had to clear the company by hand from the
superadmin console. Nothing above was broken — `/apply`, the door every "Get
started" link on the site and in the app pointed at, simply **had no invite
code field**. Only `/invite` (unlisted) and `/app/register` (invite-only) did,
and the login screen's "Get started free" sent people to `/apply`. Inside the
mobile app that link was worse than useless: `/apply` is outside `/app/*`, so
the native shell hands it to the system browser (`components/NativeShell.tsx`
`shouldOpenExternally`) and the signup finishes outside WorkBench.

Fixed on all three fronts:

- **`components/ApplyForm.tsx`** gained an optional invite-code field
  (prefills from `?code=`, debounced pre-flight against
  `/api/app/invite-check`). A code that checks out folds the screening
  questions away — team size, city/state, payments today, volume, years,
  entity type only ever fed the review and underwriting, and the code decides
  both — and the signup lands on `/app/dashboard` instead of `/app/activate`.
- **`/app/get-started`** (`app/platform/get-started/`) — the same form in the
  app's skin, inside `/app` where the shell keeps it. The login screen and
  `/app/register` now link here instead of `/apply`. Public in `middleware.ts`,
  forced light in `app/layout.tsx`.
- **`POST /api/app/activate/invite`** — an owner already held at the gate can
  redeem a code there (`ActivateClient` grew a "Have an invite code?" box).
  Waives underwriting, clears `accessPendingAt`, marks a PENDING application
  APPROVED, claims a minted code atomically. Rate-limited 10/hr/IP. This is
  the step that used to require David in the superadmin console.

`e2e/specs/signup-doors.spec.ts` covers both doors rendering signed out with
the code field, the in-app link staying under `/app/`, and Workbench123 still
being live — rotate the code on Railway and that last test is where to update it.
