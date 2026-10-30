import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { logActivity } from "@/lib/activity";
import { getProcessor } from "@/lib/payments";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { toE164 } from "@/lib/sms";
import {
  accumulateLoyaltyPoints,
  adjustLoyaltyPoints,
  calculateLoyaltyPoints,
  createLoyaltyAccount,
  createLoyaltyReward,
  deleteLoyaltyReward,
  redeemLoyaltyReward,
  retrieveLoyaltyAccount,
  retrieveLoyaltyProgram,
  rewardDiscountFor,
  searchLoyaltyAccounts,
  type LoyaltyAccount,
  type LoyaltyProgram,
} from "@/lib/square-products";
import type { SellerReadFailure } from "@/lib/square-seller-reports";

/**
 * Square Loyalty inside WorkBench (2026-10-30, docs/plans/square-products-
 * 2026-10-30.md). The program itself is the seller's — made and priced in
 * the Square dashboard (a Square Loyalty subscription) — and WorkBench works
 * it: enroll a client by phone, earn points on every payment, spend a
 * reward on an invoice as a discount, adjust points by hand. The program's
 * id and status are cached on SquareConnection (`loyaltyProgramId`,
 * `loyaltyStatus`, `loyaltyCheckedAt`) so a payment never calls Square just
 * to learn there is no program; the Loyalty tab, Check connection and the
 * hourly sweep refresh it.
 */

export const LOYALTY_RECHECK_MS = 6 * 3_600_000;
export type LoyaltyStatus = "ACTIVE" | "INACTIVE" | "NONE" | "UNKNOWN";

export class LoyaltyError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

function fromFailure(f: SellerReadFailure): LoyaltyError {
  if (f.notConnected) return new LoyaltyError("Connect Square in Settings first.", 400, "NOT_CONNECTED");
  if (f.missingScopes) return new LoyaltyError("Reconnect Square in Settings → Payments & accounting to use loyalty.", 409, "MISSING_SCOPES");
  if (f.transient) return new LoyaltyError("Square didn't answer — try again in a moment.", 424, "SQUARE_DOWN");
  return new LoyaltyError(f.message, 424);
}

export type LoyaltyState = { status: LoyaltyStatus; program: LoyaltyProgram | null; checkedAt: Date | null; failure: SellerReadFailure | null };

/**
 * The seller's program. Reads Square when asked (`refresh`), when never
 * checked, or when the cache is older than LOYALTY_RECHECK_MS; otherwise
 * answers the cached status (program details come from Square either way
 * when the status is ACTIVE / INACTIVE and `withProgram` is set).
 */
export async function loyaltyProgramFor(companyId: string, opts: { refresh?: boolean; withProgram?: boolean } = {}): Promise<LoyaltyState> {
  const conn = await prisma.squareConnection.findUnique({ where: { companyId }, select: { loyaltyProgramId: true, loyaltyStatus: true, loyaltyCheckedAt: true } });
  if (!conn) return { status: "NONE", program: null, checkedAt: null, failure: { ok: false, transient: false, missingScopes: false, notConnected: true, message: "Connect Square first." } };
  const stale = !conn.loyaltyCheckedAt || Date.now() - conn.loyaltyCheckedAt.getTime() > LOYALTY_RECHECK_MS;
  const cached = (conn.loyaltyStatus as LoyaltyStatus | null) ?? null;
  if (!opts.refresh && !stale && cached && !(opts.withProgram && cached !== "NONE" && cached !== "UNKNOWN")) {
    return { status: cached, program: null, checkedAt: conn.loyaltyCheckedAt, failure: null };
  }
  const read = await retrieveLoyaltyProgram(companyId);
  if (!read.ok) {
    if (read.missingScopes) {
      await prisma.squareConnection.updateMany({ where: { companyId }, data: { loyaltyStatus: "UNKNOWN", loyaltyCheckedAt: new Date() } });
      return { status: "UNKNOWN", program: null, checkedAt: new Date(), failure: read };
    }
    return { status: cached ?? "UNKNOWN", program: null, checkedAt: conn.loyaltyCheckedAt, failure: read };
  }
  const program = read.data;
  const status: LoyaltyStatus = !program ? "NONE" : program.status === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  await prisma.squareConnection.updateMany({ where: { companyId }, data: { loyaltyProgramId: program?.id ?? null, loyaltyStatus: status, loyaltyCheckedAt: new Date() } });
  return { status, program, checkedAt: new Date(), failure: null };
}

