import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { notifyUsers } from "@/lib/push";
import {
  SquareError,
  createSquareCard,
  createSquareCustomer,
  createSquarePayment,
  declineMessage,
  disableSquareCard,
  isTransientSquareError,
  squareApplicationId,
  squareEnvironment,
} from "@/lib/square";
import * as api from "@/lib/square-billing-api";
import {
  parseSquareDate,
  planChange,
  productForVariation,
  reduceSubscription,
  sumEntitlements,
  variationIdFor,
} from "@/lib/plan-subscriptions";
import {
  DISPATCH_SETUP_CENTS,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  PLAN_HOLDER_SELECT,
  annualCents,
  hasPlan,
  planSource,
  productName,
  productPlans,
  productPriceCents,
  productSellable,
  seatLimit,
  type BillingCadence,
  type BillingProduct,
  type PlanId,
  type PlanSource,
} from "@/lib/plans";
import type { SquareClientConfig } from "@/lib/pay-config";
import type { PlanSubscription } from "@prisma/client";

/**
 * Plan billing — WorkBench's own paid plans, sold through WORKBENCH'S Square
 * account with the Subscriptions API (docs/plans/plan-gating-square-billing-2026-10-28.md).
 *
 * The owner enters a card on Settings → Plans (Square's Web Payments SDK,
 * mounted with OUR application id + OUR billing location, so the token is
 * ours to vault); we create the company as a Square CUSTOMER of ours
 * (Company.squareBillingCustomerId, reference_id = companyId), put the card
 * on file (squareBillingCardId) and create one Square SUBSCRIPTION per
 * product (PlanSubscription rows). Square then charges the card every
 * period, retries, and emails an invoice when a charge fails. We never bill
 * anything ourselves except the one-time Voice setup fee.
 *
 * Entitlement is derived, never typed: `applySquareSubscription` turns a
 * Square subscription into a row (lib/plan-subscriptions.ts reduceSubscription
 * decides `entitled`), `syncCompanyEntitlements` sums the rows into
 * Company.paidPlans / paidSeats, which lib/plans.ts hasPlan() reads next to
 * the superadmin grants. Voice paid here also stamps addonActiveAt (the
 * business line's own switch, lib/addon.ts) and Pro also starts Atlas Full
 * (atlasPlanActiveAt), the way a superadmin grant does.
 *
 * Inputs reach us three ways, all ending in refreshSubscription:
 *  - our own calls (subscribe / cancel / resume / card / seats),
 *  - the billing webhook (/api/public/webhooks/square-billing),
 *  - the hourly sweep (runPlanBillingSweep) for anything the webhook missed.
 *
 * Env: SQUARE_BILLING_ACCESS_TOKEN (our account's token for the
 * SQUARE_ENVIRONMENT in use), SQUARE_BILLING_LOCATION_ID, the plan
 * variation ids SQUARE_PLAN_<PRODUCT>_<CADENCE> (scripts/square-billing-setup.ts
 * creates the plans and prints them), SQUARE_BILLING_WEBHOOK_SIGNATURE_KEY
 * (+ optional SQUARE_BILLING_WEBHOOK_URL). Unset = Settings → Plans says
 * checkout isn't switched on yet.
 */

export function planBillingToken(): string {
  return (process.env.SQUARE_BILLING_ACCESS_TOKEN ?? "").trim();
}

export function planBillingLocationId(): string {
  return (process.env.SQUARE_BILLING_LOCATION_ID ?? "").trim();
}

export function planBillingConfigured(): boolean {
  return Boolean(planBillingToken() && planBillingLocationId() && squareApplicationId());
}

/** What the browser needs to tokenize a card for OUR account (Settings → Plans). */
export function planBillingPayConfig(): SquareClientConfig | null {
  if (!planBillingConfigured()) return null;
  return {
    processor: "square",
    applicationId: squareApplicationId(),
    locationId: planBillingLocationId(),
    environment: squareEnvironment(),
  };
}

export class PlanBillingError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status = 400, code: string | null = null) {
    super(message);
    this.name = "PlanBillingError";
    this.status = status;
    this.code = code;
  }
}

