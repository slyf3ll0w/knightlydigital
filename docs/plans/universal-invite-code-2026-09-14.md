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
