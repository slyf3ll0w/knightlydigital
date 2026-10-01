# Onboarding v3 — sign up, underwrite, start — scope (2026-09-30)

Status: **SCOPED, awaiting David's answers** (questions at the end). Nothing built.

David's goal: a business signs up, completes underwriting with a processor
other than Finix (one that may approve faster), and starts using the app
immediately. The questions were what has to change in the onboarding system,
in what the client receives (screens and emails), and whether a sign-up
should still show up in the console as an "application".

## What happens today

**Doors.** `/apply` (marketing site) and `/app/get-started` (inside the app,
same `components/ApplyForm.tsx`), the unlisted `/invite` (a code), and
`/app/register` (New company). Google / Apple sign-in lands on
`/app/get-started` with the email already known.

**The form** asks for 14 things: name, email, password, business name, phone
(+ SMS consent), trade, team size, city, state, how they take payment today,
monthly invoicing, years in business, business structure, website, a note.
Most of the back half exists for the human review and to prepare for KYC.

**One POST** (`app/api/public/apply/route.ts`) creates the AccessApplication,
the Account, the Company (`accessPendingAt` stamped) and the OWNER row, and
emails `newApplicationEmail` to `APPLICATION_INBOX`. The client gets **no
email** at sign-up. They land in the app. With `PAYMENTS_ONBOARDING_OPEN`
off (since 2026-09-30) there is no Finix gate: Settings → Payments says
"Online payments: coming soon", pay pages are view-only, invoice emails say
View. With it on, they are held at `/app/activate` (hosted Finix KYC form)
until the form is submitted; the states PROVISIONING / UPDATE_REQUESTED /
APPROVED / REJECTED come back by webhook and `lib/finix-status.ts`; REJECTED
locks the account.

**Review.** Sign-ups → Approve clears `accessPendingAt` and emails
`applicationApprovedEmail` ("You're approved — welcome to WorkBench").
Reject suspends the company silently. The app shows no pending banner any
more (David 2026-09-30), so the review is invisible to the client unless it
goes against them.

**Invite codes** (and the universal `Workbench123`) skip the review and set
`paymentsWaived` (online payments held).

## What would change

### 1. The processor seam (the real work)

Charging is already behind an interface: `lib/payments.ts` `getProcessor()`
returns the active `PaymentProcessor` ("manual" | "finix"), chosen by env,
and every charge / refund / vault call goes through it. **Underwriting is
not abstracted at all.** Finix is named directly in: `Company.finix*`
columns, `lib/finix.ts` (onboarding forms, identities, merchants),
`lib/finix-status.ts`, `lib/payments-gate.ts` (keys on
`finixOnboardingState`), `/app/activate`, the Finix webhook, Settings →
Payments, `lib/finix-js.ts` (hosted card fields on /pay, the client hub and
booking checkout), disputes, payouts, reconcile, the Finix cost snapshots on
Profitability, and `lib/platform-costs.ts` fee math — about 40 files.

To add a processor cleanly:

- **Per-company processor**, not per-platform: `Company.processor`
  ("finix" | "<new>"), `merchantRef`, `onboardingRef`, `onboardingState`
  (one state vocabulary: not-started / submitted / needs-info / approved /
  declined), and `getProcessor(company)` instead of `getProcessor()`.
  Companies Finix already approved keep charging through Finix untouched.
- **An onboarding adapter** per processor: `startOnboarding(company) →
  hosted URL (or an in-app form if the processor is API-only)`,
  `syncStatus(company)`, a webhook handler. `lib/payments-gate.ts` becomes
  processor-agnostic.
- **A charging adapter** for the new processor: card + ACH charge, refund,
  vault (saved cards and autopay depend on it), surcharge support (the
  surcharge feature assumes the processor allows it), hosted card fields for
  the three client-facing checkouts, dispute evidence, payouts.
