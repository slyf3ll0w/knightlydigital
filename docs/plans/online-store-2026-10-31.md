# Online store: products businesses sell from their own page (2026-10-31)

David asked (2026-10-30/31): "is there a way we could create our own online
store? like a way for businesses to create products and add them to their
website or just send the link to purchase?" Yes — and most of it already
existed. This plan builds it in three lanes on top of what WorkBench has:
the price book (`WorkItem`, kind PRODUCT), the public business page
(`/book/<slug>`), the pay page (card, bank, gift card, the service fee) and
the quick-charge invoice pattern the gift card sale proved (a public
purchase = a WorkBench invoice).

**Lane 1 — BUILT 2026-10-31 (branch `store-lane-1`).** Everything below the
line is live; the rest is the plan.

## What a business gets (lane 1)

- **Settings → Services**: a **Product** has a **Sell online** box and, once
  saved, a **photo** for the shop page. The row shows "Sold online" and a
  link button that copies the product's **buy link**; the page shows **Your
  shop** with the shop link.
- **`/book/<slug>/shop`**: every product sold online — photo, name, blurb,
  price — in the booking page's look (theme, font, accent). The business
  page gets a **Shop** row under its items (and a one-item booking page no
  longer renders as a bare form when the shop exists).
- **`/book/<slug>/shop/<itemId>`**: the buy page — the link they text, email
  or put on their website. Quantity (1–20), name, email, phone (optional), a
  note, Turnstile; **Continue to payment · $X** → the pay page.
- **The order** is an `InvoiceKind.STORE_ORDER` invoice: qty × unit price,
  the company's default sales tax when set, subject "Order · 2 × Air
  filter", AWAITING_PAYMENT, issued and due today, line item linked to the
  product. The buyer is matched to an existing client by phone or email,
  else made (leadSource "Online store", not put on the Leads board — a
  buyer is a customer, not a lead to chase). A client in their hub can order
  with their hub token (no captcha, straight onto their record).
- **Paid** = the usual money path: receipt, payment notification to the
  team, Invoices / Payments / reports, the client's hub. The pay page says
  **Order**. Service fee applies like any invoice.
- **Unpaid** orders archive after 48 h (cron step `storeOrders`), so
  abandoned carts never pile up on Invoices.

## Where it lives

- `lib/store-rules.ts` (pure: caps, totals, buyer/quantity checks, subject;
  `npx tsx scripts/test-store.ts`), `lib/store.ts` (`storeProducts`,
  `loadStore`, `loadStoreProduct`, `createStoreOrder`, `runStoreOrderSweep`,
  `storePhotoUrl`).
- Public: `app/book/[slug]/shop/page.tsx`, `…/shop/[itemId]/page.tsx` +
  `BuyForm.tsx`, `…/shop/ShopRow.tsx`; `POST /api/public/store/[slug]`
  (rate limit, Turnstile, honeypot, too-fast — the booking form's guards);
  `GET /api/public/store-photos/[itemId]`.
- Staff: `WorkItem.sellOnline / photoKey / photoMime` (`POST`/`PATCH
  /api/app/work-items` take `sellOnline`; a SERVICE is never listed);
  `POST`/`DELETE /api/app/work-items/[id]/photo` (R2 via lib/blob-storage —
  without it the editor says photos aren't set up);
  `app/platform/settings/products/ProductsClient.tsx` + `ProductPhoto.tsx`.
- Schema: `WorkItem.sellOnline`, `photoKey`, `photoMime`, index
  `(companyId, sellOnline)`; `InvoiceKind.STORE_ORDER` (pay page label
  "Order", automations enum).
- Help: `sell-products-online`. e2e: `e2e/specs/store.spec.ts`.

## Lane 2 — a real shop (planned)

- **Cart**: several products in one order (one invoice, one line each);
  quantity steppers on the shop page; a cart drawer; the buy page becomes
  "add to cart" with a direct "buy now".
- **Pickup or delivery**: per company (Settings → Services → Shop
  settings): pickup at the shop address, local delivery with a flat fee or
  a radius, or "we'll bring it on the next visit"; the choice and the
  address land on the invoice and (optionally) create a **job** for the
  delivery so it is scheduled and routed like any visit.
- **Stock**: optional on-hand count per product, decremented on payment,
  "sold out" on the page, low-stock nudge on Home.
- **Orders view**: Invoices gets an **Orders** filter (kind STORE_ORDER)
  with fulfilment state (new / packed / delivered) and the buyer's note up
  front; a paid order pushes a notification that reads "Order: 2 × Air
  filter — Maria Lopez" instead of the generic payment line.
- **Buyer account**: the pay page offers the hub link after payment
  ("track your order"); the hub shows orders under their invoices.

## Lane 3 — on their website (planned)

- **Embed widget**: `/embed/<slug>/shop` and `/embed/<slug>/shop/<itemId>`
  in the estimator-embed shell (auto-resize, host accent), plus a copyable
  `<iframe>` snippet and a **Buy button** snippet (one product, one button)
  on the product row.
- **WorkBench-built client sites** (lane 1 of client websites): a "Shop"
  block the studio can drop in, reading the same products.
- **Variants** (size, color) as child items; **digital goods** (a file sent
  after payment); **gift card as a product** (sell the Square gift card
  from the shop page — it already has the activation path).

## Decisions taken in lane 1 (ask if any should change)

- Sales tax = the company's default rate, applied to products (services
  on invoices use the same rate).
- A product's price on the shop is its exact unit price (price display
  styles are a booking-page thing).
- Orders need an email; phone is optional. No account, no password.
- A purchase never creates a job by itself (fulfilment is lane 2).
- Square gift cards keep their own door (Payments → Gift cards).
