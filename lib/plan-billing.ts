import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { SquareError, declineMessage, isTransientSquareError } from "@/lib/square";
import { squareVaultCard } from "@/lib/square-cards";
import { getProcessor, savedCardLabel } from "@/lib/payments";
import { CHARGE_GATE_SELECT, canChargeOnline } from "@/lib/payments-gate";
import { PAY_CONFIG_SELECT, clientPayConfig } from "@/lib/pay-client-config";
import { addSavedCard, defaultSavedCard, setDefaultSavedCard } from "@/lib/saved-cards";
import { attemptAutoCharge, reviveAutopayForContact } from "@/lib/auto-charge";
import { billSubscriptionNow } from "@/lib/subscriptions";
import { nextInvoiceNumber } from "@/lib/doc-numbers";
import { dueDateFromTerms } from "@/lib/due-dates";
import { recordLeadWin } from "@/lib/pipeline";
import {
  PAYMENT_GRACE_DAYS,
  planChange,
  reduceSeries,
  sumEntitlements,
  type PlanRow,
  type PlanSeriesLike,
  type SeriesInterval,
  type SeriesStatus,
} from "@/lib/plan-entitlement";
import {
  BILLING_PRODUCTS,
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
  type PlanSource,
} from "@/lib/plans";
import type { SquareClientConfig } from "@/lib/pay-config";
import type { Prisma } from "@prisma/client";

/**
 * Plan billing — WorkBench's paid plans, sold the way every WorkBench
 * business sells: through WorkBench itself (2026-10-29, David: "use my own
 * systems, like a WorkBench user would; my users ideally never see Square").
 *
 * The WorkBench company inside the app (`Company.isPlatform`, console
 * "Make WorkBench's account") is the biller. Each customer company is a
 * CLIENT of that company (`Company.billingContactId` → a Contact there,
 * found by the owner's email / phone at sign-up or made then), each plan is
 * a price-book item of that company (`WorkItem.planProduct`), and buying a
 * plan is a recurring SERIES on the contact (Subscription, interval MONTHLY
 * or ANNUAL, autopay pinned to the saved card) — the same rows, invoices,
 * autopay retries, dunning emails and client hub the rest of the product
 * runs on. Square only sits under the card charge, through the WorkBench
 * company's own connected account, exactly as it does for any business.
 *
 * Entitlement is READ, never typed: lib/plan-entitlement.ts reduceSeries
 * turns a series + its invoices into a row (on while the last paid period
 * runs, plus a grace while ACTIVE), `syncPlanEntitlements` sums the rows
 * into Company.paidPlans / paidSeats and stamps addonActiveAt (Voice) and
 * atlasPlanActiveAt (Pro) the way a grant does. It runs after every
 * payment on one of these invoices (lib/payments.ts recordPayment), after
 * autopay gives up (lib/auto-charge.ts), after the WorkBench account edits
 * a series (the subscriptions routes), on the Plans page, and hourly.
 *
 * David runs the business side from the WorkBench account like any owner:
 * Clients → the customer → Recurring (price, pause, cancel), Invoices, the
 * card on file. A discounted or trial plan is a series with a different
 * price. A plan started from there with no card sends the customer a
 * WorkBench invoice they pay from their client hub; it is on once paid.
 */

// ── The biller ──

const PLATFORM_SELECT = {
  id: true,
  name: true,
  suspendedAt: true,
  // The WorkBench company's own Service fee switch: plan charges to the
  // card on file carry it (lib/auto-charge.ts), so the Plans page says so.
  surchargeEnabled: true,
  surchargeRate: true,
  ...CHARGE_GATE_SELECT,
  ...PAY_CONFIG_SELECT,
} as const;

type PlatformCompany = NonNullable<Awaited<ReturnType<typeof loadPlatform>>>;

const PLATFORM_CACHE_MS = 60_000;
let platformCache: { at: number; company: PlatformCompany | null } | null = null;

async function loadPlatform() {
  return prisma.company.findFirst({ where: { isPlatform: true }, select: PLATFORM_SELECT });
}

/** The WorkBench company (Company.isPlatform), cached a minute per instance. */
export async function platformCompany(force = false): Promise<PlatformCompany | null> {
  if (!force && platformCache && Date.now() - platformCache.at < PLATFORM_CACHE_MS) return platformCache.company;
  const company = await loadPlatform();
  platformCache = { at: Date.now(), company };
  return company;
}