- **Platform economics**: fee revenue today is a flat Finix fee profile
  stamped on each Payment (`feeCents`) and the monthly Finix Net Profit CSV
  is the true-up. The new processor needs an equivalent (a platform fee /
  revenue share) or Profitability goes blind for those accounts.

### 2. The flow the client sees

- **Short sign-up**: name, email, password, business name, phone, trade,
  and "how did you hear about us" (the referral column). Everything else
  (structure, years, volume, address) is KYC and gets asked once, by the
  processor's form, not twice.
- **Straight into the app** after sign-up: the setup wizard as today. One
  "Set up payments" card in Settings and a single banner line until it is
  done (never a gate). The underwriting status is a chip: Not started · In
  review · Needs info · Approved · Declined.
- **Instant approvals** (if the processor offers them for low-risk sole
  props) switch online payments on the moment the webhook lands; otherwise
  "In review" works exactly like today's PROVISIONING — the app is fully
  usable, charging is structurally impossible until Approved.
- **Declined**: today REJECTED locks the account. Recommendation: do not
  lock. Keep the app usable with online payments off (cash / check
  recording still works), show a plain explanation in Settings, and raise it
  in the console's attention list. Locking is what the manual review was
  for; fraud becomes a Suspend decision on the company page.
- Invite codes stay as **comp codes** (waive payments, grant plans) — they no
  longer skip anything else because there is nothing to skip.

### 3. Emails

| Today | Proposed |
|---|---|
| Nothing to the client at sign-up | **Welcome** (what to do first, the app links) — ideally with an email-verify link, since nobody will be reading sign-ups by hand any more |
| "You're approved — welcome" after manual approval | Dropped (no manual approval) |
| Nothing when underwriting approves (the webhook flips state silently) | **Payments are on** — one line, link to Settings → Payments |
| Banner only when the underwriter needs more info | **Needs a bit more info** — with the processor's link |
| Lock screen on decline | **We couldn't switch on online payments** — soft, says cash/check still work and how to appeal if the processor allows it |
| "New application" to the inbox | **New sign-up** to the inbox (same facts, fewer fields) plus "Payments approved / declined" notices |

Client-facing copy that mentions Finix or the review: `/app/activate`
(retired), Settings → Payments card, `applicationApprovedEmail`,
`lib/help/sections/start.ts`.

### 4. How a sign-up shows up in the console

Yes, change it. With no human decision, "application" is the wrong word and
Approve / Reject are the wrong buttons. A sign-up should appear as a **new
account on the Accounts home** (it already does, with the status chip) and
in a **Sign-ups feed** that is read-only: who, when, trade, referral,
underwriting status, finished setup or not. The AccessApplication row stays
as the record of what they told us (it feeds "From their application" on
the company page). The attention list carries "Needs info", "Declined" and
"Signed up 7+ days ago, never finished setup". Fraud = Suspend on the
company page, with the audit trail.

## Sizing

| Phase | What | Size |
|---|---|---|
| 0 | Flow + emails without touching the processor: short form, no review step, welcome email, Sign-ups feed, soft decline. Ships before a processor is chosen. | 1 session |
| 1 | Processor seam: per-company processor, onboarding adapter, charging adapter with hosted fields, webhook, gate rewrite, Settings card. | 2–3 sessions, depends on the processor's API |
| 2 | Disputes, payouts, reconcile and Profitability for the new processor; Finix stays for already-approved merchants. | 1–2 sessions |

## Questions for David

1. Which processor? What matters: hosted KYC form or API-only, instant
   approvals, hosted card fields (tokenization in the browser), ACH,
   surcharging allowed, saved cards / recurring, a platform fee or revenue
   share we can read per transaction, dispute and payout APIs.
2. Keep Finix for the merchants it already approved, or migrate everyone?
3. Should a decline lock the account (today) or just keep online payments
   off (recommended)?
4. Verify the email at sign-up (recommended once nobody reviews by hand)?
5. Keep invite codes as comp codes?
