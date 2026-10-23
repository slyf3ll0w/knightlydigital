# Quick charge link · Tap to Pay in the app — scope (2026-10-22)

Two asks from David: "a checkout link" and "on-site phone tap-to-pay".
Decisions taken 2026-10-22 (recorded under Decisions): the checkout link is
a **quick charge on the WorkBench pay page** (not Square-hosted Payment
Links), tap to pay is the **Square Mobile Payments SDK inside the WorkBench
app** (not the Square POS app-switch), and this doc comes before any build.
Status: **PLANNED, nothing built.**

Everything below was checked against `origin/main` at `b8ac247c`
(2026-10-22). The main checkout on the PC is on `media-race`, 55 behind
origin, so build in a worktree cut from `origin/main`, not from the checkout.

What the code already gives us:

- **A branded public pay page.** Every invoice has `/pay/<publicToken>`
  (`app/pay/[token]/PayPage.tsx`, `app/api/public/pay/[token]/route.ts`):
  Square card fields + ACH, partial payments from $1, surcharge when the
  company has it on, card-on-file save, PDF, view tracking. It is already
  what emails, texts, Atlas (`get_document.payLink`), automations and the
  client hub link to. The quick charge is a thin way to **make** one of
  these without building an invoice first.
- **Lightweight invoice precedent.** `lib/deposits.ts` creates a DEPOSIT
  invoice with one line item, `status: "AWAITING_PAYMENT"`, due today and a
  random `publicToken`. The quick charge is the same shape with a new
  `InvoiceKind`.
- **Send-channel chooser** (`lib/send-channels.ts`, `useSendChoice`) and
  the invoice send route's text/email templates (`invoiceLinkText`,
  `invoiceLinkEmail` in `lib/automations-actions.ts` / the send route).
- **Square OAuth per company** (`lib/square-connection.ts`): sealed access
  + refresh tokens, 30-day expiry with a refresh sweep, `scopes` recorded
  per connection, `getSquareAccessToken(companyId)` that refreshes on the
  way out. `SQUARE_EXTRA_SCOPES` env adds scopes without a code change.
- **Payment recording** (`recordPayment` used by `charge-stored` and the
  public pay route): writes the `Payment` row (method, `processorRef`,
  surcharge, fee/cost columns), flips the invoice, fires celebrations,
  QuickBooks sync, automations. Idempotent on `processorRef`.
- **Square webhook** (`app/api/public/webhooks/square/route.ts`) matched
  on `processorRef`; unknown payments are ignored today.
- **A native plugin pattern on iOS.** `VoipPlugin.swift` registered in
  `ShellViewController.capacitorDidLoad`, reached from the page through
  `window.Capacitor.Plugins` via `lib/native-voip.ts` (nothing in the web
  bundle imports `@capacitor/*`). Android has no custom plugin yet
  (`MainActivity.java` is the bare `BridgeActivity`).
- **Thin-shell architecture** (`capacitor.config.ts`): the native webview
  loads `workbenchfsm.com` live, so every web change ships without a store
  build. Only the native plugin and its permissions need store builds.

---

## 1. Quick charge link

### What it is

"Charge $120 for the filter swap" without opening the invoice editor:
amount, what for, who (optional), and you get a pay link to text, email or
copy. Behind it is a real invoice, so the money lands in the same reports,
reminders, QuickBooks sync and refund flow as every other payment. Nothing
new to learn for the client: it is the pay page they already know.

### Shape

- **Entry points.** A **Request payment** tile on the phone Create sheet
  and the desktop Create menu (`components/AppShell.tsx` `createItems` /
  `phoneCreateItems`, order: bill group next to Invoice), the contact page
  Create menu (`ContactCreateMenu.tsx`, pre-fills the client), the job page
  money block, and Atlas (`request_payment` tool, see 1.4).
- **The form (one card, phone-first).** Amount (big, keypad), "What for"
  (one line, becomes the line item name and the invoice subject), Client
  (optional search; "No client" allowed, the link is the credential), a
  Notes fold (optional message on the pay page). Button: **Get link**.