export function resetPlatformCompanyCache(): void {
  platformCache = null;
}

/** Can WorkBench take a card? The platform company exists and its Square is connected. */
export async function planBillingConfigured(): Promise<boolean> {
  const platform = await platformCompany();
  return Boolean(platform && !platform.suspendedAt && canChargeOnline(platform) && getProcessor().live);
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

/** The HTTP status + message for a failure during a billing action. */
export function billingErrorResponse(err: unknown): { status: number; error: string; code?: string } {
  if (err instanceof PlanBillingError) return { status: err.status, error: err.message, ...(err.code ? { code: err.code } : {}) };
  if (err instanceof SquareError) {
    if (isTransientSquareError(err)) return { status: 424, error: "The card network didn't answer. Nothing was charged — try again in a moment." };
    return { status: 402, error: declineMessage(err.code), code: "CARD_DECLINED" };
  }
  return { status: 500, error: "Something went wrong." };
}

async function requirePlatform(): Promise<PlatformCompany> {
  const platform = await platformCompany();
  if (!platform || !canChargeOnline(platform) || !getProcessor().live) {
    throw new PlanBillingError("Online checkout isn't switched on yet. Message us from the Help Center and we'll set your plan up.", 503, "NOT_CONFIGURED");
  }
  return platform;
}

// ── The customer as a client of the WorkBench company ──

const COMPANY_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  timezone: true,
  ...PLAN_HOLDER_SELECT,
  addonLiverySubId: true,
  atlasPlanActiveAt: true,
  lineNumber: true,
  dispatchSetupPaidAt: true,
  billingContactId: true,
  isPlatform: true,
} as const;

type BillingCompany = NonNullable<Awaited<ReturnType<typeof loadCompany>>>;

async function loadCompany(companyId: string) {
  return prisma.company.findUnique({ where: { id: companyId }, select: COMPANY_SELECT });
}

async function requireCompany(companyId: string): Promise<BillingCompany> {
  const c = await loadCompany(companyId);
  if (!c) throw new PlanBillingError("Company not found.", 404);
  return c;
}

const digitsOf = (phone: string | null | undefined) => {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

/**
 * The contact in the WorkBench company that IS this customer. Looks for one
 * first — the owner's sign-in email, the company's email, then the phone
 * digits — so a lead David already had (from /apply, the leads board, a
 * call) becomes the client instead of a duplicate; a lead found this way is
 * won (the board moves it to Converted). Nothing found = a new client. Null
 * when there is no WorkBench company yet, or for the WorkBench company itself.
 */
export async function ensureBillingContact(companyId: string): Promise<string | null> {
  const platform = await platformCompany();
  if (!platform || platform.id === companyId) return null;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, email: true, phone: true, billingContactId: true, billingContact: { select: { id: true, companyId: true } } },
  });
  if (!company) return null;
  if (company.billingContact && company.billingContact.companyId === platform.id) return company.billingContact.id;

  const owner = await prisma.user.findFirst({
    where: { companyId, role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { email: true, name: true, phone: true },
  });
  const emails = Array.from(new Set([owner?.email, company.email].map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean)));
  const digits = Array.from(new Set([digitsOf(owner?.phone), digitsOf(company.phone)].filter(Boolean)));

  const byEmail = emails.length
    ? await prisma.contact.findMany({
        where: { companyId: platform.id, placeholder: false, OR: emails.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })) },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        select: { id: true, status: true, pipelineStageId: true, companyName: true, email: true, phone: true, kind: true },
      })
    : [];
  const byPhone =
    !byEmail.length && digits.length
      ? await prisma.contact.findMany({
          where: { companyId: platform.id, placeholder: false, phoneDigits: { in: digits } },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
          select: { id: true, status: true, pipelineStageId: true, companyName: true, email: true, phone: true, kind: true },
        })
      : [];
  const pick = (list: typeof byEmail) => list.find((c) => c.status !== "ARCHIVED") ?? list[0] ?? null;
  const found = pick(byEmail) ?? pick(byPhone);

  const [first, ...rest] = (owner?.name ?? company.name).trim().split(/\s+/);
  let contactId: string;
  if (found) {
    contactId = found.id;
    if (found.status === "LEAD") {
      await recordLeadWin(prisma, platform.id, found).catch((e) => reportError("[plan-billing] lead win failed", e));
    }
    await prisma.contact.update({
      where: { id: found.id },
      data: {
        kind: "CLIENT",
        status: "ACTIVE",
        ...(found.companyName ? {} : { companyName: company.name }),
        ...(found.email || !emails[0] ? {} : { email: emails[0] }),
        ...(found.phone || !owner?.phone ? {} : { phone: owner.phone, phoneDigits: digitsOf(owner.phone) || null }),
      },
    });
  } else {
    const made = await prisma.contact.create({
      data: {
        companyId: platform.id,
        firstName: first || company.name,
        lastName: rest.join(" "),
        companyName: company.name,
        email: emails[0] || null,
        phone: owner?.phone ?? company.phone ?? null,
        phoneDigits: digits[0] || null,
        status: "ACTIVE",
        kind: "CLIENT",
        leadSource: "WorkBench sign-up",
      },
      select: { id: true },
    });
    contactId = made.id;
  }
  await prisma.company.update({ where: { id: companyId }, data: { billingContactId: contactId } });
  return contactId;
}