/** Hourly: re-read programs whose cache is stale (connections that have the scope). */
export async function runLoyaltyProgramSweep(now = new Date()): Promise<number> {
  const due = await prisma.squareConnection.findMany({
    where: {
      scopes: { contains: "LOYALTY_READ" },
      OR: [{ loyaltyCheckedAt: null }, { loyaltyCheckedAt: { lt: new Date(now.getTime() - LOYALTY_RECHECK_MS) } }],
    },
    select: { companyId: true },
    take: 100,
  });
  let n = 0;
  for (const c of due) {
    const r = await loyaltyProgramFor(c.companyId, { refresh: true });
    if (!r.failure) n++;
  }
  return n;
}

async function activeProgram(companyId: string): Promise<LoyaltyProgram> {
  const state = await loyaltyProgramFor(companyId, { withProgram: true });
  if (state.failure && !state.program) throw fromFailure(state.failure);
  if (!state.program) throw new LoyaltyError("Set up a loyalty program in your Square dashboard first.", 409, "NO_PROGRAM");
  if (state.program.status !== "ACTIVE") throw new LoyaltyError("Your Square Loyalty program isn't active — check your Square Loyalty subscription.", 409, "PROGRAM_INACTIVE");
  return state.program;
}

async function locationFor(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { squareLocationId: true, squareMerchantId: true } });
  if (getProcessor().name !== "square" || !company?.squareMerchantId || !company.squareLocationId) throw new LoyaltyError("Connect Square in Settings first.", 400, "NOT_CONNECTED");
  return company.squareLocationId;
}

/**
 * Enroll a client: adopt the Square account already on their phone number
 * (they may have joined at the counter), else create one. The phone is the
 * key Square uses for every loyalty member.
 */
export async function enrollContactInLoyalty(params: { companyId: string; contactId: string; actorName?: string | null; actorId?: string | null }): Promise<LoyaltyAccount> {
  const program = await activeProgram(params.companyId);
  const contact = await prisma.contact.findFirst({
    where: { id: params.contactId, companyId: params.companyId },
    select: { id: true, phone: true, squareCustomerId: true, squareLoyaltyAccountId: true, firstName: true, lastName: true },
  });
  if (!contact) throw new LoyaltyError("Client not found.", 404);
  if (contact.squareLoyaltyAccountId) {
    const existing = await retrieveLoyaltyAccount(params.companyId, contact.squareLoyaltyAccountId);
    if (existing.ok && existing.data) return existing.data;
  }
  const phone = toE164(contact.phone);
  if (!phone) throw new LoyaltyError("Add a mobile number to the client first — Square keys rewards to the phone number.", 400, "NO_PHONE");
  const found = await searchLoyaltyAccounts(params.companyId, { phone, limit: 1 });
  if (!found.ok) throw fromFailure(found);
  let account = found.data.accounts[0] ?? null;
  if (!account) {
    const made = await createLoyaltyAccount(params.companyId, { programId: program.id, phone, customerId: contact.squareCustomerId, idempotencyKey: `loy:${contact.id}` });
    if (!made.ok) throw fromFailure(made);
    account = made.data;
  }
  await prisma.contact.update({ where: { id: contact.id }, data: { squareLoyaltyAccountId: account.id } });
  logActivity({
    companyId: params.companyId,
    userId: params.actorId ?? undefined,
    userName: params.actorName ?? "Client",
    entityType: "contact",
    entityId: contact.id,
    action: "loyalty_enrolled",
    detail: `Joined ${program.other} rewards (${account.balance} ${account.balance === 1 ? program.one : program.other})`,
  });
  return account;
}

export type ContactLoyalty = { program: LoyaltyProgram; account: LoyaltyAccount | null; canJoin: boolean };

/** What a contact page / the hub shows: the program and the client's standing in it (null = no usable program). */
export async function loyaltyForContact(companyId: string, contactId: string): Promise<ContactLoyalty | null> {
  const state = await loyaltyProgramFor(companyId, { withProgram: true });
  if (!state.program || state.program.status !== "ACTIVE") return null;
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { phone: true, squareLoyaltyAccountId: true } });
  if (!contact) return null;
  let account: LoyaltyAccount | null = null;
  if (contact.squareLoyaltyAccountId) {
    const read = await retrieveLoyaltyAccount(companyId, contact.squareLoyaltyAccountId);
    if (read.ok) account = read.data;
  }
  return { program: state.program, account, canJoin: !account && Boolean(toE164(contact.phone)) };
}

/**
 * A payment landed on an enrolled client's invoice → the points Square's
 * rules give for that amount. Best effort: nothing here can fail the
 * payment. Surcharge and gift-card redemptions earn nothing (the client
 * did not spend new money with the business on the fee; a gift card was
 * earned when it was bought).
 */
