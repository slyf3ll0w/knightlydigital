import { RATE_CARD, RATE_ACH, FEE_CARD_PCT } from "../plan-copy";
import type { HelpSection } from "../types";
import { PRO_CHIP, proTip } from "../plan-copy";

export const invoicesSection: HelpSection = {
  id: "invoices",
  title: "Invoices",
  icon: "invoices",
  tagline: "Bill the work, send reminders, collect partial payments.",
  articles: [
    {
      slug: "send-an-invoice",
      title: "Create and send an invoice",
      summary: "Invoice from a job or from scratch, then email a pay link.",
      keywords: ["invoice", "bill", "pay link", "payment link", "email invoice", "due date", "new invoice"],
      where: { label: "Invoices", href: "/app/invoices" },
      roles: "Owners, admins and Sales + Tech",
      blocks: [
        {
          type: "steps",
          items: [
            "From a finished job, press `Create invoice`. Or go to **Invoices** and press `New`.",
            "Check the customer, the **Due date**, the line items, tax and any discount. Add a **Client message** if you want. Not in the list yet? `New client` at the bottom of the picker (or `Add \"<name>\" as a new client` once you've typed a name) opens a small sheet — first name, last name, phone, email — and `Add client` puts them straight on it.",
            "Save it. It starts as a **Draft**.",
            "Press `Send to client`. The pay link goes by email, and by text from your business line once texting is on (Settings → Phone & texting → `Turn on text notifications`). When both are possible you pick **Email**, **Text** or both; a client with only a phone number gets the text alone. The invoice moves to **Awaiting Payment**. Not ready to send yet? Tick **Send later** in that sheet and pick a day and time: the invoice stays a draft you can keep editing (its chip reads **Scheduled**), goes out by itself at that time — the due date counts from then — and you get a notification either way. Until then the invoice page shows `Send now` and `Cancel`.",
          ],
        },
        {
          type: "p",
          text: "The ⋯ menu has `Copy payment link`, `Download PDF`, `Preview as client`, `Duplicate invoice` and `Archive`.",
        },
        {
          type: "tip",
          text: "An invoice due today isn't late. It turns **Past Due** only after the due date has fully passed.",
        },
        {
          type: "faq",
          items: [
            {
              q: "Send to client failed.",
              a: "If the button says `Mark as sent`, the client has no email on file and no phone that can be texted: add one on their client page. For anything else, use `Copy payment link`, send it yourself, and try again later.",
            },
            {
              q: "I left an invoice and it asked \"Send this invoice first?\"",
              a: "The invoice is still a Draft nobody has sent. `Stay` keeps you on it; `Leave without sending` lets you go and the draft waits until you send it or press `Mark as sent`. A draft you sent by link marks itself the moment the client opens it: it moves to **Awaiting Payment** with a due date, just as if you had pressed Send.",
            },
            {
              q: "I can't edit a paid invoice.",
              a: "Paid invoices are locked so the paperwork matches the money. Press `Reopen invoice` if you really need to change it.",
            },
            {
              q: "Deleting an invoice asks me to type DELETE.",
              a: "The invoice has payments recorded, and deleting it deletes those payment records too. Usually you want `Archive` instead.",
            },
          ],
        },
      ],
    },
    {
      slug: "request-payment-link",
      title: "Request a payment (a pay link in seconds)",
      summary: "Type an amount and what it's for; get a link to text, email, copy or have scanned. No invoice editor.",
      keywords: ["request payment", "payment request", "quick charge", "pay link", "checkout link", "payment link", "qr code", "charge someone", "walk-up", "no client"],
      where: { label: "Request payment", href: "/app/invoices/request" },
      roles: "Owners, admins and Sales + Tech (anyone who can see money)",
      blocks: [
        {
          type: "p",
          text: "For the \"just charge them $120\" moments. A payment request is an invoice with the editor skipped: one amount, one line, and a pay link you can hand over on the spot. The money lands in your reports, reminders and QuickBooks sync exactly like any other invoice.",
        },
        {
          type: "steps",
          items: [
            "Press **Create** and pick `Request payment` (on a client's page it's in their Create menu, with the client already filled in).",
            "Type the **Amount** and **What for** (one line — it becomes the invoice subject). Pick a **Client** if you want to text or email them; leave it empty for someone who isn't a client yet. `+ Note or tax` adds a note for the pay page and a tax percentage.",
            "Press `Get link`. The link is live from this moment.",
            "Share it: `Copy`, `Text it` (from your business line), `Email it`, or let them point their phone camera at the **QR code** on your screen. `Open invoice` takes you to the invoice behind it.",
          ],
          note: "Scan the code from your phone or laptop screen — no printing, no typing.",
        },
        {
          type: "list",
          items: [
            "Amounts run from $1 to $25,000. For more, make a full invoice.",
            "It shows on **Invoices** as **Awaiting Payment** with the subject you typed, numbered in your normal sequence; the pay page says **Payment request** under the number.",
            "Clients can pay part of it, like any invoice. Card surcharge, saved cards and bank (ACH) all work the same.",
            "In the WorkBench phone app the share step also offers `Tap to Pay` when it's set up — see [Take a card in person](/help/tap-to-pay).",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "Text it or Email it is greyed out.",
              a: "No client was picked, so there is nobody to send to — use `Copy` or the QR code. With a client picked, texting needs a phone number on file, no opt-out, and texting turned on for your business line; emailing needs an email on file. The (i) next to the buttons says which one is missing.",
            },
            {
              q: "I need to change the amount.",
              a: "Press `Open invoice` and edit it like any invoice (until it's paid). The link stays the same.",
            },
            {
              q: "Will they get reminders?",
              a: "Only when a client is on the request — reminders go by email and text, and a request with no client has nowhere to send them.",
            },
          ],
        },
      ],
    },
    {
      slug: "payment-reminders",
      title: "Automatic payment reminders",
      summary: "WorkBench emails clients about unpaid invoices on a set schedule, and stops when they pay.",
      keywords: ["reminder", "overdue", "past due", "late", "dunning", "follow up", "stop reminders"],
      where: { label: "Invoices", href: "/app/invoices" },
      blocks: [
        {
          type: "p",
          text: "Once an invoice is sent, reminders go out by themselves: **on the due date**, then **3, 7 and 14 days** past due. Each reminder is sent once, with the pay link.",
        },
        {
          type: "list",
          items: [
            "Reminders stop the moment the balance hits zero.",
            "Archiving an invoice stops its reminders too.",
            "For a nudge on a different schedule, build an [automation](/help/build-an-automation) with **Send a payment reminder**.",
          ],
        },
      ],
    },
    {
      slug: "partial-payments-and-deposits",
      title: "Partial payments and deposits on invoices",
      summary: "Let clients pay part of a balance, and how deposits come off the final bill.",
      keywords: ["partial", "split payment", "installment", "part payment", "deposit applied", "balance"],
      blocks: [
        {
          type: "p",
          text: "On the pay page, clients choose **Full balance** or **Another amount** (at least $1). Whatever they don't pay stays on the invoice, and reminders keep going until it's paid.",
        },
        {
          type: "list",
          items: [
            "**Deposit invoices** must be paid in full. Payment requests (Create → `Request payment`) can be split like any other invoice.",
            "Balances of $1 or less must be paid in full.",
            "Deposits already paid come off the final invoice automatically, shown as **Deposit applied**.",
          ],
        },
      ],
    },
  ],
};