// ── The plans as price-book items of the WorkBench company ──

export function planItemName(product: BillingProduct): string {
  return product === "SEAT" ? "Extra person" : `${productName(product)} plan`;
}

const ITEM_CACHE_MS = 60_000;
let itemCache: { at: number; platformId: string; items: Record<string, { id: string; name: string }> } | null = null;

/** One recurring service per product in the WorkBench price book (made on first use; David can rename or reprice them there). */
export async function ensurePlanItems(platformId: string): Promise<Record<string, { id: string; name: string }>> {
  if (itemCache && itemCache.platformId === platformId && Date.now() - itemCache.at < ITEM_CACHE_MS) return itemCache.items;
  const existing = await prisma.workItem.findMany({
    where: { companyId: platformId, planProduct: { not: null } },
    select: { id: true, name: true, planProduct: true },
  });
  const items: Record<string, { id: string; name: string }> = {};
  for (const w of existing) if (w.planProduct) items[w.planProduct] = { id: w.id, name: w.name };
  for (const product of BILLING_PRODUCTS) {
    if (items[product] || !productSellable(product)) continue;
    const made = await prisma.workItem.create({
      data: {
        companyId: platformId,
        name: planItemName(product),
        description: product === "SEAT" ? "One more person on the team" : (product === "FULL_SHOP" ? FULL_SHOP.tagline : PLANS[product].tagline),
        unitPrice: productPriceCents(product, "MONTHLY") / 100,
        recurringInterval: "MONTHLY",
        recurringInvoiceMode: "SEND",
        planProduct: product,
      },
      select: { id: true, name: true },
    });
    items[product] = made;
  }
  itemCache = { at: Date.now(), platformId, items };
  return items;
}

// ── Reading a company's plan series ──

const SERIES_SELECT = {
  id: true,
  status: true,
  interval: true,
  quantity: true,
  unitPrice: true,
  nextRunDate: true,
  createdAt: true,
  savedCardId: true,
  workItem: { select: { planProduct: true } },
  invoices: {
    where: { status: { in: ["AWAITING_PAYMENT", "PAID", "PAST_DUE"] } },
    orderBy: { issuedAt: "desc" },
    take: 8,
    select: { id: true, status: true, issuedAt: true, total: true, autoChargeLastError: true, autoChargeGaveUpAt: true, publicToken: true },
  },
} satisfies Prisma.SubscriptionSelect;

type SeriesRecord = Awaited<ReturnType<typeof loadSeries>>[number];

async function loadSeries(platformId: string, contactId: string) {
  return prisma.subscription.findMany({
    where: { companyId: platformId, contactId, workItem: { planProduct: { not: null } } },
    orderBy: { createdAt: "asc" },
    select: SERIES_SELECT,
  });
}

function toSeriesLike(s: SeriesRecord): PlanSeriesLike {
  return {
    id: s.id,
    status: s.status as SeriesStatus,
    interval: (s.interval as SeriesInterval | null) ?? null,
    quantity: Number(s.quantity),
    unitPrice: Number(s.unitPrice),
    product: s.workItem?.planProduct ?? null,
    createdAt: s.createdAt,
    invoices: s.invoices.map((i) => ({
      status: i.status,
      issuedAt: i.issuedAt,
      total: Number(i.total),
      autoChargeLastError: i.autoChargeLastError,
      autoChargeGaveUpAt: i.autoChargeGaveUpAt,
    })),
  };
}

