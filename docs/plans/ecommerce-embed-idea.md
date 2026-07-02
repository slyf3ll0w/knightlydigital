# Embeddable ecommerce — idea write-up (2026-07-02)

**Status: parked.** Not scheduled. Captured from a discussion about a
possible alternative (or complement) to Streamflaire Hub with the same
business model: free software, monetized on payment processing.

## The idea in one line

"Add a store to any existing website with one script tag" — an embeddable
cart/checkout (the Snipcart / Ecwid / Shopify Buy Button category), free to
use, monetized on a per-transaction payment cut.

## Why it's interesting

- Same monetization thesis as Streamflaire Hub: the software is the
  distribution channel, payments are the profit center. Snipcart charges 2%
  + gateway fees; Ecwid gates by plan. A genuinely free version monetized
  only on payments is a real wedge — the same wedge Streamflaire is vs
  Jobber.
- We already built the hard embed plumbing once: the booking-form iframe
  embed with the `jobflow:height` postMessage resize protocol (live on
  Excellent PC). An ecommerce embed reuses that pattern directly.
- Merchants keep their existing WordPress/Squarespace/hand-built site — no
  replatforming ask, which makes the sales conversation tiny.

## Two possible shapes

1. **Embeddable commerce (preferred first move)** — hosted dashboard for
   products/orders/inventory; site owners drop in either
   (a) a script tag that turns `data-product-id` elements into
   add-to-cart buttons with a slide-out cart + checkout overlay, or
   (b) an iframe product grid using the existing height protocol.
   Every merchant also gets a minimal hosted product page for free so it
   works with no website at all.
2. **Full hosted storefront** (Shopify-clone territory: themes, page
   editing, SEO, custom domains). Much longer road; overlaps with PageBot's
   JSON page model if ever pursued. Not the first move.

## Strategic angle: module vs standalone

Strong lean toward building it as a **module of Streamflaire Hub** rather
than a separate product:

- Home-service businesses sell things — gift cards, maintenance plans,
  filters, pool chemicals, recurring service subscriptions.
- "Your service software also sells products on your existing website with
  one script tag" is a differentiator Jobber doesn't have.
- Reuses existing auth, clients, payments, and embed infrastructure; every
  sale flows through the payment rail we already monetize.
- A standalone ecommerce SaaS fights Shopify/Ecwid/Snipcart with no
  distribution; a commerce module makes Streamflaire stickier.

## Payments: not Stripe

David's instinct (likely correct): Stripe's flat rate (2.9% + 30¢) leaves
thin platform margins — actual ecommerce interchange + dues runs roughly
1.8–2.4%, and Stripe keeps the spread. With Stripe Connect our revenue is
only the application fee stacked on top.

The payfac-as-a-service route flips it: buy at interchange-plus, set the
merchant rate ourselves, keep the spread. That's why Jobber/Housecall Pro
run their own payments.

- **Finix is the obvious pick** — BotPay is already seeking Finix payfac
  approval. One Finix relationship could power BotPay, Streamflaire
  payments, and this module: one payments backbone across the portfolio.
- Fallbacks if Finix stalls: Rainforest Pay, Tilled, Payrix (Worldpay),
  Fortis, Adyen for Platforms (high volume bar). Or an ISO/referral
  rev-share deal with a smaller processor — less margin, near-zero
  compliance burden, fine for validating.
- Honest costs of skipping Stripe: build our own checkout on the
  processor's tokenization/hosted fields (stays SAQ-A, but the cart→pay UX
  is ours to design and make trustworthy); Apple/Google Pay need
  per-domain certification through the processor; no Radar (need velocity
  checks / 3DS thinking — card-not-present chargeback exposure is real);
  merchant onboarding built against Finix's provisioning API (largely
  reusable from BotPay); no Stripe Tax (MVP: merchant-configured rates,
  TaxJar/Avalara later).

## Architecture note

Build the payments layer behind a provider interface from day one —
`tokenizeCard`, `createCharge`, `refund`, `onboardMerchant` — with a Finix
implementation behind it. Keeps a Stripe fallback (or dual-rail: Stripe for
instant-on merchants, migrate to the payfac rail at volume) cheap.

## MVP scope sketch

Comparable effort to the booking form builder plus payments plumbing:

- Merchant dashboard: products (name, photos, price, variants, stock),
  orders list, settings
- Processor onboarding + checkout (hosted-fields card form, wallets later)
- Embed: vanilla-JS snippet + iframe widget, cart state in localStorage
- Order notification to merchant, confirmation email to buyer (Resend)

**Hard parts that make ecommerce different from invoicing** (fine to defer,
must not be forgotten): shipping (flat-rate MVP; carrier rates/labels via
Shippo/EasyPost later), sales tax, oversell prevention, refunds/partial
refunds, abandoned carts, fraud/chargebacks as a platform.

## Next step when picked up

Decide module-vs-standalone for real, then turn this into a phased build
plan like `online-booking-build-plan.md`.
