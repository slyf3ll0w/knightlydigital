# Square products inside WorkBench: transactions, gift cards, loyalty (2026-10-30)

> **Update, later on 2026-10-30:** the loyalty half and the Square Online
> deep link were **removed** at David's request — Square Loyalty needs a
> Square subscription WorkBench won't promote. What remains: the transaction
> detail and gift cards. Scopes are `ORDERS_READ` + `GIFTCARDS_READ/WRITE`;
> the schema kept `GiftCardSale` and `PaymentMethod.GIFT_CARD` and dropped
> `Contact.squareLoyaltyAccountId` and `SquareConnection.loyalty*`. The
> loyalty sections below describe what was built, for the record.

**Status: BUILDING 2026-10-30 (branch `square-products`).** David asked which of the
"In Square" deep links on `/app/payments` could be built natively through
Square's API for WorkBench's clients, and chose all three that can be: the
transaction detail (itemized sales + receipts), gift cards, and loyalty.
Square Online stays a link — Square's only APIs for it list a seller's sites
and inject a code snippet; nothing builds or manages the store.

Companion to `plan-gating-square-billing-2026-10-28.md` § 3 (the Payments
section) — same files, same seller-token read pattern
(`lib/square-seller-reports.ts` → `SellerRead`), same tabs.

## What Square's API allows (checked 2026-10-30)

| Product | API | Built here |
| --- | --- | --- |
| Transactions | Payments API already read; **Orders API** (`ORDERS_READ`) gives the itemization behind a payment; `receipt_url` is Square's hosted receipt | A detail screen for any payment (ours or a POS / Online sale): items, modifiers, taxes, tip, fee, card, refunds, receipt |
| Gift cards | **Gift Cards API** + **Gift Card Activities API** (`GIFTCARDS_READ/WRITE`): create digital cards, activate / load with an amount, list activities, link to a customer; a card is REDEEMED by paying with it through the Payments API (`source_id` = the gift card id). Square charges the seller 2.5% of what is loaded (US) | Sell (an invoice the buyer pays, the card activates when it is paid), balance check, redeem on an invoice — staff side and on the pay page |
| Loyalty | **Loyalty API** (`LOYALTY_READ/WRITE`): the program is created in the Square dashboard (needs a Square Loyalty subscription), the API enrolls members, calculates / accumulates / adjusts points, creates and redeems rewards | Program card (or "set it up in Square"), enroll a client, points accrue on every WorkBench payment, give a reward on an invoice as a discount, adjust points; the client sees points in the hub |
| Square Online | Sites API (list) + Snippets API (inject a script) only; no sandbox | Deep link only |

## Design

- **Scopes.** `SQUARE_SCOPES` gains `ORDERS_READ`, `GIFTCARDS_READ`,
  `GIFTCARDS_WRITE`, `LOYALTY_READ`, `LOYALTY_WRITE`. Existing grants lack
  them → `SquareStatus.missingScopes` → the one-time Reconnect card on the
  Payments page (the wording now lists what is new). Each tab checks its own
  scope and shows Reconnect in place.
- **Transactions.** `?payment=<square id>` on the Payments tab renders
  `TransactionDetail`: GetPayment (status, amounts, tip, fee, card brand /
  last 4 / entry method, note, reference, receipt link, refunds by
  `refund_ids`) and, when the payment carries `order_id`, RetrieveOrder's
  line items (name, variation, quantity, unit price, modifiers, discounts,
  taxes, service charges). WorkBench rows keep linking to their invoice and
  gain a "Details" link; outside-WorkBench rows open the detail. The
  "All transactions" deep link goes away.