/** The HTTP status + message for a Square failure during a billing action. */
export function billingErrorResponse(err: unknown): { status: number; error: string; code?: string } {
  if (err instanceof PlanBillingError) return { status: err.status, error: err.message, ...(err.code ? { code: err.code } : {}) };
  if (err instanceof SquareError) {
    if (isTransientSquareError(err)) return { status: 424, error: "Square didn't answer. Nothing was charged — try again in a moment." };
    if (err.category === "PAYMENT_METHOD_ERROR" || /DECLINED|INSUFFICIENT|CVV|EXPIR|INVALID_CARD/i.test(err.code ?? "")) {
      return { status: 402, error: declineMessage(err.code), code: "CARD_DECLINED" };
    }
    return { status: 424, error: err.message || "Square refused the request." };
  }
  return { status: 500, error: "Something went wrong." };
}

const SELECT = {
  id: true,
  name: true,
  timezone: true,
  ...PLAN_HOLDER_SELECT,
  addonLiverySubId: true,
  atlasPlanActiveAt: true,
  lineNumber: true,
  dispatchSetupPaidAt: true,
  squareBillingCustomerId: true,
  squareBillingCardId: true,
  squareBillingCardBrand: true,
  squareBillingCardLast4: true,
} as const;

type BillingCompany = NonNullable<Awaited<ReturnType<typeof loadCompany>>>;

async function loadCompany(companyId: string) {
  return prisma.company.findUnique({ where: { id: companyId }, select: SELECT });
}

async function requireCompany(companyId: string): Promise<BillingCompany> {
  const c = await loadCompany(companyId);
  if (!c) throw new PlanBillingError("Company not found.", 404);
  return c;
}

function requireConfigured(): { token: string; locationId: string } {
  if (!planBillingConfigured()) {
    throw new PlanBillingError("Online checkout isn't switched on yet. Message us from the Help Center and we'll set your plan up.", 503, "NOT_CONFIGURED");
  }
  return { token: planBillingToken(), locationId: planBillingLocationId() };
}

// ── Customer + card on file ──

async function ensureBillingCustomer(company: BillingCompany): Promise<string> {
  if (company.squareBillingCustomerId) return company.squareBillingCustomerId;
  const { token } = requireConfigured();
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { email: true, name: true },
  });
  const [first, ...rest] = (owner?.name ?? company.name).trim().split(/\s+/);
  const customer = await createSquareCustomer({
    token,
    idempotencyKey: `wb-billing-customer:${company.id}`,
    firstName: first || company.name,
    lastName: rest.join(" ") || null,
    email: owner?.email ?? null,
    referenceId: company.id,
  });
  await prisma.company.update({ where: { id: company.id }, data: { squareBillingCustomerId: customer.id } });
  return customer.id;
}

/**
 * Vault a one-time Web Payments token as THE company's card: every active
 * subscription is moved onto it and the previous card is disabled. Returns
 * the stored card.
 */
export async function putCardOnFile(companyId: string, sourceId: string): Promise<{ cardId: string; brand: string | null; last4: string | null }> {
  const { token } = requireConfigured();
  const company = await requireCompany(companyId);
  const customerId = await ensureBillingCustomer(company);
  const card = await createSquareCard({
    token,
    idempotencyKey: `wb-billing-card:${companyId}:${sourceId.slice(-16)}`,
    sourceId,
    customerId,
    referenceId: companyId,
  });
  const previous = company.squareBillingCardId;
  await prisma.company.update({
    where: { id: companyId },
    data: {
      squareBillingCardId: card.id,
      squareBillingCardBrand: card.card_brand ?? null,
      squareBillingCardLast4: card.last_4 ?? null,
    },
  });
  if (previous && previous !== card.id) {
    const rows = await prisma.planSubscription.findMany({
      where: { companyId, status: { in: ["ACTIVE", "PENDING", "PAUSED"] } },
      select: { squareSubscriptionId: true },
    });
    for (const r of rows) {
      try {
        await api.updateSquareSubscriptionCard(token, r.squareSubscriptionId, card.id);
      } catch (err) {
        reportError("[plan-billing] move subscription to new card failed", err);
      }
    }
    disableSquareCard(token, previous).catch(() => {});
  }
  return { cardId: card.id, brand: card.card_brand ?? null, last4: card.last_4 ?? null };
}

