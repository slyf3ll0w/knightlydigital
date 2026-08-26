# Google Play listing — Workbench (draft 2026-08-26)

App: `com.streamflaire.hub` · versionName 1.2 (versionCode 2) · thin shell of
workbenchfsm.com. Everything below pastes into Play Console → Grow → Store
presence, except where marked as a Console form.

## App details

- **App name** (30 chars max): `Workbench — Field Service`
- **Short description** (80 chars max):
  `Jobs, quotes, invoices, and payments for your field service business.`
- **Full description** (4000 chars max):

```
Workbench is the all-in-one app for running a field service business — built
for crews of one to eight who'd rather be working than doing paperwork.

RUN THE DAY FROM YOUR POCKET
• See today's schedule at a glance, with drag-to-schedule planning on the web
• Clock in and out of jobs, snap job photos with the camera
• Get requests from your website straight into your pipeline

WIN THE WORK
• Send professional quotes clients approve with a tap and a signature
• Deposits, optional line items, discounts, and e-sign agreements built in
• Turn approved quotes into scheduled jobs in one step

GET PAID
• Invoice from the job site the moment work wraps up
• Take card payments online, keep a card on file, or record cash and checks
• Automatic payment reminders chase late invoices so you don't have to
• Recurring plans and per-visit billing for maintenance contracts

KEEP CLIENTS HAPPY
• Every client gets their own portal — quotes, invoices, visits, and payments
  in one place
• Team chat keeps the crew on the same page
• Notifications for new requests and messages, with an app-icon badge

BUILT LIKE A REAL APP
• Face/fingerprint app lock protects your business data
• Home-screen shortcuts jump straight to New Job, Schedule, or Team Chat
• Your Workbench account works everywhere — phone, tablet, and desktop

Workbench is free to use. Card processing is available with transparent
per-transaction pricing.

Questions? Reach us through workbenchfsm.com.
```

- **App category**: Business
- **Tags**: pick e.g. "Productivity/CRM"-adjacent business tags in Console
- **Contact email**: (required, shown publicly) — David to choose
- **Privacy policy URL**: https://workbenchfsm.com/privacy (live, on-brand)

## Graphics checklist

- **App icon**: 512×512 PNG (32-bit, ≤1MB) — export from the existing mark
  (android mipmap source / scripts/generate-pwa-icons.mjs source art).
- **Feature graphic**: 1024×500 PNG/JPG — required. Suggest: dark #0C0F0C
  field, Workbench wordmark + green mark, one-line tagline.
- **Phone screenshots**: minimum 2, up to 8; 16:9 or 9:16, each side
  320–3840px. Suggest: dashboard, schedule, quote approval, invoice + Charge
  Card, client portal, team chat. Capture on a Pixel-sized viewport
  (Playwright 412×915 @2x works).
- 7-inch / 10-inch tablet screenshots optional (skip for launch).

## Data safety form (Console → App content → Data safety)

DRAFT — David must confirm before submitting; wrong answers are a policy
violation. Basis: the app is a webview shell for the Workbench SaaS.

Overview answers:
- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS everywhere)
- Do you provide a way for users to request that their data is deleted? **Yes**
  — requires the account-deletion URL below to exist first.

Collected types (all "Collected", not "Shared", unless noted):
- **Personal info → Name, Email address, Phone number**: account + client
  records. Required. Purpose: app functionality, account management.
- **Financial info → Payment info**: card details are entered on payment pages
  and tokenized by the payment processor (Finix); Workbench stores tokens, not
  PANs. Mark as collected + **shared with payment processor**. Purpose: app
  functionality.
- **Photos**: job photos users upload. Optional. Purpose: app functionality.
- **Messages → Other in-app messages**: team chat + client messages. Purpose:
  app functionality.
- **App activity**: none beyond the above (no analytics SDK in the shell —
  confirm nothing like GA runs on the web side before answering).
- **Location**: NOT collected (job addresses are typed, no device location
  permission). Do not declare it.
- **Device IDs**: FCM push token when notifications are enabled. Google's
  guidance: FCM tokens alone generally don't require declaring Device IDs, but
  if unsure declare Device or other IDs / app functionality.

## Account deletion URL (required by the Data safety form)

**https://workbenchfsm.com/account-deletion** — built 2026-08-26
(`app/(wbsite)/account-deletion/page.tsx`). Documents the in-app path
(Settings → Danger Zone → Delete account) plus an email request path
(info@streamflaire.com, 30-day SLA). Paste this URL into the Data safety
form's account-deletion field.

## Content rating questionnaire

Category: Utility/Productivity. All violence/sex/language/drugs answers: No.
- "Does the app allow users to interact or exchange content?" — **Yes** (team
  chat / client messages) → will still rate Everyone/PEGI 3-ish for business
  chat.
- Gambling: No. User-generated content: the chat answer covers it.

## Other Console forms (App content)

- **Target audience**: 18+ only (business tool). Not directed at children →
  no Families policy work.
- **News app**: No. **COVID app**: No. **Data safety**: above.
- **Government app**: No. **Financial features**: declare "None of the above"
  is WRONG — the app facilitates invoicing/payments for merchants; in the
  Financial features declaration pick what actually applies (it's a payment
  facilitation via licensed processor situation — review the form's exact
  options when it appears; Finix is the licensed entity).
- **Ads**: No ads → declare "No ads".

## Release path

1. Internal testing track first: upload AAB, add tester emails (David's
   Gmail), install via opt-in link on a real Android device, verify shell
   basics (login, password save prompt absent until assetlinks is live,
   camera, back button, badge).
2. Personal Play accounts created after Nov 2023: production requires a
   closed test with 12 testers opted in for 14 days. Organization accounts
   skip this. Check which applies in Console → Dashboard (it shows the
   requirement banner if it applies to this account).
3. After first release exists: Play Console → Test and release → App
   integrity → copy the **App signing key certificate SHA-256** → set
   `ANDROID_CERT_SHA256` on Railway (comma-append the upload cert SHA-256
   too if desired) → verify
   `curl https://workbenchfsm.com/.well-known/assetlinks.json`. This turns on
   App Links + Google Password Manager save/fill in the shell.