/** Every plan row of a company, derived from its series in the WorkBench company (empty when it has none). */
export async function planRows(companyId: string, now: Date = new Date()): Promise<PlanRow[]> {
  const platform = await platformCompany();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { billingContactId: true } });
  if (!platform || !company?.billingContactId) return [];
  const series = await loadSeries(platform.id, company.billingContactId);
  return series.map((s) => reduceSeries(toSeriesLike(s), now)).filter((r): r is PlanRow => r !== null);
}

// ── Entitlement ──

/**
 * Company.paidPlans / paidSeats = what the rows add up to, plus the two
 * entitlement stamps other modules key off: Voice paid → addonActiveAt (the
 * business line, lib/addon.ts hasAddon), Pro paid → atlasPlanActiveAt
 * (Atlas Full). Each is cleared again only when WE set it — a Livery
 * subscription (addonLiverySubId) or a superadmin grant behind the same
 * stamp is left alone.
 */
export async function syncPlanEntitlements(companyId: string, now: Date = new Date()): Promise<void> {
  const [rows, company] = await Promise.all([
    planRows(companyId, now),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { paidPlans: true, paidSeats: true, planGrants: true, addonActiveAt: true, addonLiverySubId: true, atlasPlanActiveAt: true, atlasPlanLiverySubId: true },
    }),
  ]);
  if (!company) return;
  const { paidPlans, paidSeats } = sumEntitlements(rows);
  const had = new Set(company.paidPlans);
  const data: Record<string, unknown> = {};
  if (paidPlans.join(",") !== company.paidPlans.join(",")) data.paidPlans = paidPlans;
  if (paidSeats !== company.paidSeats) data.paidSeats = paidSeats;

  const voice = paidPlans.includes("DISPATCH");
  if (voice && !company.addonActiveAt) data.addonActiveAt = now;
  if (!voice && had.has("DISPATCH") && company.addonActiveAt && !company.addonLiverySubId && !company.planGrants.includes("DISPATCH")) {
    data.addonActiveAt = null;
  }
  const pro = paidPlans.includes("SHOP");
  if (pro && !company.atlasPlanActiveAt) {
    data.atlasPlanActiveAt = now;
    data.atlasPeriodStart = now;
    data.atlasPeriodTokensUsed = 0;
  }
  if (!pro && had.has("SHOP") && company.atlasPlanActiveAt && !company.atlasPlanLiverySubId && !company.planGrants.includes("SHOP")) {
    data.atlasPlanActiveAt = null;
    data.atlasPeriodStart = null;
    data.atlasPeriodTokensUsed = 0;
  }
  if (Object.keys(data).length) await prisma.company.update({ where: { id: companyId }, data });
}

/** A payment / autopay outcome on an invoice: if it's one of ours, the customer's entitlement follows. */
export async function syncEntitlementsForInvoice(invoiceId: string): Promise<void> {
  const platform = await platformCompany();
  if (!platform) return;
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { companyId: true, contactId: true, subscriptionId: true } });
  if (!invoice || invoice.companyId !== platform.id || !invoice.contactId) return;
  const customer = await prisma.company.findFirst({ where: { billingContactId: invoice.contactId }, select: { id: true } });
  if (customer) await syncPlanEntitlements(customer.id);
}

/** The WorkBench account edited a series (price, pause, cancel, a new one): the customer's entitlement follows. */
export async function syncEntitlementsForSubscription(subscriptionId: string): Promise<void> {
  const platform = await platformCompany();
  if (!platform) return;
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { companyId: true, contactId: true } });
  if (!sub || sub.companyId !== platform.id) return;
  const customer = await prisma.company.findFirst({ where: { billingContactId: sub.contactId }, select: { id: true } });
  if (customer) await syncPlanEntitlements(customer.id);
}

/** Hourly: every linked company re-derives (periods end, grace runs out, invoices get paid by other means). */
export async function runPlanEntitlementSweep(now: Date = new Date()): Promise<{ checked: number }> {
  const platform = await platformCompany();
  if (!platform) return { checked: 0 };
  const companies = await prisma.company.findMany({ where: { billingContactId: { not: null } }, select: { id: true }, take: 2000 });
  let checked = 0;
  for (const c of companies) {
    try {
      await syncPlanEntitlements(c.id, now);
      checked += 1;
    } catch (err) {
      reportError("[plan-billing] entitlement sweep failed", err);
    }
  }
  return { checked };
}