// ── Square → rows → company ──

/**
 * Record what Square says about one subscription. A row we have never seen
 * (made in the Square dashboard by hand, or a webhook that beat our insert)
 * is adopted when its customer is one of our companies and its variation is
 * one of our plans; anything else is logged and ignored.
 */
export async function applySquareSubscription(
  sub: api.SquareSubscription,
  hint?: { companyId?: string; product?: BillingProduct; cadence?: BillingCadence },
  now: Date = new Date()
): Promise<{ companyId: string; row: PlanSubscription } | null> {
  const existing = await prisma.planSubscription.findUnique({ where: { squareSubscriptionId: sub.id } });
  const sold = productForVariation(sub.plan_variation_id);
  const product = sold?.product ?? hint?.product ?? (existing?.product as BillingProduct | undefined);
  const cadence = sold?.cadence ?? hint?.cadence ?? (existing?.cadence as BillingCadence | undefined);
  let companyId = existing?.companyId ?? hint?.companyId ?? null;
  if (!companyId && sub.customer_id) {
    const company = await prisma.company.findFirst({
      where: { squareBillingCustomerId: sub.customer_id },
      select: { id: true },
    });
    companyId = company?.id ?? null;
  }
  if (!companyId || !product || !cadence) {
    console.warn(`[plan-billing] subscription ${sub.id} ignored (company ${companyId ?? "?"}, variation ${sub.plan_variation_id ?? "?"})`);
    return null;
  }
  const state = reduceSubscription(sub, now);
  const data = {
    companyId,
    product,
    cadence,
    planVariationId: sub.plan_variation_id ?? existing?.planVariationId ?? "",
    status: state.status,
    entitled: state.entitled,
    startedAt: state.startedAt,
    chargedThrough: state.chargedThrough,
    canceledAt: state.canceledAt,
  };
  const row = existing
    ? await prisma.planSubscription.update({ where: { id: existing.id }, data })
    : await prisma.planSubscription.create({ data: { ...data, squareSubscriptionId: sub.id } });
  return { companyId, row };
}

/**
 * Company.paidPlans / paidSeats = what the rows add up to, plus the two
 * entitlement stamps other modules key off: Voice paid → addonActiveAt (the
 * business line, lib/addon.ts hasAddon), Pro paid → atlasPlanActiveAt
 * (Atlas Full). Each is cleared again only when WE set it — a Livery
 * subscription (addonLiverySubId) or a superadmin grant behind the same
 * stamp is left alone.
 */
export async function syncCompanyEntitlements(companyId: string, now: Date = new Date()): Promise<void> {
  const [rows, company] = await Promise.all([
    prisma.planSubscription.findMany({ where: { companyId }, select: { product: true, entitled: true } }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { paidPlans: true, paidSeats: true, planGrants: true, addonActiveAt: true, addonLiverySubId: true, atlasPlanActiveAt: true, name: true },
    }),
  ]);
  if (!company) return;
  const sums = sumEntitlements(rows);
  const had = (p: PlanId) => company.paidPlans.includes(p);
  const has = (p: PlanId) => sums.paidPlans.includes(p);
  const data: Record<string, unknown> = { paidPlans: sums.paidPlans, paidSeats: sums.paidSeats };
  if (has("DISPATCH") && !company.addonActiveAt) data.addonActiveAt = now;
  if (!has("DISPATCH") && had("DISPATCH") && company.addonActiveAt && !company.addonLiverySubId && !company.planGrants.includes("DISPATCH")) {
    data.addonActiveAt = null; // the line-release sweep (lib/business-line.ts) takes it from here
  }
  if (has("SHOP") && !company.atlasPlanActiveAt) data.atlasPlanActiveAt = now;
  if (!has("SHOP") && had("SHOP") && company.atlasPlanActiveAt && !company.planGrants.includes("SHOP")) data.atlasPlanActiveAt = null;
  const changed =
    company.paidPlans.join(",") !== sums.paidPlans.join(",") || company.paidSeats !== sums.paidSeats;
  await prisma.company.update({ where: { id: companyId }, data });
  if (changed) {
    console.warn(`[plan-billing] "${company.name}" (${companyId}) paid plans [${sums.paidPlans}] seats ${sums.paidSeats}`);
  }
}