export async function accrueLoyaltyForPayment(paymentId: string): Promise<"accrued" | "skipped"> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      amount: true,
      surchargeAmount: true,
      method: true,
      companyId: true,
      invoice: { select: { id: true, invoiceNumber: true, contact: { select: { id: true, squareLoyaltyAccountId: true, firstName: true, lastName: true } } } },
      company: { select: { squareLocationId: true, squareConnection: { select: { loyaltyProgramId: true, loyaltyStatus: true } } } },
    },
  });
  const conn = payment?.company.squareConnection;
  const accountId = payment?.invoice.contact?.squareLoyaltyAccountId;
  if (!payment || !conn?.loyaltyProgramId || conn.loyaltyStatus !== "ACTIVE" || !accountId || !payment.company.squareLocationId) return "skipped";
  if (payment.method === "GIFT_CARD") return "skipped";
  const spentCents = Math.round((Number(payment.amount) - Number(payment.surchargeAmount ?? 0)) * 100);
  if (spentCents <= 0) return "skipped";
  const calc = await calculateLoyaltyPoints(payment.companyId, { programId: conn.loyaltyProgramId, amountCents: spentCents, accountId });
  if (!calc.ok) return "skipped";
  const points = calc.data.points + calc.data.promotionPoints;
  if (points <= 0) return "skipped";
  const added = await accumulateLoyaltyPoints(payment.companyId, { accountId, points, locationId: payment.company.squareLocationId, idempotencyKey: `lp:${paymentId}` });
  if (!added.ok) {
    if (!added.transient && !added.missingScopes) reportError("[loyalty] accumulate failed", paymentId, added.message);
    return "skipped";
  }
  logActivity({
    companyId: payment.companyId,
    userName: "Square",
    entityType: "invoice",
    entityId: payment.invoice.id,
    action: "loyalty_points",
    detail: `+${points} rewards points for invoice #${payment.invoice.invoiceNumber}`,
  });
  return "accrued";
}

export type RewardGrant = { rewardId: string; tierName: string; points: number; discount: number; newTotal: number; balanceAfter: number };

/**
 * Spend a reward on an invoice: the reward is issued at Square (points set
 * aside), the invoice's discount becomes the tier's amount or percentage,
 * then the reward is redeemed. Any failure after the issue un-issues it so
 * the points come back. Only an unpaid invoice with no discount yet.
 */
export async function grantLoyaltyReward(params: { companyId: string; invoiceId: string; tierId: string; actorId: string; actorName: string }): Promise<RewardGrant> {
  const program = await activeProgram(params.companyId);
  const tier = program.tiers.find((t) => t.id === params.tierId);
  if (!tier) throw new LoyaltyError("That reward isn't in the program any more.", 404);
  const locationId = await locationFor(params.companyId);
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
    select: { id: true, invoiceNumber: true, status: true, subtotal: true, discountType: true, discountValue: true, discount: true, taxRate: true, total: true, contact: { select: { id: true, squareLoyaltyAccountId: true } }, payments: { select: { id: true } } },
  });
  if (!invoice) throw new LoyaltyError("Invoice not found.", 404);
  if (invoice.status === "PAID" || invoice.status === "ARCHIVED") throw new LoyaltyError("This invoice is closed.");
  if (invoice.payments.length) throw new LoyaltyError("Use the reward before any payment is taken on the invoice.");
  if (invoice.discountType !== "NONE" && Number(invoice.discount ?? 0) > 0) throw new LoyaltyError("This invoice already has a discount — rewards don't stack with one.", 409, "HAS_DISCOUNT");
  const accountId = invoice.contact?.squareLoyaltyAccountId;
  if (!accountId) throw new LoyaltyError("Enroll the client in rewards first.", 409, "NOT_ENROLLED");
  const discount = rewardDiscountFor(tier, Number(invoice.subtotal));
  if (!discount) throw new LoyaltyError("That reward applies to one item in Square, not a whole invoice — redeem it in the Square app instead.", 409, "ITEM_REWARD");
  const account = await retrieveLoyaltyAccount(params.companyId, accountId);
  if (!account.ok) throw fromFailure(account);
  if (!account.data) throw new LoyaltyError("The client's rewards account is gone from Square — enroll them again.", 409, "NOT_ENROLLED");
  if (account.data.balance < tier.points) throw new LoyaltyError(`The client has ${account.data.balance} ${account.data.balance === 1 ? program.one : program.other}; this reward needs ${tier.points}.`, 409, "NOT_ENOUGH");

  const issued = await createLoyaltyReward(params.companyId, { accountId, tierId: tier.id, idempotencyKey: `lr:${invoice.id}:${tier.id}:${Date.now()}` });
  if (!issued.ok) throw fromFailure(issued);
  const rewardId = issued.data.id;
  const totals = computeQuoteTotals({ subtotal: Number(invoice.subtotal), discountType: discount.discountType, discountValue: discount.discountValue, taxRate: invoice.taxRate == null ? null : Number(invoice.taxRate) });
  try {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { discountType: discount.discountType, discountValue: discount.discountValue, discount: totals.discount, tax: totals.tax, total: totals.total },
    });
    const redeemed = await redeemLoyaltyReward(params.companyId, { rewardId, locationId, idempotencyKey: `lrr:${rewardId}` });
    if (!redeemed.ok) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { discountType: invoice.discountType, discountValue: invoice.discountValue, discount: invoice.discount, taxRate: invoice.taxRate, total: invoice.total },
      });
      throw fromFailure(redeemed);
    }
  } catch (err) {
    await deleteLoyaltyReward(params.companyId, rewardId).catch(() => {});
    throw err;
  }
  logActivity({
    companyId: params.companyId,
    userId: params.actorId,
    userName: params.actorName,
    entityType: "invoice",
    entityId: invoice.id,
    action: "loyalty_reward",
    detail: `Reward "${tier.name}" (${tier.points} ${program.other}) — $${totals.discount.toFixed(2)} off invoice #${invoice.invoiceNumber} (Square reward ${rewardId})`,
  });
  return { rewardId, tierName: tier.name, points: tier.points, discount: totals.discount, newTotal: totals.total, balanceAfter: account.data.balance - tier.points };
}