// ── Actions (the Plans page) ──

function noonToday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

async function requireContact(company: BillingCompany): Promise<string> {
  const contactId = await ensureBillingContact(company.id);
  if (!contactId) throw new PlanBillingError("Online checkout isn't switched on yet. Message us from the Help Center and we'll set your plan up.", 503, "NOT_CONFIGURED");
  return contactId;
}

/** Vault a fresh card token under the WorkBench company's Square and make it the customer's default. */
export async function putCardOnFile(companyId: string, sourceId: string): Promise<{ cardId: string; label: string }> {
  const platform = await requirePlatform();
  const company = await requireCompany(companyId);
  const contactId = await requireContact(company);
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    select: { id: true, firstName: true, lastName: true, email: true, squareCustomerId: true },
  });
  if (!platform.squareMerchantId) throw new PlanBillingError("Online checkout isn't switched on yet.", 503, "NOT_CONFIGURED");
  const vaulted = await squareVaultCard({ contact, merchantId: platform.squareMerchantId, paymentToken: sourceId });
  const label = savedCardLabel({ cardBrand: vaulted.brand, cardLast4: vaulted.last4, cardExpMonth: vaulted.expMonth, cardExpYear: vaulted.expYear });
  const added = await addSavedCard({
    companyId: platform.id,
    contactId,
    instrumentRef: vaulted.instrumentRef,
    label,
    brand: vaulted.brand,
    last4: vaulted.last4,
    expMonth: vaulted.expMonth,
    expYear: vaulted.expYear,
  });
  if (!added.ok) throw new PlanBillingError(added.error, 400);
  await setDefaultSavedCard(contactId, added.card.id);
  // Every plan series follows the new card from its next charge.
  await prisma.subscription.updateMany({
    where: { companyId: platform.id, contactId, workItem: { planProduct: { not: null } }, status: { not: "CANCELLED" } },
    data: { savedCardId: added.card.id },
  });
  await reviveAutopayForContact(contactId).catch((e) => reportError("[plan-billing] autopay revive failed", e));
  return { cardId: added.card.id, label: added.card.label };
}

async function cardForCharge(company: BillingCompany, contactId: string, sourceId: string | null | undefined): Promise<{ id: string }> {
  if (sourceId) {
    const { cardId } = await putCardOnFile(company.id, sourceId);
    return { id: cardId };
  }
  const card = await defaultSavedCard(contactId);
  if (!card) throw new PlanBillingError("Add a card first.", 400, "CARD_REQUIRED");
  return { id: card.id };
}

/** The one-time Voice setup fee, charged with the first Voice / Max series of a company that has no line yet. */
function setupFeeDue(company: BillingCompany, product: BillingProduct): boolean {
  if (!productPlans(product).includes("DISPATCH")) return false;
  if (DISPATCH_SETUP_CENTS <= 0 || company.dispatchSetupPaidAt) return false;
  if (company.lineNumber || company.addonActiveAt || company.planGrants.includes("DISPATCH")) return false;
  return true;
}

/**
 * A one-off WorkBench invoice for the setup fee, paid from the card the
 * series is pinned to (attemptAutoCharge — the same path a plan's cycle
 * takes). Not a series invoice: it carries no subscriptionId, so the
 * entitlement reducer never sees it.
 */
async function chargeSetupFee(platform: PlatformCompany, company: BillingCompany, contactId: string, subscriptionId: string): Promise<void> {
  const now = new Date();
  const amount = DISPATCH_SETUP_CENTS / 100;
  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await nextInvoiceNumber(tx, platform.id);
    return tx.invoice.create({
      data: {
        companyId: platform.id,
        contactId,
        publicToken: randomBytes(24).toString("hex"),
        invoiceNumber,
        subject: `${PLANS.DISPATCH.name} setup`,
        status: "AWAITING_PAYMENT",
        subtotal: amount,
        total: amount,
        issuedAt: now,
        dueDate: dueDateFromTerms(now, 0),
        lineItems: { create: [{ name: `${PLANS.DISPATCH.name} setup — your business number`, description: "", quantity: 1, unitPrice: amount, total: amount, sortOrder: 0 }] },
      },
      select: { id: true },
    });
  });
  const outcome = await attemptAutoCharge({
    companyId: platform.id,
    invoiceId: invoice.id,
    subscriptionId,
    amount,
    chargeDescription: `${PLANS.DISPATCH.name} setup — ${company.name}`,
    paymentDetails: "Voice setup fee",
  });
  if (outcome !== "charged") {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "ARCHIVED" } }).catch(() => {});
    const why = await prisma.invoice.findUnique({ where: { id: invoice.id }, select: { autoChargeLastError: true } });
    throw new PlanBillingError(why?.autoChargeLastError || "The card didn't go through.", 402, "CARD_DECLINED");
  }
  await prisma.company.update({ where: { id: company.id }, data: { dispatchSetupPaidAt: new Date() } });
}