export const paymentsSection: HelpSection = {
  id: "payments",
  title: "Payments",
  icon: "payments",
  tagline: "Card and bank payments, fees, refunds, payouts and disputes.",
  articles: [
    {
      slug: "how-clients-pay",
      title: "How clients pay you online",
      summary: "The pay page, card vs bank (ACH), saved cards, and the fees.",
      keywords: ["pay page", "card", "credit card", "ach", "bank transfer", "fees", "processing fee", "saved card", "card on file", "no pay button", "square"],
      where: { label: "Payments", href: "/app/payments" },
      blocks: [
        {
          type: "p",
          text: "Every invoice you send has a pay link. The client picks **Card** or **Bank transfer**, can tick a box to keep their card on file, and presses **Pay**. Once it goes through the invoice is stamped **Paid** right on the page.",
        },
        {
          type: "list",
          items: [
            `Card payments cost **${RATE_CARD}** and bank payments **${RATE_ACH}** when you pay the fee yourself. Or pass the card fee on as a service fee the client pays at checkout (see [Add a card service fee](/help/card-surcharging)). Fees come out on Square's side before the money reaches your bank, so the fee WorkBench shows is an estimate; your Square dashboard has the exact amount on each payment.`,
            "Bank (ACH) payments show as **Processing** for a few business days. They can still bounce during that time, and if one does it's taken back off the invoice.",
            "Clients can also save cards and pick a default for autopay in their client portal.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "My client says there's no Pay button.",
              a: "Square isn't connected to your WorkBench account, so the page tells them you aren't taking payments online. See [Turn on online payments](/help/activate-payments).",
            },
            {
              q: "Can I take a card in person?",
              a: "Yes — in the WorkBench phone app, `Tap to Pay` on an invoice lets the client hold their card or phone to the back of yours: see [Take a card in person](/help/tap-to-pay). From a desk, save the client's card on their client page (or have them save it in the portal) and use `Charge card` on the invoice.",
            },
            {
              q: "Can I charge someone without making an invoice first?",
              a: "Yes: Create → `Request payment` makes a pay link from an amount and a line of text — [Request a payment](/help/request-payment-link).",
            },
          ],
        },
      ],
    },
    {
      slug: "charge-a-saved-card",
      title: "Charge a card on file",
      summary: "Bill an invoice to a card the client already saved.",
      keywords: ["charge card", "saved card", "card on file", "stored card", "autopay"],
      where: { label: "Invoices", href: "/app/invoices" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Open the invoice (it has to be Awaiting Payment or Past Due).",
            "Press `Charge card`, or pick a specific card in the ⋯ menu.",
            "Confirm the amount. The payment is recorded and the invoice updates straight away.",
          ],
        },
        {
          type: "tip",
          text: "Card surcharges are never added when you charge a saved card yourself. Client standing in front of you with their card? In the phone app use `Tap to Pay` instead — [Take a card in person](/help/tap-to-pay).",
        },
      ],
    },
    {
      slug: "tap-to-pay",
      title: "Take a card in person (Tap to Pay)",
      summary: "In the phone app, the client holds their card or phone to the back of yours. No reader.",
      keywords: ["tap to pay", "tap-to-pay", "contactless", "nfc", "in person", "on site", "card reader", "apple pay", "google pay", "square reader", "take a card"],
      where: { label: "Online Payments", href: "/app/settings" },
      roles: "Anyone who can see money can take a payment; owners and admins set it up",
      blocks: [
        {
          type: "p",
          text: "Tap to Pay turns the WorkBench phone app into the card reader: the client taps their card, phone or watch on the back of your phone and the invoice is paid. It runs through your own Square account at Square's in-person rate — usually cheaper than a card typed online. Needs an iPhone XS or newer on iOS 16.7+, or an Android phone with NFC on Android 9+, and the latest WorkBench app from the App Store or Google Play.",
        },
        {
          type: "h",
          text: "Set it up once per phone",
        },
        {
          type: "steps",
          items: [
            "Connect Square first (Settings → Payments & accounting → Online Payments). If the card there says **Reconnect Square to turn on Tap to Pay**, press `Reconnect Square` — Square needs one extra permission for in-person payments.",
            "On the phone app, open the same card: **Tap to Pay on this phone** → `Set up`.",
            "Allow **location** when asked. Square requires it for every in-person payment.",
            "iPhone only: Apple shows its Tap to Pay terms — sign in with your Apple ID and accept. Done when the card says **Ready**.",
          ],
        },
        {
          type: "h",
          text: "Take a payment",
        },
        {
          type: "steps",
          items: [
            "Open the invoice in the phone app (Awaiting Payment or Past Due) and press `Tap to Pay`. The amount is the balance, plus your card surcharge if you have that turned on — the button shows the total.",
            "Square's screen says **Hold card here**. The client holds their card or phone to the top/back of your phone until it buzzes.",
            "Square may offer the client a text or email receipt. WorkBench records the payment, shows the approved screen and sends its usual paid email when the invoice has a client.",
          ],
        },
        {
          type: "tip",
          text: "The share step of `Request payment` has the same `Tap to Pay` button — type an amount, tap, done, no invoice editor.",
        },
        {
          type: "faq",
          items: [
            {
              q: "I don't see a Tap to Pay button.",
              a: "It only exists in the WorkBench phone app (not Safari or Chrome), on a phone that can take contactless payments, once Square is connected and your app is up to date. If Settings → Online Payments says **Reconnect Square to turn on Tap to Pay**, the account owner needs to do that first.",
            },
            {
              q: "It said \"Cancelled — nothing was charged\".",
              a: "The card was pulled away or the screen was dismissed before the tap finished. Press `Tap to Pay` again.",
            },
            {
              q: "The card was declined.",
              a: "Same as any card decline — ask for another card, or send the pay link so they can pay by bank.",
            },
            {
              q: "The card was charged but the invoice still shows a balance.",
              a: "Square confirmed the tap but WorkBench couldn't reach Square to record it. It is matched to the invoice within a few minutes on its own; refresh the invoice. If it's still open after an hour, find the payment in your Square dashboard and [contact us](/app/help).",
            },
            {
              q: "Where is the money?",
              a: "In your Square balance, paid out on your Square schedule — the same as online payments. Fees and payouts are in your Square dashboard.",
            },
          ],
        },
      ],
    },
    {
      slug: "record-cash-or-check",
      title: "Record a cash, check or other payment",
      summary: "Log payments you took outside WorkBench so balances stay right.",
      keywords: ["cash", "check", "zelle", "venmo", "cash app", "paypal", "offline payment", "manual payment", "collect payment"],
      where: { label: "Payments", href: "/app/payments/new" },
      blocks: [
        {
          type: "steps",
          items: [
            "On the invoice, press `Collect payment` (or `Collect other payment` in the ⋯ menu).",
            "Pick the method (Cash, Check, Cash App, PayPal, Venmo, Zelle or Other) and add a reference like a check number.",
            "Save. The invoice balance updates. No money moves. This is bookkeeping only.",
          ],
        },
        {
          type: "p",
          text: "Made a mistake? Edit or delete the payment record. Recorded payments can't be \"refunded\" in WorkBench because no money went through it.",
        },
      ],
    },
    {
      slug: "refund-a-payment",
      title: "Refund a payment",
      summary: "Send all or part of an online payment back to the client's card or bank.",
      keywords: ["refund", "reverse", "give money back", "partial refund", "chargeback"],
      where: { label: "Payments", href: "/app/payments" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Payments** (or open the invoice's payment list).",
            "Press the **↺** refund button on the payment.",
            "Enter the amount (a partial refund is fine) and confirm.",
            "The money goes back to the card or bank it came from, and the invoice balance updates.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "There's no refund button on a payment.",
              a: "Only online payments can be refunded. For cash, check and other recorded payments, edit or delete the record instead. On a computer the button appears when you hover over the row.",
            },
          ],
        },
      ],
    },
    {
      slug: "payouts",
      title: "When you get paid out",
      summary: "Payouts come from Square, on Square's schedule, to the bank account on your Square account.",
      keywords: ["payout", "deposit", "bank", "settlement", "when do i get paid", "transfer", "square dashboard", "balance"],
      where: { label: "Payments", href: "/app/payments" },
      blocks: [
        {
          type: "p",
          text: "Payouts are handled by **Square**, not WorkBench. Card payments typically reach your bank the next business day; Square also offers instant and same-day transfers, and a different schedule, from your Square dashboard. Bank (ACH) payments show as **Processing** for a few business days before they pay out.",
        },
        {
          type: "list",
          items: [
            "Open **Payments** and press `Square dashboard` to see your balance, your payout history and the exact fee on each payment.",
            "The payments list in WorkBench is what came in and which invoice it paid; the money itself lives in Square.",
            "`Export` downloads your payments as a CSV for your bookkeeper.",
          ],
        },
      ],
    },
    {
      slug: "disputes",
      title: "Respond to a dispute (chargeback)",
      summary: "When a client disputes a card charge, answer it in your Square dashboard before the deadline.",
      keywords: ["dispute", "chargeback", "evidence", "fraud claim", "square dashboard"],
      where: { label: "Payments", href: "/app/payments" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "p",
          text: "Disputes are handled by **Square**. When a client's bank disputes a charge, Square emails you and lists it under **Disputes** in your Square dashboard, with a respond-by date.",
        },
        {
          type: "steps",
          items: [
            "Open **Payments** and press `Square dashboard`, then go to **Disputes**.",
            "Follow Square's prompts to upload what shows the work was agreed and done: the signed quote, the invoice, job photos, the client's sign-off, messages. PDF, JPG and PNG work.",
            "Submit before the respond-by date. The card network decides the outcome.",
          ],
        },
        {
          type: "tip",
          text: "Signed quotes, the client's job sign-off and before/after photos are your best evidence. Collecting them as you go makes disputes much easier.",
        },
        {
          type: "warn",
          text: "A lost dispute is taken back by Square on their side. WorkBench doesn't change the invoice on its own, so edit or delete the payment record if you want your books to match.",
        },
      ],
    },
    {
      slug: "card-surcharging",
      title: "Add a card service fee (surcharge)",
      summary: "Pass the card fee on to clients who pay by card, and receive the full invoice amount.",
      keywords: ["surcharge", "service fee", "convenience fee", "card fee", "pass fees"],
      where: { label: "Payments settings", href: "/app/settings" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Settings → Payments & accounting**.",
            `Turn on **Enable surcharging** and set the **Surcharge rate** (0–10%). The standard service fee is **${FEE_CARD_PCT}**, which is what a new account starts with.`,
            "Save. Clients who pay by card see the surcharge and a note that paying by bank avoids it.",
          ],
        },
        {
          type: "warn",
          text: "Surcharges only apply to cards the client pays with on the pay page. Surcharge rules vary by state, so check yours before turning it on.",
        },
      ],
    },
  ],
};

