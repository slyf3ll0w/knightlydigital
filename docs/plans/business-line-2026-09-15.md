# WorkBench Line — per-tenant texting + business phone — 2026-09-15

> **2026-09-22 — the platform's own toll-free line.** Telnyx refused Streamflaire's
> verification twice because the form files EVERY registration as "WorkBench (ISV
> reseller) on behalf of <legal name>" with the tenant use case. For the number
> Streamflaire itself uses (WorkBench sales & support) the client IS the ISV, which
> their rule forbids. `isPlatformOwnLine` (legal name = `PLATFORM_LEGAL_NAME`) now
> routes to `platformTollFreeInput`: no reseller field, DBA WorkBench, use case =
> sales/support to prospects + account holders + dev/demo, opt-in = the unchecked
> checkbox on /apply (`AccessApplication.smsConsentAt`, added the same day) + texting
> first + asking. `/sms-terms` §7 describes those texts. `refileTollFree` /
> `scripts/refile-tollfree.ts` re-files an in-review request in place. Tenant
> registrations are unchanged — resellers MAY file for direct clients with the
> client's own details, which is what the form does.

> **Voice moved on 2026-09-18**: number-level forwarding is now the fallback;
> the number sits on a Call Control app with whisper + press 1, voicemail and
> calls from the app — see `business-line-voice-2026-09-18.md`.
>
> **Status 2026-09-18 — BUILT** (branch `business-line`). Batches A–E and the
> forwarding half of F shipped in one pass: `lib/telnyx.ts`,
> `lib/business-line.ts`, `MessagingRegistration`, the send-path cutover
> (`from` = the tenant's line, no "WorkBench:" prefix), inbound routing by
> receiving number, the Settings card with registration form + status chip +
> resubmit, the hourly `lineRegistrations` cron step, the 10DLC status
> webhook, superadmin `LineControl` + `line-release`. Deviations from the
> plan below: registration status updates poll Telnyx (webhook = trigger
> only, never trusted); unknown inbound texters become a contact; the
> entitlement is enforced in code from day one (comp with addon-grant).
> Still open: F's missed-call text-back / voicemail / outbound calling, G
> (repurpose the toll-free), auto-release on cancellation, E911, porting.
> CLAUDE.md has the working summary.

Plan to replace the shared toll-free sender with a per-tenant number that does
both SMS and voice, sold as a paid add-on. Written after Telnyx rejected the
toll-free verification for the shared-number model. Repo at `713cb59`.
Nothing below is built yet.

## Why the current design cannot ship

`lib/sms.ts` sends every tenant's texts from one WorkBench-owned toll-free
number (+1 833-495-0229) through the messaging profile's number pool. Telnyx
rejected the toll-free verification on 2026-09-14:

> ISV Resellers can only register for internal use with direct clients. please
> submit on behalf of the client. All business information must be related to
> the client. The opt-in can only be between two parties. Resellers can get
> toll free approvals for direct communication with account holders and for
> application development, testing and demonstration purposes.

This is not a Telnyx policy quirk. Since 2025-02-01 carriers block 100% of
unregistered A2P traffic, and the registration model they enforce is
two-party: the consumer must have opted in to *the business that is texting
them*. A homeowner who hired Acme Plumbing never opted in to "WorkBench", so
no amount of `WorkBench:` prefixing makes a shared sender legitimate.
Switching providers does not change this — Twilio, Bandwidth, Sinch and
Vonage all register through the same Campaign Registry.

Jobber does not avoid this either. Their help centre tells customers to supply
a tax ID and register a dedicated number, and warns processing "may take up to
3 weeks". What they actually built is good UX around an unavoidable form: an
in-app banner with a status chip and a Complete Registration button. That is
the thing to copy.

### Two live bugs this work also closes

- **Number pool can never select our number.** Messaging profile
  `40019f76-5395-4972-b0ec-5a332073813e` has `toll_free_weight: 0` and the
  pool contains only a toll-free number, so pool selection has nothing
  eligible. `lib/sms.ts:111` sends `messaging_profile_id` with no `from`.
  Batch B removes the pool from the send path entirely.
- **Inbound texts cross tenants.** Ops-flow review Tier-1 #6:
  `app/api/public/webhooks/telnyx/route.ts` matches an inbound message to a
  Contact by phone digits across *every* company. With one shared number
  there is no other signal. Per-tenant numbers give us one (Batch C).

## Shape of the fix

One number per tenant, registered to that tenant's own business, carrying
both their texting and their business phone line.

The key scheduling insight: **10DLC governs A2P SMS only — voice has no
registry.** So the number can be provisioned and answering calls the same day
the customer subscribes, while the SMS campaign clears in the background over
3-7 business days. The registration wait stops being a dead zone and becomes
a progress chip on a feature that is already partly working. That is the
single biggest UX lever we have over Jobber's three-week silence.

Order of events for a new subscriber:

1. Subscribe (entitlement stamped) → local number purchased and attached to
   the messaging profile. **Voice live within minutes.**
2. Registration form → 10DLC brand created → OTP or vetting.
3. Campaign created and number bound. **SMS live, typically 3-7 business days.**
4. Until step 3 clears, automated texts fall back to email, and the existing
   free `sms:` deep links (`lib/messaging.ts`) keep working from the tech's
   own phone.

### Which registration path

Branch on whether the tenant has an EIN. Both are API-driven on Telnyx, which
passes TCR fees through at cost.

| | Low-Volume Standard (has EIN) | Sole Proprietor (no EIN) |
|---|---|---|
| Who | LLC, S-corp, most 3-8 tech shops | Unincorporated 1-2 person shops |
| Brand fee | $4 one-time | $4 one-time |
| Campaign vetting | $15 per submission | $15 per submission |
| Monthly campaign | ~$1.50 (Low Volume Mixed) | $2.00 |
| Numbers | Multiple | **1 only** |
| Throughput | Vetting-score dependent | ~1,000 msgs/day |
| Extra friction | none | owner must answer an **OTP PIN within 24h**; a mobile can back at most 3 TCR brands |
| Approval | 3-7 business days | 3-7 business days |

All-in per tenant: roughly **$20 one-time + $3-4/month** including the number,
before per-message and per-minute usage.

### Telnyx API surface

```
POST /v2/10dlc/brand                     register the tenant's business
POST /v2/10dlc/brand/{brandId}/vetting   optional, raises throughput
POST /v2/10dlc/campaignBuilder           the use case (CUSTOMER_CARE / MIXED)
POST /v2/10dlc/phoneNumberCampaign       bind their number to the campaign
```

Numbers must already be on a messaging profile before campaign assignment.
Telnyx also exposes mock brand/campaign registration for integration testing
without incurring TCR fees — use it for e2e.

## Pricing and gating

**Recommendation: paid only, and it should be the flagship of the paid tier.**

The reasoning is margin, not greed. Every provisioned tenant carries hard
per-tenant COGS that a free tier cannot absorb: $4 brand + $15 vetting +
$1.50-2/mo campaign + ~$1/mo number + per-segment SMS + per-minute voice.
Atlas tokens can be metered down to a free allowance because the marginal
cost is elastic; a registered phone number cannot — it bills whether or not
the tenant sends anything.

The entitlement plumbing already exists. `lib/addon.ts` gates on
`Company.addonActiveAt` (stamped by the Livery webhook) with `hasAddon()`,
and `addonEnabled` as the superadmin visibility switch. Use it rather than
inventing a second billing path.

Three rules that keep this honest:

1. **The free `sms:` deep links stay free forever.** They cost us nothing and
   they give the free tier a true texting story. The line to draw for
   marketing is clean: *free — you text clients from your phone; paid —
   WorkBench texts for you from your business line, automatically.*
2. **Gate registration behind the subscription, not the other way round.**
   $15 vetting fees for tenants who never convert is a real leak. Subscribe
   first, then provision, then register.
3. **Do not take money for a number that does not exist yet.** Start the
   billing period when the number provisions (minutes), not when the campaign
   clears (days). A customer who pays and then waits a week without a working
   feature is a refund and a bad review.

## Batches

Each batch is independently shippable. A-D are the critical path to texting
working at all; E gates it; F is the voice product; G cleans up.

### Batch A — Data model + Telnyx 10DLC client

- `prisma/schema.prisma`: new `MessagingRegistration` model, one per company —
  `brandId`, `campaignId`, `brandStatus`, `campaignStatus`, `rejectionReason`,
  `submittedAt`, `approvedAt`, `entityType` (SOLE_PROPRIETOR | PRIVATE_PROFIT),
  plus the collected business fields. `Company.lineNumber` (E.164) and
  `Company.lineNumberId` (Telnyx id).
- `lib/telnyx.ts`: thin client for the four 10DLC endpoints above plus number
  search/purchase, mirroring the error handling in `lib/sms.ts`.
- `lib/messaging-registration.ts`: state machine — `NONE → PROVISIONED →
  BRAND_PENDING → CAMPAIGN_PENDING → ACTIVE`, with `REJECTED` off any step.
- **Schema gotcha:** Railway boot runs `prisma db push`. Additive only here;
  no column drops in this batch. Never `@unique` a new column on a table with
  existing rows without a backfill first.

### Batch B — Send path cuts over to the tenant's own number

- `lib/sms.ts:82-125` — `sendSms` takes the company's `lineNumber` and sends
  `from` explicitly; drop `messaging_profile_id` pool selection. Refuse the
  send when registration is not `ACTIVE` (alongside the existing
  `smsAcknowledgedAt` check at `:96`).
- `lib/sms.ts:133` — delete the `WorkBench:` prefix from all four templates
  (`:153,154,171,191`). The number now belongs to the business and is
  registered under the business's brand; leading with our name becomes
  actively wrong under the two-party opt-in rule. `OPT_OUT` stays.
- Call sites to re-verify (all already pass `companyId`, so this is mostly
  free): `lib/portal-messages.ts:139`, `lib/reminders.ts:405,559`,
  `lib/schedule-notify.ts:159`, `app/api/app/quotes/[id]/send/route.ts:99`,
  `app/api/app/invoices/[id]/send/route.ts:87`.
- Keep `smsEnabled()` as the env-gate; it now means "platform can send at
  all", with per-tenant readiness a separate check.

### Batch C — Inbound routing by receiving number

- `app/api/public/webhooks/telnyx/route.ts`: resolve the tenant from the `to`
  number (`Company.lineNumber`) *first*, then match the Contact within that
  company only. This closes ops-flow Tier-1 #6 properly.
- Same batch, same file, from that finding: narrow `STOP_RE` to whole-body
  `/^\s*(stop|stopall|unsubscribe)\s*$/i`, drop `cancel|end|quit` and the
  `yes` in `START_RE`, and land everything else in the thread rather than
  dropping it. Scope the `smsOptOut` write to the receiving company.

### Batch D — Onboarding, status, and failure surfacing

- Registration form: legal business name, EIN (or sole-prop path), address
  (no PO boxes), website or social URL, contact name/email/mobile. Branch on
  EIN presence. For sole prop, explain the OTP PIN and the 24-hour window
  before submitting, not after.
- Status card in Settings → Automations & AI, replacing/absorbing
  `SmsNotificationsCard.tsx`. Jobber's banner pattern for the pending and
  rejected states.
- Telnyx status webhook → update `MessagingRegistration`, surface
  `rejectionReason` verbatim with a Resubmit action. Silent failure here is
  what cost us three days on the toll-free submission.
- **Send-time feedback (fixes the complaint that started this).** Today
  `quotes/[id]/send/route.ts:132` and `invoices/[id]/send/route.ts:116`
  return `{ texted }` and the UI throws it away — `QuoteActions.tsx` only
  shows the email ritual. Show "Emailed and texted Maria" vs "Emailed Maria",
  and when a text was skipped say why (no phone / opted out / texting not set
  up yet) rather than saying nothing.
- Note `canSendSms()` in `lib/messaging.ts` hides the free text buttons on
  Windows and Linux desktops by design. Worth a tooltip — it reads as broken.

### Batch E — Entitlement

- Gate Batches B-D behind `hasAddon(company)` from `lib/addon.ts`.
- Provision on entitlement stamp; release the number on cancellation (after a
  grace period — a released number is gone, and with it the tenant's
  registration and their clients' reply history).
- Superadmin: show per-tenant registration status and TCR spend alongside the
  existing `CompanyUsageDaily` profitability view.

### Batch F — Voice (the half that needs no registration)

Ship after A-E, but note it could ship *before* SMS clears for any given
tenant, which is the whole point.

- v1 is cheap: Telnyx numbers carry a `call_forwarding_enabled` flag
  (visible on the number record today), so inbound forwarding to the owner's
  or a ring group's real cell is a number setting, not a Call Control app.
- Missed call → automatic text back ("Sorry we missed you — reply here or
  book at <link>"), which lands in the existing portal thread via Batch C.
- Voicemail with transcription into `/app/messages` needs Call Control or
  TeXML — scope separately, do not block v1 on it.
- Deferred to v2: outbound calling from the app with the business number as
  caller ID, and CNAM registration.
- **Check before shipping voice:** emergency/E911 addressing. The current
  number shows `emergency_enabled: false, emergency_status: "disabled"`.
  A forward-only line is probably fine, but confirm the obligation rather
  than assume it.

### Batch G — Repurpose the toll-free number

Do not release +1 833-495-0229. Resubmit it narrowed to "direct
communication with account holders", which the rejection text explicitly
permits. That gives us a legitimate WorkBench → *our own users* channel for
billing alerts, onboarding nudges and trial reminders — genuinely useful, and
entirely separate from tenant→client traffic.

## Open questions

1. **Existing tenants.** Any company with `smsAcknowledgedAt` set is expecting
   texts that have never actually sent. Do they get grandfathered onto the
   add-on, or prompted to subscribe? Decide before Batch E ships.
2. **Number area code.** Let the tenant pick their local area code at
   provisioning, or auto-match from `Company.zip`? Local presence matters for
   home services; auto-match with an override is probably right.
3. **Porting.** Several tenants will want to bring their existing business
   number. Telnyx supports porting, but it is a multi-week manual process and
   should not be v1. Say so in the UI rather than staying silent.
4. **Sole-prop OTP failures.** The PIN expires in 24 hours and a mobile can
   back at most three TCR brands. Both produce confusing dead ends; both need
   explicit copy and a retry path.
5. **Throughput on Low-Volume Standard** is vetting-score dependent. Do we pay
   for external vetting by default, or only when a tenant hits the cap?

## Sources

- Telnyx, Guide to Sole Proprietor 10DLC Brand and Campaign Registration
- Telnyx, Getting Started with 10DLC (API workflow, ISV brand-per-customer rule)
- Twilio, ISV A2P 10DLC Onboarding (API parity, mock registration)
- Jobber Help Centre, Register Your Number; Two-Way Text Messaging FAQ
- Live Telnyx account reads, 2026-09-15: verification record
  `322c5c4f-8b9f-50b0-a357-235e31c20da0`, messaging profile
  `40019f76-5395-4972-b0ec-5a332073813e`