/**
 * Put the company on a product: card on file (new token or the saved one),
 * the setup fee when due, a new series on the contact billed right now
 * (first invoice + autopay — `billSubscriptionNow`), and the series Max
 * now covers (or the old term) ended. A declined first charge removes the
 * series again so the owner simply tries another card.
 */
export async function subscribe(params: { companyId: string; product: BillingProduct; cadence: BillingCadence; sourceId?: string | null }): Promise<void> {
  const platform = await requirePlatform();
  const { companyId, product, cadence } = params;
  if (product === "SEAT") return addSeat({ companyId, sourceId: params.sourceId });
  if (!productSellable(product)) throw new PlanBillingError(`${productName(product)} is coming soon.`, 409, "COMING_SOON");
  const company = await requireCompany(companyId);
  const plans = productPlans(product);
  if (plans.every((p) => company.planGrants.includes(p))) {
    throw new PlanBillingError(`${productName(product)} is already on for your account at no charge.`, 409, "ALREADY_GRANTED");
  }
  const contactId = await requireContact(company);
  const rows = await planRows(companyId);
  const change = planChange(rows, { product, cadence });
  if (change.already) throw new PlanBillingError(`You're already on ${productName(product)}.`, 409, "ALREADY_ON");

  const card = await cardForCharge(company, contactId, params.sourceId);
  const items = await ensurePlanItems(platform.id);
  const item = items[product];
  if (!item) throw new PlanBillingError(`${productName(product)} isn't available yet.`, 409, "NOT_AVAILABLE");

  const sub = await prisma.subscription.create({
    data: {
      companyId: platform.id,
      contactId,
      workItemId: item.id,
      name: item.name,
      description: cadence === "ANNUAL" ? "Billed yearly" : "Billed monthly",
      unitPrice: productPriceCents(product, cadence) / 100,
      quantity: 1,
      interval: cadence === "ANNUAL" ? "ANNUAL" : "MONTHLY",
      nextRunDate: noonToday(),
      invoiceMode: "SEND",
      savedCardId: card.id,
    },
    select: { id: true },
  });

  try {
    if (setupFeeDue(company, product)) await chargeSetupFee(platform, company, contactId, sub.id);
    const outcome = await billSubscriptionNow(sub.id, platform.id);
    if (outcome !== "charged") {
      const open = await prisma.invoice.findFirst({
        where: { subscriptionId: sub.id, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
        select: { id: true, autoChargeLastError: true },
      });
      if (open) await prisma.invoice.update({ where: { id: open.id }, data: { status: "ARCHIVED" } }).catch(() => {});
      throw new PlanBillingError(open?.autoChargeLastError || "The card didn't go through.", 402, "CARD_DECLINED");
    }
  } catch (err) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED" } }).catch(() => {});
    throw err;
  }

  if (change.cancel.length) {
    await prisma.subscription.updateMany({ where: { id: { in: change.cancel }, companyId: platform.id, contactId }, data: { status: "CANCELLED" } });
  }
  await syncPlanEntitlements(companyId);
}

async function ownSeries(platformId: string, contactId: string, rowId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { id: rowId, companyId: platformId, contactId, workItem: { planProduct: { not: null } } },
    select: SERIES_SELECT,
  });
  if (!sub) throw new PlanBillingError("That plan isn't on your account.", 404);
  return sub;
}

/** Cancel: the series ends, and the plan stays on through what was paid for. */
export async function cancelPlan(params: { companyId: string; rowId: string }): Promise<void> {
  const platform = await requirePlatform();
  const company = await requireCompany(params.companyId);
  const contactId = await requireContact(company);
  const sub = await ownSeries(platform.id, contactId, params.rowId);
  if (sub.status !== "CANCELLED") await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED" } });
  await syncPlanEntitlements(params.companyId);
}