/** Re-read one subscription from Square and bring the row + company up to date. */
export async function refreshSubscription(squareSubscriptionId: string, hint?: { companyId?: string }): Promise<void> {
  const { token } = requireConfigured();
  const sub = await api.retrieveSquareSubscription(token, squareSubscriptionId);
  const applied = await applySquareSubscription(sub, hint);
  if (applied) await syncCompanyEntitlements(applied.companyId);
}

/** A Square invoice event for a subscription: a payment landed, or a charge failed. */
export async function recordInvoiceEvent(invoice: api.SquareInvoice, eventType: string): Promise<void> {
  if (!invoice.subscription_id) return;
  const row = await prisma.planSubscription.findUnique({ where: { squareSubscriptionId: invoice.subscription_id } });
  const paid = invoice.status === "PAID" || eventType === "invoice.payment_made";
  const failed = invoice.status === "FAILED" || eventType === "invoice.scheduled_charge_failed";
  if (row) {
    await prisma.planSubscription.update({
      where: { id: row.id },
      data: paid
        ? { lastPaymentAt: new Date(), lastFailureAt: null, lastFailureNote: null }
        : failed
          ? { lastFailureAt: new Date(), lastFailureNote: "Card payment didn't go through" }
          : {},
    });
    if (failed) {
      const owners = await prisma.user.findMany({
        where: { companyId: row.companyId, role: "OWNER", isActive: true },
        select: { id: true },
      });
      notifyUsers(
        owners.map((o) => o.id),
        {
          title: `${productName(row.product as BillingProduct)} plan — card didn't go through`,
          body: "Square will retry. Update the card in Settings → Plans to keep everything on.",
          url: "/app/settings/plans",
          tag: `plan-billing-failed-${row.id}`,
        }
      ).catch(() => {});
    }
  }
  await refreshSubscription(invoice.subscription_id, row ? { companyId: row.companyId } : undefined);
}

// ── Actions (the Plans page) ──

function variationOrThrow(product: BillingProduct, cadence: BillingCadence): string {
  const id = variationIdFor(product, cadence);
  if (!id) {
    throw new PlanBillingError(
      `${productName(product)} isn't available for ${cadence === "ANNUAL" ? "annual" : "monthly"} billing yet. Message us from the Help Center.`,
      409,
      "NOT_AVAILABLE"
    );
  }
  return id;
}

async function cardForCharge(company: BillingCompany, sourceId: string | null | undefined): Promise<{ cardId: string; customerId: string }> {
  if (sourceId) {
    const card = await putCardOnFile(company.id, sourceId);
    const fresh = await requireCompany(company.id);
    return { cardId: card.cardId, customerId: fresh.squareBillingCustomerId! };
  }
  if (!company.squareBillingCardId || !company.squareBillingCustomerId) {
    throw new PlanBillingError("Add a card first.", 400, "CARD_REQUIRED");
  }
  return { cardId: company.squareBillingCardId, customerId: company.squareBillingCustomerId };
}

/** The one-time Voice setup fee, charged with the first Voice / Max subscription of a company that has no line yet. */
function setupFeeDue(company: BillingCompany, product: BillingProduct): boolean {
  if (!productPlans(product).includes("DISPATCH")) return false;
  if (DISPATCH_SETUP_CENTS <= 0 || company.dispatchSetupPaidAt) return false;
  if (company.lineNumber || company.addonActiveAt || company.planGrants.includes("DISPATCH")) return false;
  return true;
}

/**
 * Put the company on a product: card on file (new token or the stored one),
 * the setup fee when due, then either a NEW Square subscription or a SWAP of
 * the one it replaces (Pro → Max, monthly → annual; Square prorates), and a
 * cancel for anything else Max now covers.
 */
