# Sign up → set up payments → in (2026-11-03)

Status: **BUILT on branch `onboarding-square`** (worktree
`~/knightlydigital-wt/onboarding-square`, from origin/staging 1e1f71cd).
David's decision the same day: *"make it to where they have to set up
payments to get access to the software (but not be in your face about it,
it should just be part of the flow)"* — and offer both card-fee models with
the links for both, explained so people can decide.

Companion docs: `onboarding-v3-scope-2026-09-30.md` (the scoping this
closes), `plan-gating-square-billing-2026-10-28.md`, `universal-invite-code-2026-09-14.md`.

## What it looked like before

- `/apply` and `/app/get-started` asked 14 things; seven of them (team
  size, city, state, how you take payment, monthly volume, years, structure)
  fed Finix underwriting and a human review that no longer decided anything
  on Square. The form still said "a person reads every application; your
  account closes if we can't approve it".
- The company opened with `accessPendingAt`; superadmin Sign-ups had Approve
  / Reject; the owner got no email.
- Nothing after sign-up mentioned payments. Connect Square lived only in
  Settings → Payments & accounting; the Home checklist had no payments item.
- The Service fee switch defaulted ON silently, and the single "Create a
  Square account" link followed that hidden default — an owner who wanted
  company-paid landed on the service-fee link and then had to "message us".

## What shipped

**Sign-up (`components/ApplyForm.tsx`, `POST /api/public/apply`).** Seven
fields (name, email, password, business, phone + SMS consent, industry) and
"How did you hear about us?" → `Company.referralSource` (+ the inbox
notice). The invite code is folded behind "Have an invite code?" and opens
itself on `?code=`. No review: `AccessApplication` books APPROVED on
arrival, `accessPendingAt` is never set. `welcomeEmail` to the owner,
"New WorkBench sign-up" to the inbox with a button to the company's
console page. The marketing `/apply` page's three steps read Create your
account → Set up getting paid → You're in.

**The step (`/app/setup/payments`).** `createCompanySignup({ requirePayments })`
stamps `Company.paymentsRequiredAt` (new column) when Square is the live
processor with credentials and no invite code was used. The platform
layout redirects every page to the step while
`paymentsSetupRequired(company)` holds: stamped, not connected, not waived,
not a test account (`lib/payments-gate.ts`). The step renders standalone
and light like `/app/activate`:

1. **Who pays the card fee?** — two cards side by side (service fee: client
   pays 3.50% + 30¢ card / 0.75% $1–$8 bank, business receives the full
   amount; company-paid: 2.95% + 30¢ / 0.70% $1–$8, client sees no fee),
   each with a $500 worked example from `feeExample()` in
   `lib/service-fee.ts` (client pays $517.80 / you receive $500.00 vs
   $500.00 / $484.95). Picking one `POST`s `/api/app/setup/payments
   { serviceFee }` → `surchargeEnabled`. A brand-new company starts with
   neither lit (the column's default is not a decision); the service-fee
   card carries the surcharge-legality line. "You can change this any time
   in Settings."
2. **Connect your Square account** — `Connect Square` (OAuth) and "No
   Square account yet? Create one" on the chosen model's link
   (`squareSignupUrl(model)`), with what Square will ask for and "come back
   here and press Connect Square". The screen re-checks
   `/api/app/settings/payments` on focus/visibility, so consent finished in
   another tab or the phone's system browser moves it on.

A folded "Have an invite code?" (`/api/app/activate/invite`, waives) and
"Signed in as … · Sign out" sit under the card. Non-owners see "one more
step for the account owner". Connected → "Square is connected to <business>"
with Open WorkBench (and the bank-account link when payouts aren't set up).
The Square callback lands on the step with `?square=<outcome>` while the
stamp is set, else on Settings (`lib/square-outcomes.ts` holds the copy for
both).

**Home checklist (`lib/get-started.ts`).** Two new core steps at the top for
Square companies that aren't waived/test: "Set up online payments" (→ the
step, which older companies use as a door — nothing is held for them) and
"Link your bank account in Square" (payoutStatus VERIFIED or UNKNOWN).

**Settings → Online Payments.** Both sign-up links listed with their rates
and a "Your setting" chip on the one matching the Service fee switch, plus
"Walk me through it" → the step. The switch and its confirm dialogs are
unchanged.

**Console.** Accounts status "Setting up payments"; the company page's
Online payments card shows "Held at payment setup · since …" and offers
"Waive payment setup" / "Require payment setup" (the existing
`waive-payments` action — invite codes and testers). The Sign-ups page is a
feed; Reject still suspends; older PENDING rows can still be approved.

**Not changed.** The Finix path (`/app/activate`, `PAYMENTS_ONBOARDING_OPEN`)
is untouched and still selectable. `/app/register` (in-app "New company")
stays invite-gated and waived. The Service fee rates and the switch's
legality dialog are as David set them 2026-10-31.

## Rollout

- Additive column (`paymentsRequiredAt`): the deploy's `db:push` adds it;
  nothing to run by hand. Existing companies are never stamped, so nobody
  already on WorkBench is held.
- Staging runs the gate from this release (PAYMENT_PROCESSOR square +
  sandbox credentials). e2e tenants are provisioned `paymentsWaived`, so
  nothing in the suite is held; `signup-doors` clicks "Have an invite
  code?" before expecting the field.
- Help Center guides that this makes wrong (ask David before editing, per
  CLAUDE.md): `activate-payments` (the step is now where most people
  connect; the sign-up link copy), `first-week-setup` (two new checklist
  items first), `card-surcharging` (the choice is made on the step; both
  links visible in Settings).

## Open questions for David (unchanged from the 2026-11-03 assessment)

1. The two `squareup.com/i/…` links are in Square's refer-a-friend format
   (free processing on up to $1,000 for 180 days). Nothing published says
   such a link sets a seller's rate plan. If they don't, the step should
   show one link and the switch alone decides the model.
2. The service fee (3.50% + 30¢ on every card, debit included) sits above
   Square's own US surcharge cap of 3%, and Square doesn't offer surcharging
   in CT, ME, MA or PR. The step and the switch put the responsibility on
   the business; whether to cap at 3% / exempt debit is David's call.