/** Call a cancel off: paid time left → the series resumes at its old date; none left → it bills again now. */
export async function resumePlan(params: { companyId: string; rowId: string }): Promise<void> {
  const platform = await requirePlatform();
  const company = await requireCompany(params.companyId);
  const contactId = await requireContact(company);
  const sub = await ownSeries(platform.id, contactId, params.rowId);
  const row = reduceSeries(toSeriesLike(sub));
  if (!row) throw new PlanBillingError("That plan isn't on your account.", 404);
  if (sub.status === "ACTIVE") return;
  const card = await defaultSavedCard(contactId);
  if (!card) throw new PlanBillingError("Add a card first.", 400, "CARD_REQUIRED");
  const paidLeft = row.paidThrough && row.paidThrough.getTime() > Date.now();
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "ACTIVE", savedCardId: card.id, nextRunDate: paidLeft ? row.paidThrough! : noonToday() },
  });
  if (!paidLeft) {
    const outcome = await billSubscriptionNow(sub.id, platform.id);
    if (outcome !== "charged") {
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED" } }).catch(() => {});
      throw new PlanBillingError("The card didn't go through.", 402, "CARD_DECLINED");
    }
  }
  await syncPlanEntitlements(params.companyId);
}

/** One more person: its own monthly series, billed now (no proration to reckon; removing one ends that series at its paid date). */
export async function addSeat(params: { companyId: string; sourceId?: string | null }): Promise<void> {
  const platform = await requirePlatform();
  const company = await requireCompany(params.companyId);
  if (hasPlan(company, "SHOP")) throw new PlanBillingError("Pro already includes unlimited people.", 409, "ALREADY_ON");
  const contactId = await requireContact(company);
  const card = await cardForCharge(company, contactId, params.sourceId);
  const items = await ensurePlanItems(platform.id);
  const item = items.SEAT;
  if (!item) throw new PlanBillingError("Extra people aren't available yet.", 409, "NOT_AVAILABLE");
  const sub = await prisma.subscription.create({
    data: {
      companyId: platform.id,
      contactId,
      workItemId: item.id,
      name: item.name,
      description: "Billed monthly",
      unitPrice: productPriceCents("SEAT", "MONTHLY") / 100,
      quantity: 1,
      interval: "MONTHLY",
      nextRunDate: noonToday(),
      invoiceMode: "SEND",
      savedCardId: card.id,
    },
    select: { id: true },
  });
  const outcome = await billSubscriptionNow(sub.id, platform.id);
  if (outcome !== "charged") {
    const open = await prisma.invoice.findFirst({ where: { subscriptionId: sub.id, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } }, select: { id: true, autoChargeLastError: true } });
    if (open) await prisma.invoice.update({ where: { id: open.id }, data: { status: "ARCHIVED" } }).catch(() => {});
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED" } }).catch(() => {});
    throw new PlanBillingError(open?.autoChargeLastError || "The card didn't go through.", 402, "CARD_DECLINED");
  }
  await syncPlanEntitlements(params.companyId);
}