export async function subscribe(params: {
  companyId: string;
  product: BillingProduct;
  cadence: BillingCadence;
  sourceId?: string | null;
}): Promise<void> {
  const { token, locationId } = requireConfigured();
  const { companyId, product, cadence } = params;
  if (product === "SEAT") return addSeat({ companyId, sourceId: params.sourceId });
  if (!productSellable(product)) throw new PlanBillingError(`${productName(product)} is coming soon.`, 409, "COMING_SOON");
  const variationId = variationOrThrow(product, cadence);
  const company = await requireCompany(companyId);
  const plans = productPlans(product);
  if (plans.every((p) => company.planGrants.includes(p))) {
    throw new PlanBillingError(`${productName(product)} is already on for your account at no charge.`, 409, "ALREADY_GRANTED");
  }
  const rows = await prisma.planSubscription.findMany({ where: { companyId } });
  const change = planChange(rows, { product, cadence });
  if (change.already) throw new PlanBillingError(`You're already on ${productName(product)}.`, 409, "ALREADY_ON");

  const { cardId, customerId } = await cardForCharge(company, params.sourceId);

  if (setupFeeDue(company, product)) {
    try {
      await createSquarePayment({
        token,
        idempotencyKey: `wb-voice-setup:${companyId}`,
        sourceId: cardId,
        customerId,
        amountCents: DISPATCH_SETUP_CENTS,
        locationId,
        referenceId: companyId,
        note: `WorkBench Voice setup — ${company.name}`.slice(0, 500),
      });
    } catch (err) {
      if (err instanceof SquareError && !isTransientSquareError(err)) {
        throw new PlanBillingError(declineMessage(err.code), 402, "CARD_DECLINED");
      }
      throw err;
    }
    await prisma.company.update({ where: { id: companyId }, data: { dispatchSetupPaidAt: new Date() } });
  }

  if (change.swap) {
    const swapRow = rows.find((r) => r.id === change.swap)!;
    const sub = await api.swapSquareSubscriptionPlan(token, swapRow.squareSubscriptionId, variationId);
    await applySquareSubscription(sub, { companyId, product, cadence });
  } else {
    const sub = await api.createSquareSubscription({
      token,
      idempotencyKey: `wb-sub:${companyId}:${product}:${cadence}:${Math.floor(Date.now() / 60_000)}`,
      locationId,
      planVariationId: variationId,
      customerId,
      cardId,
      timezone: company.timezone,
    });
    await applySquareSubscription(sub, { companyId, product, cadence });
  }
  for (const id of change.cancel) {
    const row = rows.find((r) => r.id === id);
    if (!row) continue;
    try {
      const sub = await api.cancelSquareSubscription(token, row.squareSubscriptionId);
      await applySquareSubscription(sub, { companyId });
    } catch (err) {
      reportError("[plan-billing] cancel of a plan Max now covers failed", err);
    }
  }
  await syncCompanyEntitlements(companyId);
}

async function ownRow(companyId: string, rowId: string): Promise<PlanSubscription> {
  const row = await prisma.planSubscription.findFirst({ where: { id: rowId, companyId } });
  if (!row) throw new PlanBillingError("That subscription isn't on your account.", 404);
  return row;
}

/** Cancel at the end of the current billing period (Square's default). */
export async function cancelPlan(params: { companyId: string; rowId: string }): Promise<void> {
  const { token } = requireConfigured();
  const row = await ownRow(params.companyId, params.rowId);
  const sub = await api.cancelSquareSubscription(token, row.squareSubscriptionId);
  await applySquareSubscription(sub, { companyId: params.companyId });
  await syncCompanyEntitlements(params.companyId);
}

/** Call off a scheduled cancel. */
export async function resumePlan(params: { companyId: string; rowId: string }): Promise<void> {
  const { token } = requireConfigured();
  const row = await ownRow(params.companyId, params.rowId);
  const sub = await api.resumeSquareSubscription(token, row.squareSubscriptionId);
  await applySquareSubscription(sub, { companyId: params.companyId });
  await syncCompanyEntitlements(params.companyId);
}