/** Managers add or remove points by hand (a make-good, a counter sale rung elsewhere). */
export async function adjustContactPoints(params: { companyId: string; contactId: string; points: number; reason: string; actorId: string; actorName: string }): Promise<LoyaltyAccount> {
  const program = await activeProgram(params.companyId);
  const contact = await prisma.contact.findFirst({ where: { id: params.contactId, companyId: params.companyId }, select: { id: true, squareLoyaltyAccountId: true } });
  if (!contact?.squareLoyaltyAccountId) throw new LoyaltyError("Enroll the client in rewards first.", 409, "NOT_ENROLLED");
  const points = Math.round(params.points);
  if (!points || Math.abs(points) > 100_000) throw new LoyaltyError("Enter how many points to add or remove.");
  const reason = params.reason.trim();
  if (!reason) throw new LoyaltyError("Say why — it shows in Square's history.");
  const done = await adjustLoyaltyPoints(params.companyId, { accountId: contact.squareLoyaltyAccountId, points, reason, idempotencyKey: `la:${contact.id}:${Date.now()}` });
  if (!done.ok) throw fromFailure(done);
  const after = await retrieveLoyaltyAccount(params.companyId, contact.squareLoyaltyAccountId);
  if (!after.ok || !after.data) throw new LoyaltyError("Points changed, but Square didn't answer with the new balance.", 424);
  logActivity({
    companyId: params.companyId,
    userId: params.actorId,
    userName: params.actorName,
    entityType: "contact",
    entityId: contact.id,
    action: "loyalty_adjust",
    detail: `${points > 0 ? "+" : ""}${points} ${program.other} — ${reason}`,
  });
  return after.data;
}

export type LoyaltyMember = { account: LoyaltyAccount; contact: { id: string; firstName: string; lastName: string } | null };

/** Everyone in the program (Square's list) matched to WorkBench clients by account id, then phone. */
export async function listLoyaltyMembers(companyId: string, cursor?: string | null): Promise<{ members: LoyaltyMember[]; cursor: string | null; failure: SellerReadFailure | null }> {
  const read = await searchLoyaltyAccounts(companyId, { cursor, limit: 100 });
  if (!read.ok) return { members: [], cursor: null, failure: read };
  const accounts = read.data.accounts;
  const ids = accounts.map((a) => a.id);
  const phones = accounts.map((a) => a.phone?.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1")).filter((p): p is string => Boolean(p));
  const contacts = await prisma.contact.findMany({
    where: { companyId, OR: [{ squareLoyaltyAccountId: { in: ids } }, { phoneDigits: { in: phones } }] },
    select: { id: true, firstName: true, lastName: true, squareLoyaltyAccountId: true, phoneDigits: true },
  });
  const byAccount = new Map(contacts.filter((c) => c.squareLoyaltyAccountId).map((c) => [c.squareLoyaltyAccountId as string, c]));
  const byPhone = new Map(contacts.filter((c) => c.phoneDigits).map((c) => [c.phoneDigits as string, c]));
  const members = accounts.map((account) => {
    const digits = account.phone?.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1") ?? "";
    const c = byAccount.get(account.id) ?? (digits ? byPhone.get(digits) : undefined) ?? null;
    return { account, contact: c ? { id: c.id, firstName: c.firstName, lastName: c.lastName } : null };
  });
  return { members, cursor: read.data.cursor, failure: null };
}