- **After Get link.** The sheet turns into the share step: the link, Copy,
  Text, Email (the existing send-channel chooser; Text/Email greyed with
  the (i) reason when there is no client phone/email), and "Open invoice".
  QR code on desktop so an on-site client can scan it from the tech's
  screen (tiny: `qrcode` is not a dependency today; an inline SVG QR
  generator is ~3 KB, no new package needed).
- **Rules.** Amount $1.00 to $25,000. Tax: none by default, a "Add tax"
  fold applies the company's default rate. Due: today. Surcharge: the
  company setting applies on the pay page exactly as now. Partial
  payments: allowed (it is an invoice). Roles: `canSeeMoney` like invoice
  creation; TECH can request payment only on jobs assigned to them
  (mirrors `contactScope(actor)`).
- **Naming on lists.** Invoices list shows the kind as a chip ("Quick
  charge"), same as DEPOSIT shows today. The number comes from the normal
  invoice sequence (Settings → Payments → Numbering), so there are no gaps.
- **Help text.** Only in (i) bubbles (David 2026-09-25): one on the
  Client field ("Leave empty to charge someone who is not a client yet;
  the link is the only way to pay it") and one on the share step.

### Data

- `InvoiceKind` gains `QUICK_CHARGE` (migration: enum add, no backfill).
- No other schema change: `contactId` is already nullable on `Invoice`.
- `POST /api/app/invoices/quick-charge` → `{ invoice: { id,
  invoiceNumber, publicToken, payUrl } }`. Creates in `AWAITING_PAYMENT`
  (skips DRAFT: the link is live immediately), `issuedAt: now`, one line
  item, `kind: QUICK_CHARGE`. Reuses the invoice route's contact/job scope
  checks. Rate-limited like invoice create.
- Pay route: nothing. The public route already serves any invoice by
  token. Only addition: `QUICK_CHARGE` is treated like STANDARD for
  partial payments (DEPOSIT is the one that forbids splitting).

### Where it touches existing flows

- Reminders (`lib/reminders` / PaymentReminder): a quick charge with no
  contact has nobody to remind — the reminder scheduler skips invoices
  with `contactId: null` (verify it already does; it should, the deposit
  path requires a contact so this is new ground).
- QuickBooks: invoices without a customer push as the company's
  "Walk-in" customer, or are skipped with a sync note. **Decision 5.**
- Auto-charge (`lib/auto-charge.ts`): only runs on invoices with a card on
  file, so untouched.
- Client hub: a quick charge with a contact shows on their hub invoices
  list like any invoice.

### Estimate

1.5 days: form + API + share step (1), kind chip + Atlas tool + Help (0.5).

---

## 2. Tap to Pay inside the WorkBench app (Square Mobile Payments SDK)

### What it is

On an iPhone or Android phone running the WorkBench app, the tech opens
the invoice, taps **Tap to Pay**, the client holds their card or phone to
the back of the tech's phone, and the invoice is paid. No Square app, no
reader, no leaving WorkBench. The payment lands in the seller's Square
account like every card payment WorkBench takes today, and shows in
WorkBench as a CARD payment with "Tap to Pay" details.

### What Square requires (checked 2026-10-22 against Square's docs)

| Requirement | What it means for us |
| --- | --- |
| SDK `2.6.x` iOS via Swift Package Manager (`square/mobile-payments-sdk-ios`, exact version), Android via Maven `com.squareup.sdk:mobile-payments-sdk:2.6.1` | iOS: the shell already uses SPM (`ios/App/CapApp-SPM`). Android: add Square's Maven repo to `settings.gradle`. |
| iOS deployment target 17.1+, Xcode 15.1+; a run-script build phase (`SquareMobilePaymentsSDK.framework/setup`) with User Script Sandboxing off | Check the current target in `project.pbxproj`; Capacitor 8 sets 14+, so bump to 17.1. Tap to Pay on iPhone itself needs iPhone XS+ on iOS 16.7+; iPad unsupported. |
| Android minSdk 28, compileSdk 35+, AGP 8.4.2+, Proguard off for the SDK | We are minSdk 24 / compileSdk 36 / AGP 8.13: raise minSdk to 28 (Android 9, 2018). Tap to Pay on Android needs a compatible phone (Square's list), Android 9+, no tablets. |
| OAuth scopes `MERCHANT_PROFILE_READ`, `PAYMENTS_WRITE`, **`PAYMENTS_WRITE_IN_PERSON`** (+ `ITEMS_READ` only if we route surcharges through Square; we do not) | We have the first two. Adding `PAYMENTS_WRITE_IN_PERSON` means **every connected seller re-authorizes once**. The connection row records `scopes`, so the app can show "Reconnect Square to turn on Tap to Pay" only to sellers whose grant lacks it. |
| `authorize(accessToken, locationId)` on the device with the seller's OAuth access token; tokens expire after 30 days; the SDK deauthorizes itself on expiry | The server hands the device a token through an authenticated route. See Security below. |
| Apple **Tap to Pay entitlement** (`com.apple.developer.proximity-reader.payment.acceptance`): requested by the **account holder** of an **organization** Apple developer account | **Decision 1.** If the "Workbench FSM" App Store account is an Individual account, this route is blocked until it is converted (Apple converts Individual → Organization with a D-U-N-S number; takes days to weeks). |
| Seller links an Apple ID to their Square account once per device (`linkAppleAccount()` shows Apple's terms sheet) | A one-time "Set up Tap to Pay" step in Settings → Online Payments on the phone, owners/admins only (Square's own advice). Android has no equivalent step. |
| **Application signature** registered in Square's Developer Console before production payments (bundle id + team id on iOS; package name + SHA-256 signing key on Android; debug builds need their own) | One-time console step per platform. Play App Signing key SHA-256 comes from the Play Console. |
| Info.plist `NSBluetoothAlwaysUsageDescription`, `NSLocationWhenInUseUsageDescription`; Android `ACCESS_FINE_LOCATION`, `BLUETOOTH_CONNECT/SCAN`, `READ_PHONE_STATE` | Location is mandatory for every SDK payment (Square's fraud rules), so the app asks for "while using" location the first time Tap to Pay is set up. Microphone (`RECORD_AUDIO`) is only for magstripe readers; skip. |
| From 2026-08-17 the iOS SDK uses Apple App Attest | Nothing to do; noted because it can raise the App Store "risk metric" review flag. |
| Production: US/CA/UK/AU sellers with payment processing enabled; attended use only; SDK versions supported 2 years | All WorkBench sellers are US. |
| No offline Tap to Pay; no other reader may be paired during a Tap to Pay payment | We ship Tap to Pay only (no reader pairing UI) in phase 1. |

Square processing fees for in-person (Tap to Pay) are the seller's normal
in-person rate on their Square account, lower than the card-not-present
rate the pay page pays. Nothing in WorkBench prices or bills this today
(no application fee in `lib/square.ts`), so there is no fee logic to add.

### Shape

- **Where the button lives.** Invoice page (phone, in the app only) next
  to Charge card: **Tap to Pay** when the balance is > 0, the company's
  Square connection carries `PAYMENTS_WRITE_IN_PERSON`, the shell reports
  the plugin exists, and the device is capable. Also on the job page money
  block and as the last step of the quick-charge sheet ("…or tap to pay
  now"). On desktop and in a browser it is simply absent (no "coming
  soon" chip; an (i) on the Charge card dialog says Tap to Pay is in the
  phone app).
- **The flow.**
  1. Tap → the page calls `TapToPay.pay({ invoiceId, amountCents,
     referenceId, note })`. Amount = balance (+ surcharge when on; see
     Decision 3). `referenceId` = invoice id, `note` = "Invoice #1042 ·
     Brightwire Electric" so it reads right in the Square Dashboard.
  2. Native: ensure authorized (fetch a token if not, see Security), then
     `startPayment` with Square's **default** prompt UI (Square's screen:
     "Hold card here", animation, result). Custom prompt UI is a phase 2
     polish; the default is what Apple reviewed and what Square supports
     best.
  3. `didFinish(payment)` → the page gets `{ paymentId, cardBrand, last4,
     status }` → `POST /api/app/invoices/[id]/tap-payment { paymentId }`.
  4. Server: `GetPayment(paymentId)` with the seller's token, checks
     `reference_id === invoice.id`, `status === COMPLETED`, amount ≤
     balance + surcharge; then `recordPayment` with `method: CARD`,
     `details: "Tap to Pay"`, `processorRef: paymentId`, card brand/type.
     Idempotent on `processorRef` (the webhook may land first; both paths
     converge).
  5. The page shows the existing approved overlay (`ChargeOverlay`) and
     the celebration. Receipt: Square can text/email its own receipt from
     the default prompt; WorkBench also sends its normal paid email when
     the invoice has a contact.
- **Setup (once per phone).** Settings → Online Payments → "Tap to Pay on
  this phone" card (phone app only): status line (Not set up / Ready /
  Needs Apple ID / Reconnect Square), a **Set up** button that runs
  location permission → `authorize` → iOS `linkAppleAccount()`. Owners
  and admins only. The same card is where a seller is told to reconnect
  Square when their grant predates the new scope.
- **Failure copy.** Declined, cancelled (client pulled the card), "Phone
  not supported", "Square token expired, reconnecting…" (auto-retry once
  after a fresh token), "Location is off". Each is a short sentence in the
  overlay, no modal.
- **Audit.** Every Tap to Pay payment also writes a `Payment.details`
  mention of the user who took it (we have `actor` on the route), so the
  team report can show who collected on site.

### Native work

- **iOS `TapToPayPlugin.swift`** (CAPPlugin like `VoipPlugin`): methods
  `status()`, `setup()` (permissions + authorize + Apple link),
  `authorize({ token, locationId })`, `deauthorize()`, `pay(...)`;
  events `authState`, `readerState`. SDK initialized in
  `AppDelegate.didFinishLaunching` with the application id (env-specific:
  sandbox id in debug builds). Registered in `ShellViewController`.
- **Android `TapToPayPlugin.kt`** (first custom plugin on Android: add a
  `@CapacitorPlugin` class and register it in `MainActivity.onCreate`
  before `super`). Mirrors the iOS surface. `startPaymentActivity` with
  `PromptParameters.DEFAULT`.
- **Web `lib/native-tap-to-pay.ts`** like `lib/native-voip.ts`: typed
  plugin shape, `getCapacitor()` guard, `available()` false in browsers
  and in shells built before the plugin.
- **Mock reader** in sandbox builds (`MockReaderUI`) so the flow can be
  exercised on a dev phone with the sandbox application id before the
  Apple entitlement arrives.

### Security of the token on the device

Square's design is that the device holds the seller's OAuth access token.
To keep that tight:

- `GET /api/app/square/mobile-token` returns the current access token and
  the location id, only to an authenticated owner/admin/tech of a company
  with a Square connection, only when the request carries the shell user
  agent, rate-limited, and logged (who, when, device). It never returns the
  refresh token.
- The plugin keeps the token in memory and the iOS Keychain / Android
  EncryptedSharedPreferences, deauthorizes on sign-out (`lib/one active
  device` takeover wall already signs the page out; the page calls
  `deauthorize()` then) and on company switch.
- When the SDK reports `notAuthorized` (30-day expiry), the page fetches a
  fresh token and re-authorizes silently; the server side already refreshes
  tokens before expiry.

### Store builds

One build per platform to ship the plugin, permissions and entitlement.
Both can ride with items already queued for the next builds: iOS
Associated Domains + webcredentials (project-login-captcha-passwords),
Android vc6. Because the shell loads the live site, every later change to
the Tap to Pay UI, copy, routes or setup card is a web deploy, not a
build. Only SDK upgrades (Square's 2-year support window) need builds.

### Estimate

- Lead time outside our control: Apple entitlement approval (days to a few
  weeks; blocked until Decision 1 is Organization), Square application
  signature (same day), App Store / Play review of the new builds.
- Server + web (scope add, reconnect prompt, token route, tap-payment
  route, invoice/job/quick-charge buttons, setup card, Help): 3 days.
- iOS plugin + SDK wiring + sandbox mock pass: 3 days.
- Android plugin + SDK wiring + sandbox mock pass: 2–3 days.
- Device pass on real cards (needs production application id + signature
  + entitlement): 1 day, plus the test recipes below.

Total ≈ 2 working weeks of build, gated on the Apple entitlement.

---

## 3. Order of work

1. **Ask Apple for the Tap to Pay entitlement today** (Decision 1 first).
   It is the long pole and costs nothing to start.
2. Quick charge link (section 1): worktree `quick-charge` from
   `origin/main`, staging, CI + e2e, release. Independent of everything
   native, useful on its own.
3. Square scope + reconnect prompt + mobile-token route + tap-payment
   route (server side of section 2) behind `TAP_TO_PAY=1`. Ships dark.
4. iOS plugin, sandbox pass with MockReaderUI, then the real entitlement
   build to TestFlight.
5. Android plugin, sandbox pass, internal-testing build.
6. Flip `TAP_TO_PAY=1` on prod once David's device pass is green on one
   platform; the other follows.

---

## 4. Decisions for David

1. **Apple developer account type.** Is the account that publishes
   "Workbench FSM" (id 6789991103) an Organization account or an
   Individual one? Tap to Pay on iPhone requires Organization, requested
   by the account holder. If Individual, do you want to convert (needs a
   D-U-N-S number for the LLC) or ship Android Tap to Pay first?
2. **Who can take Tap to Pay payments.** Proposed: anyone who can see
   money on that invoice (owners, admins, and techs on their own jobs).
   Setup/Apple-ID linking: owners and admins only.
3. **Surcharge on Tap to Pay.** The pay page adds the card surcharge when
   the company has it on. In-person Square payments are cheaper for the
   seller. Proposed: apply the same company surcharge setting (one rule,
   one line on the receipt); alternative: never surcharge in person.
4. **Square's receipt.** Square's default prompt offers the client a
   text/email receipt from Square. Keep it (client may get two receipts:
   Square's and WorkBench's paid email) or suppress WorkBench's paid email
   for Tap to Pay payments?
5. **Quick charge with no client in QuickBooks.** Push under a single
   "Walk-in" customer, or skip sync with a note on the invoice?
6. **Quick charge amount ceiling.** Proposed $25,000 (matches nothing in
   particular; Square's own per-payment max is $50,000). Fine, or match
   the invoice editor's no-limit?

---

## 5. Test recipes (for the device pass)

Quick charge:

1. Phone → Create → Request payment → $120 "Filter swap", no client → Get
   link → Copy → open the link in a private window → pay with a sandbox
   card → invoice shows PAID, kind chip "Quick charge", number in sequence.
2. Same with a client picked → Text → the client's phone gets the usual
   invoice text with the link; the hub list shows the invoice.
3. Desktop → Create → Request payment → QR code shows → phone camera scan
   opens the pay page.
4. Amount $0.50 and $30,000 → inline error, button stays disabled.
5. TECH role on someone else's job → no Request payment tile on that job;
   on their own job → tile present.
6. Partial payment $40 on a $120 quick charge → balance $80, still
   AWAITING_PAYMENT, reminder scheduled only if there is a contact.

Tap to Pay (one platform at a time, production app id + signature):

7. Settings → Online Payments on the phone app → "Tap to Pay on this
   phone" → Set up → location prompt → (iOS) Apple terms sheet → Ready.
8. Company connected before the scope change → the card says "Reconnect
   Square to turn on Tap to Pay" → Reconnect → Ready.
9. Invoice $1.00 → Tap to Pay → Square's "Hold card here" → tap a real
   card → approved overlay + confetti → invoice PAID, payment row "Card ·
   Tap to Pay · VISA 1234", Square Dashboard shows the payment with the
   invoice note.
10. Cancel mid-prompt → "Cancelled" line, invoice unchanged, no Payment
    row.
11. Airplane mode → Tap to Pay button shows "Needs internet"; nothing
    starts.
12. Sign out → sign in as another company → Tap to Pay status is "Not set
    up" for that company (no token bleed).
13. Browser (not the app) on the same phone → no Tap to Pay button; the
    Charge card dialog (i) says it is in the app.
14. Surcharge on → amount on Square's screen = balance + surcharge; the
    payment row records the surcharge split (Decision 3).

---

## 6. Help Center

Guides to add or revise once built (ask David before editing, per CLAUDE.md):

- `how-clients-pay` (Payments): add quick charge links and Tap to Pay to
  the overview.
- new `request-payment-link` (Invoices): the quick charge, step by step.
- new `tap-to-pay` (Payments): setup, which phones, who can use it, what
  the client sees, Square's receipt.
- `charge-a-saved-card`: one line pointing to Tap to Pay for on-site.
- `partial-payments-and-deposits`: quick charges can be split.
- Settings → Online Payments copy for the new card.

---

## Build log

**2026-10-22 — built on branch `quick-charge-tap` (worktree
`~/knightlydigital-wt/tap-to-pay`, from origin/main b8ac247c).** David
confirmed the Apple account is an Organization and said go; decisions
2–6 taken as proposed (anyone who can see money may tap to pay, setup for
owners/admins; surcharge applies in person; Square's receipt stays and so
does ours; QuickBooks for client-less quick charges NOT handled yet — such
invoices sync like any invoice without a customer, check what the sync
does with them before relying on it; ceiling $25,000).

Quick charge (section 1), all web:
- `InvoiceKind.QUICK_CHARGE` (schema; **`npm run db:push` before deploy**),
  `lib/quick-charge.ts`, `POST /api/app/invoices/quick-charge` (QR via the
  `qrcode` package, new dependency), `/app/invoices/request`
  (`RequestPaymentForm.tsx`: ask → share step with Copy / Text it / Email
  it / QR / Open invoice / Tap to Pay), Create tiles (desktop + phone,
  tone d), the contact Create menu, Atlas `request_payment`, the pay page
  header says "Payment request", automations `invoice_kind` option,
  activity labels. Not done from the plan: a kind chip on the Invoices
  list (the list has none for DEPOSIT either), the job-page money block
  button, reminder-scheduler check for `contactId: null` (reminders need a
  contact to email — verify on staging that a client-less quick charge
  simply schedules nothing).

Tap to Pay (section 2):
- Server + web: `PAYMENTS_WRITE_IN_PERSON` in `SQUARE_SCOPES`,
  `SquareStatus.inPerson`, `lib/tap-to-pay.ts` / `lib/tap-to-pay-shared.ts`
  / `lib/native-tap-to-pay.ts`, `GET /api/app/square/mobile-token`,
  `POST /api/app/invoices/[id]/tap-payment`, `components/TapToPayButton.tsx`
  (invoice page + quick-charge share step), `components/TapToPaySetupCard.tsx`
  (Settings → Online Payments, phone app only, Reconnect Square when the
  grant lacks the scope). Everything dark until `TAP_TO_PAY=1`.
- Native: iOS `TapToPayPlugin.swift` + AppDelegate init + pbxproj (package,
  setup script phase, sandboxing off, deployment target 16.0 — the SDK
  package floor; the doc table above said 17.1 from Square's install page,
  the binary itself says 16.0) + Info.plist
  keys + commented entitlement; Android `TapToPayPlugin.java` +
  `HubApplication.java` + Gradle + manifest + minSdk 28. iOS is
  **uncompiled** (no Mac here); its API names were checked against the
  SDK's shipped `.swiftinterface` (see below). Android **compiles** against
  mobile-payments-sdk 2.6.1 on David's PC (gradle
  `:app:compileDebugJavaWithJavac`, 2026-10-22) — the plugin was rewritten
  from the SDK's real signatures (javap on the AAR) after the first pass.
- `npx tsc --noEmit` clean; `scripts/test-quick-charge.ts` passes.

Help Center (section 6) written 2026-10-22 on David's go: new
`request-payment-link` + `tap-to-pay`, and `how-clients-pay` /
`charge-a-saved-card` / `partial-payments-and-deposits` point at them. The
Tap to Pay guide is public before the native builds ship; it says the
button needs the latest app, which is true.

Pushed to `staging` 2026-10-22 (merge of origin/staging 229ddfd5 into the
branch; one conflict in the pay page header resolved for the new
`docType` prop) so David can try the quick charge. Release to main only
after CI + e2e are green and the quick charge is checked on staging.

Open before release: Apple entitlement (David), Square application
signatures (David), application ids into the native projects (David),
both store builds (Mac lane), `TAP_TO_PAY=1` on staging then prod, device
pass recipes 1–14.