/** One more paid person: a new SEAT subscription on the card on file. */
export async function addSeat(params: { companyId: string; sourceId?: string | null }): Promise<void> {
  const { token, locationId } = requireConfigured();
  const variationId = variationOrThrow("SEAT", "MONTHLY");
  const company = await requireCompany(params.companyId);
  if (hasPlan(company, "SHOP")) throw new PlanBillingError("Pro already includes unlimited people.", 409, "ALREADY_ON");
  const { cardId, customerId } = await cardForCharge(company, params.sourceId);
  const seats = await prisma.planSubscription.count({ where: { companyId: company.id, product: "SEAT", entitled: true } });
  const sub = await api.createSquareSubscription({
    token,
    idempotencyKey: `wb-seat:${company.id}:${seats + 1}:${Math.floor(Date.now() / 60_000)}`,
    locationId,
    planVariationId: variationId,
    customerId,
    cardId,
    timezone: company.timezone,
  });
  await applySquareSubscription(sub, { companyId: company.id, product: "SEAT", cadence: "MONTHLY" });
  await syncCompanyEntitlements(company.id);
}

/** One fewer paid person at the end of its period: the newest seat not already ending. */
export async function removeSeat(params: { companyId: string }): Promise<void> {
  const { token } = requireConfigured();
  const row = await prisma.planSubscription.findFirst({
    where: { companyId: params.companyId, product: "SEAT", entitled: true, canceledAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new PlanBillingError("No paid seats to remove.", 404);
  const sub = await api.cancelSquareSubscription(token, row.squareSubscriptionId);
  await applySquareSubscription(sub, { companyId: params.companyId });
  await syncCompanyEntitlements(params.companyId);
}

// ── The Plans page's read model ──

export type PlanCardState = {
  product: Exclude<BillingProduct, "SEAT">;
  name: string;
  tagline: string;
  includes: string[];
  monthlyCents: number;
  annualCents: number;
  sellable: boolean;
  /** A plan variation id exists in env for the cadence (so Add can work). */
  available: Record<BillingCadence, boolean>;
  /** The company is on every plan this product covers. */
  on: boolean;
  /** How (for a single-plan product); Max reports "paid" only when its own row exists. */
  source: PlanSource;
  subscription: SubscriptionSummary | null;
};

export type SubscriptionSummary = {
  id: string;
  product: BillingProduct;
  cadence: BillingCadence;
  status: string;
  entitled: boolean;
  chargedThrough: string | null;
  canceledAt: string | null;
  lastFailureAt: string | null;
  lastPaymentAt: string | null;
};

export type PlanBillingState = {
  configured: boolean;
  pay: SquareClientConfig | null;
  plans: PlanCardState[];
  seats: { included: number; paid: number; limit: number | null; activePeople: number; unlimited: boolean; available: boolean; priceCents: number };
  card: { brand: string | null; last4: string | null } | null;
  setupFee: { cents: number; due: boolean };
  /** Voice is billed through the previous system (Livery). */
  livery: boolean;
  subscriptions: SubscriptionSummary[];
  /** A charge failed recently and the card should be replaced. */
  attention: string | null;
  gatingLive: boolean;
  isTest: boolean;
};

function summarize(r: PlanSubscription): SubscriptionSummary {
  return {
    id: r.id,
    product: r.product as BillingProduct,
    cadence: r.cadence as BillingCadence,
    status: r.status,
    entitled: r.entitled,
    chargedThrough: r.chargedThrough?.toISOString() ?? null,
    canceledAt: r.canceledAt?.toISOString() ?? null,
    lastFailureAt: r.lastFailureAt?.toISOString() ?? null,
    lastPaymentAt: r.lastPaymentAt?.toISOString() ?? null,
  };
}

export async function planBillingState(companyId: string, gatingLive: boolean): Promise<PlanBillingState> {
  const [company, rows, activePeople] = await Promise.all([
    requireCompany(companyId),
    prisma.planSubscription.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    prisma.user.count({ where: { companyId, isActive: true, role: { not: "SUPERADMIN" } } }),
  ]);
  const live = rows.filter((r) => r.entitled);
  const rowFor = (product: BillingProduct) => live.find((r) => r.product === product) ?? rows.filter((r) => r.product === product).at(-1) ?? null;
  const products: Exclude<BillingProduct, "SEAT">[] = ["DISPATCH", "SHOP", "FULL_SHOP", "JOBSITE"];
  const plans: PlanCardState[] = products.map((product) => {
    const covered = productPlans(product);
    const on = covered.every((p) => hasPlan(company, p));
    const own = rowFor(product);
    const source: PlanSource =
      product === "FULL_SHOP"
        ? own?.entitled
          ? "paid"
          : on
            ? covered.every((p) => company.planGrants.includes(p))
              ? "grant"
              : "paid"
            : null
        : planSource(company, product);
    const base = product === "FULL_SHOP" ? FULL_SHOP : PLANS[product];
    return {
      product,
      name: base.name,
      tagline: base.tagline,
      includes: product === "FULL_SHOP" ? [`Everything in ${PLANS.DISPATCH.name} and ${PLANS.SHOP.name}`, `${PLANS.JOBSITE.name} joins at no extra charge when it ships`] : PLANS[product].includes,
      monthlyCents: productPriceCents(product, "MONTHLY"),
      annualCents: annualCents(productPriceCents(product, "MONTHLY")),
      sellable: productSellable(product),
      available: {
        MONTHLY: Boolean(variationIdFor(product, "MONTHLY")),
        ANNUAL: Boolean(variationIdFor(product, "ANNUAL")),
      },
      on,
      source,
      subscription: own ? summarize(own) : null,
    };
  });
  const recentFailure = rows
    .map((r) => r.lastFailureAt)
    .filter((d): d is Date => Boolean(d) && Date.now() - d!.getTime() < 14 * 86_400_000)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    configured: planBillingConfigured(),
    pay: planBillingPayConfig(),
    plans,
    seats: {
      included: INCLUDED_SEATS,
      paid: company.paidSeats,
      limit: seatLimit(company, gatingLive),
      activePeople,
      unlimited: hasPlan(company, "SHOP"),
      available: Boolean(variationIdFor("SEAT", "MONTHLY")),
      priceCents: productPriceCents("SEAT", "MONTHLY"),
    },
    card: company.squareBillingCardId ? { brand: company.squareBillingCardBrand, last4: company.squareBillingCardLast4 } : null,
    setupFee: { cents: DISPATCH_SETUP_CENTS, due: setupFeeDue(company, "DISPATCH") },
    livery: Boolean(company.addonLiverySubId && company.addonActiveAt),
    subscriptions: rows.map(summarize),
    attention: recentFailure
      ? `Your card didn't go through on ${recentFailure.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Square will retry — replace the card to be safe.`
      : null,
    gatingLive,
    isTest: company.isTest,
  };
}

// ── Hourly sweep ──

/**
 * Webhooks are a fast path, not a required one: every row Square hasn't
 * told us about for 36 h, and every ACTIVE row whose paid-through date has
 * passed, is re-read. Transient Square trouble is skipped quietly.
 */
export async function runPlanBillingSweep(now: Date = new Date()): Promise<{ checked: number }> {
  if (!planBillingConfigured()) return { checked: 0 };
  const today = parseSquareDate(now.toISOString().slice(0, 10))!;
  const rows = await prisma.planSubscription.findMany({
    where: {
      OR: [
        { updatedAt: { lt: new Date(now.getTime() - 36 * 3600_000) }, status: { in: ["ACTIVE", "PENDING", "PAUSED"] } },
        { status: "ACTIVE", chargedThrough: { lt: today } },
        { entitled: true, status: { in: ["CANCELED", "DEACTIVATED"] } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: { squareSubscriptionId: true, companyId: true },
  });
  let checked = 0;
  for (const r of rows) {
    try {
      await refreshSubscription(r.squareSubscriptionId, { companyId: r.companyId });
      checked += 1;
    } catch (err) {
      if (err instanceof SquareError && isTransientSquareError(err)) continue;
      reportError("[plan-billing] sweep refresh failed", err);
    }
  }
  return { checked };
}