/** One fewer person: the newest seat series ends (the seat stays through what was paid). */
export async function removeSeat(params: { companyId: string }): Promise<void> {
  const platform = await requirePlatform();
  const company = await requireCompany(params.companyId);
  const contactId = await requireContact(company);
  const seat = await prisma.subscription.findFirst({
    where: { companyId: platform.id, contactId, status: "ACTIVE", workItem: { planProduct: "SEAT" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!seat) throw new PlanBillingError("No paid seats to remove.", 404);
  await prisma.subscription.update({ where: { id: seat.id }, data: { status: "CANCELLED" } });
  await syncPlanEntitlements(params.companyId);
}

// ── The read model (Settings → Plans) ──

export type SubscriptionSummary = {
  id: string;
  product: BillingProduct;
  cadence: BillingCadence;
  status: string;
  entitled: boolean;
  chargedThrough: string | null;
  canceledAt: string | null;
  priceCents: number;
  failing: boolean;
};

export type PlanCardState = {
  product: Exclude<BillingProduct, "SEAT">;
  name: string;
  tagline: string;
  includes: string[];
  monthlyCents: number;
  annualCents: number;
  sellable: boolean;
  /** Checkout can sell this term (false only while billing isn't set up). */
  available: Record<BillingCadence, boolean>;
  /** The company is on every plan this product covers. */
  on: boolean;
  /** How (for a single-plan product); Max reports "paid" only when its own row exists. */
  source: PlanSource;
  subscription: SubscriptionSummary | null;
};

export type PlanBillingState = {
  configured: boolean;
  pay: SquareClientConfig | null;
  plans: PlanCardState[];
  seats: { included: number; paid: number; limit: number | null; activePeople: number; unlimited: boolean; available: boolean; priceCents: number };
  card: { brand: string | null; last4: string | null } | null;
  setupFee: { cents: number; due: boolean };
  livery: boolean;
  subscriptions: SubscriptionSummary[];
  attention: string | null;
  /** The company's billing page in WorkBench's client hub: invoices, receipts, the card. */
  hubUrl: string | null;
  /** Card surcharge on every plan charge (a rate, 0.035 = 3.5%), or null when WorkBench absorbs the fee. */
  cardFeeRate: number | null;
  gatingLive: boolean;
  isTest: boolean;
};

/** The card surcharge rate a biller adds to card-on-file charges, or null when off (same rule as lib/autopay-rules.ts). */
export function billerCardFeeRate(biller: { surchargeEnabled: boolean; surchargeRate: { toString(): string } | number | null } | null): number | null {
  if (!biller?.surchargeEnabled || biller.surchargeRate == null) return null;
  const rate = Number(biller.surchargeRate);
  return Number.isFinite(rate) && rate > 0 && rate <= 0.1 ? rate : null;
}

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function summarize(r: PlanRow): SubscriptionSummary {
  return {
    id: r.id,
    product: r.product,
    cadence: r.cadence,
    status: r.status,
    entitled: r.entitled,
    chargedThrough: dateOnly(r.paidThrough),
    canceledAt: r.status === "CANCELLED" ? dateOnly(r.paidThrough) : null,
    priceCents: r.priceCents,
    failing: r.failing,
  };
}

export async function planBillingState(companyId: string, gatingLive: boolean): Promise<PlanBillingState> {
  const [company, platform, activePeople] = await Promise.all([
    requireCompany(companyId),
    platformCompany(),
    prisma.user.count({ where: { companyId, isActive: true, role: { not: "SUPERADMIN" } } }),
  ]);
  const configured = await planBillingConfigured();
  const contactId = configured ? await ensureBillingContact(companyId).catch((e) => (reportError("[plan-billing] contact link failed", e), null)) : null;
  const [rows, card, contact] = await Promise.all([
    planRows(companyId),
    contactId ? defaultSavedCard(contactId) : null,
    contactId ? prisma.contact.findUnique({ where: { id: contactId }, select: { hubToken: true } }) : null,
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
      monthlyCents: own?.entitled && own.cadence === "MONTHLY" ? own.priceCents : productPriceCents(product, "MONTHLY"),
      annualCents: own?.entitled && own.cadence === "ANNUAL" ? own.priceCents : annualCents(productPriceCents(product, "MONTHLY")),
      sellable: productSellable(product),
      available: { MONTHLY: configured, ANNUAL: configured },
      on,
      source,
      subscription: own ? summarize(own) : null,
    };
  });
  const failing = rows.find((r) => r.failing && r.unpaidSince);
  const cfg = platform && configured ? clientPayConfig(platform) : null;
  const payConfig: SquareClientConfig | null = cfg && cfg.processor === "square" ? cfg : null;
  return {
    configured,
    pay: payConfig,
    plans,
    seats: {
      included: INCLUDED_SEATS,
      paid: company.paidSeats,
      limit: seatLimit(company, gatingLive),
      activePeople,
      unlimited: hasPlan(company, "SHOP"),
      available: configured,
      priceCents: productPriceCents("SEAT", "MONTHLY"),
    },
    card: card ? { brand: card.brand, last4: card.last4 } : null,
    setupFee: { cents: DISPATCH_SETUP_CENTS, due: setupFeeDue(company, "DISPATCH") },
    livery: Boolean(company.addonLiverySubId && company.addonActiveAt),
    subscriptions: rows.map(summarize),
    attention: failing
      ? `Your card didn't go through on ${failing.unpaidSince!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. We'll retry — replace the card to be safe, or pay the invoice from your billing page. Plans pause ${PAYMENT_GRACE_DAYS} days after a missed renewal.`
      : null,
    hubUrl: contact ? `/hub/${contact.hubToken}` : null,
    cardFeeRate: billerCardFeeRate(platform),
    gatingLive,
    isTest: company.isTest,
  };
}