- **Gift cards** (`lib/gift-cards.ts`, `GiftCardSale` model). *Sell*: amount
  + optional client + recipient name / email / note → a DIGITAL Square gift
  card (PENDING, $0; linked to the client's Square customer when there is
  one) + a QUICK_CHARGE invoice "Gift card" on the client (or a bare pay
  link). The invoice is paid like any invoice (pay link, card on file, Tap
  to Pay, cash). When it is PAID (`recordPayment` hook) the card is
  ACTIVATED for the amount — `buyer_payment_instrument_ids` = the Square
  payment id when the money went through Square, else the WorkBench payment
  id — and the recipient (or buyer) is emailed the card number and balance.
  A failed activation is retried by the hourly cron and shown on the tab.
  *Balance*: RetrieveGiftCardFromGAN. *Redeem*: on an invoice (staff ⋯ menu
  "Redeem a gift card", and the pay page's "Gift card" method): the card id
  becomes `source_id` of a CreatePayment for min(balance, invoice balance)
  → `recordPayment` with the new `PaymentMethod.GIFT_CARD`; Square writes
  the REDEEM activity itself. A refund of that payment (existing route,
  `refundSquarePayment`) puts the money back on the card. No surcharge on
  gift-card payments. *Tab*: cards the account holds (ListGiftCards:
  state, balance, number, who it is linked to), each with its activities;
  Sell and Check a balance buttons.
- **Loyalty** (`lib/loyalty.ts`). The program is read with the seller token
  (RetrieveLoyaltyProgram `main`) and cached on `SquareConnection`
  (`loyaltyProgramId`, `loyaltyStatus` ACTIVE | INACTIVE | NONE,
  `loyaltyCheckedAt`, refreshed on the tab, on Check connection, and in
  the hourly `squareTokens` step). No program → the tab says so with the
  dashboard link. *Enroll*: a contact with a phone → SearchLoyaltyAccounts
  by phone (adopt) else CreateLoyaltyAccount (phone mapping + Square
  customer) → `Contact.squareLoyaltyAccountId`. The hub home shows "Join
  rewards" for an un-enrolled client with a phone and their points when
  enrolled. *Accrue*: every processor or manual payment on an invoice whose
  contact is enrolled → CalculateLoyaltyPoints(transaction amount) →
  AccumulateLoyaltyPoints (idempotency = the Payment id; best effort,
  never fails recording). *Reward*: the invoice ⋯ menu "Use a reward" lists
  the program's tiers the client can afford → CreateLoyaltyReward (no
  order) → the invoice's discount is set to the tier's amount or
  percentage (`computeQuoteTotals` recomputes) → RedeemLoyaltyReward;
  any failure after the reward exists deletes it (points return). *Adjust*:
  managers add or remove points with a reason. *Tab*: program (terminology,
  accrual rule, tiers, status), members (SearchLoyaltyAccounts joined to
  contacts by phone, points), Enroll a client.
- **Contact page**: a Rewards card (points, enroll, adjust) and the
  client's gift cards (ListGiftCards by customer) when the company has
  the scopes.
- **Hooks in `lib/payments.ts recordPayment`** (dynamic imports, best
  effort): `activateGiftCardForInvoice` when fully paid,
  `accrueLoyaltyForPayment` on every payment.
- **Routes**: `/api/app/payments/square/gift-cards` (GET list, POST sell),
  `…/gift-cards/[id]` (GET activities), `…/gift-cards/lookup?gan=`,
  `/api/app/invoices/[id]/gift-card` (POST redeem),
  `/api/app/payments/square/loyalty` (GET program + members),
  `…/loyalty/enroll` (POST contactId), `…/loyalty/adjust` (POST),
  `/api/app/invoices/[id]/loyalty-reward` (POST tierId), `/api/hub/loyalty`
  (POST join). `/api/public/pay/[token]` takes `{ method: "GIFT_CARD", gan }`.
- **Schema** (additive; `db:predeploy` applies it on deploy): `GiftCardSale`,
  `Contact.squareLoyaltyAccountId`, `SquareConnection.loyaltyProgramId /
  loyaltyStatus / loyaltyCheckedAt`, `PaymentMethod.GIFT_CARD`.
- **Tests**: `scripts/test-square-products.ts` (order mapping, gift card
  words, reward → discount math, points math); e2e `square-gift-cards.spec.ts`
  against the sandbox seller (sell → pay → ACTIVE → balance → redeem);
  loyalty e2e covers the "no program" state only (a sandbox program needs a
  dashboard subscription).

## Not built (yet)

- Loyalty promotions, points expiry display, reward tiers tied to a catalog
  item (only ORDER-level fixed amount / percentage rewards apply to an
  invoice; item-level tiers are listed but not redeemable here).
- Physical gift cards (registering a card by its printed number), eGift
  designs / themed emails, gift card refunds to cash.
- Atlas tools for any of it.
- Square Online (no API).