export const agreementsSection: HelpSection = {
  id: "agreements",
  title: "Agreements",
  icon: "agreements",
  tagline: "Contracts clients sign online, and services that require them.",
  articles: [
    {
      slug: "send-an-agreement",
      title: "Send an agreement for e-signature",
      summary: "Write a template once, send it to any client, and track the signature.",
      plan: PRO_CHIP,
      keywords: ["contract", "agreement", "e-sign", "signature", "template", "terms", "signing link expired"],
      where: { label: "Agreements", href: "/app/contracts" },
      roles: "Owners, admins and sales roles",
      blocks: [
        proTip("Agreements"),
        {
          type: "steps",
          items: [
            "Make a template under **Settings → Agreement templates**. Use `{{client_name}}`, `{{company_name}}` and `{{date}}` and they fill in for each client. (Atlas can write one for you: \"write a lawn care service agreement.\")",
            "Go to **Agreements** and press `New agreement`. Pick the client and a template, or start from a blank contract.",
            "Press `Send for signature` (`Email for signature` until texting is on) — by email, by text from your business line, or both — or `Copy signing link` to send it yourself.",
            "The client types their name and ticks the consent box. The status goes **Awaiting Signature** → **Signed**.",
          ],
        },
        {
          type: "tip",
          text: "A service in your price book can require an agreement, sent automatically when its quote is sent or approved. The quote can't be turned into a job until it's signed.",
        },
        {
          type: "faq",
          items: [
            {
              q: "My client says the signing link expired.",
              a: "Signing links last 30 days. Open the agreement and press `Send signing link again` (`Email signing link again` until texting is on).",
            },
          ],
        },
      ],
    },
  ],
};
