import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { pricebookForIndustry } from "@/lib/pricebooks";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/business-hours";
import { defaultSettingsForKind } from "@/lib/booking-types";
import { nextInvoiceNumber, nextQuoteNumber, withDocNumberRetry } from "@/lib/doc-numbers";
import { dueDateFromTerms } from "@/lib/due-dates";
import { deleteObject, isBlobStorageConfigured } from "@/lib/blob-storage";
import { rememberDemoCompanyId } from "@/lib/demo-guard";
import {
  DEMO_BOOKING_ITEM,
  DEMO_BOOKING_PATH,
  DEMO_COMPANY_NAME,
  DEMO_COMPANY_SLUG,
  DEMO_HUB_PATH,
  DEMO_HUB_TOKEN,
  DEMO_INVOICE_TOKEN,
  DEMO_OWNER_EMAIL,
  DEMO_QUOTE_TOKEN,
  demoResetRefusal,
} from "@/lib/demo-company-shared";

export { isDemoCompanyId } from "@/lib/demo-guard";
export * from "@/lib/demo-company-shared";

/**
 * Brightwire Electric — the made-up company behind the marketing site's
 * "Try the real thing" section. Visitors fill in its real booking form
 * (`/embed/brightwire-electric/free-estimate-visit`) and open a demo
 * client's real hub (`/hub/demo-brightwire-maria-hernandez`).
 *
 * - It creates itself: `ensureDemoCompany()` is idempotent and runs from
 *   the hourly cron (`demoCompany` step, which also resets) and once at
 *   server boot (instrumentation.ts), so nobody runs a script against prod.
 * - It is silent: every outbound sender asks lib/demo-guard.ts
 *   `isDemoCompanyId` (email, texts, calls, team + client push, automation
 *   webhooks, the WorkBench billing contact).
 * - It resets: `resetDemoCompany()` wipes whatever visitors made and puts
 *   the fixtures back, hourly. Every delete is scoped to the demo company
 *   id, and nothing is deleted unless `demoResetRefusal` (pure, tested)
 *   says the company really is Brightwire.
 *
 * `DEMO_COMPANY=0` turns the cron step and the boot ensure off.
 */

const CLIENT = {
  firstName: "Maria",
  lastName: "Hernandez",
  // example.com is reserved (RFC 2606): it never receives mail.
  email: "maria.demo@example.com",
  address: "4521 Cedar Elm Dr",
  city: "Plano",
  state: "TX",
  zip: "75093",
};

const QUOTE_TITLE = "Panel upgrade to 200A";
const QUOTE_LINES: { name: string; quantity: number }[] = [
  { name: "Panel Upgrade (200A)", quantity: 1 },
  { name: "Whole-Home Surge Protector", quantity: 1 },
  { name: "GFCI Outlet Installation", quantity: 2 },
];
const INVOICE_SUBJECT = "Ceiling fan install x3";
const INVOICE_LINES: { name: string; quantity: number }[] = [{ name: "Ceiling Fan Installation", quantity: 3 }];

const BOOKING_NAME = "Free estimate visit";

export type DemoCompanyIds = { companyId: string; hubToken: string; bookingItemSlug: string };

type Db = Prisma.TransactionClient | typeof prisma;

/** The company fields the demo always has (re-asserted on every ensure). */
function companyFields() {
  return {
    name: DEMO_COMPANY_NAME,
    legalName: null,
    email: DEMO_OWNER_EMAIL,
    // Never printed on client pages: the inbox is not a real one.
    hideEmail: true,
    notifyEmailOff: true,
    notifyEmail: null,
    phone: null,
    smsAcknowledgedAt: null,
    city: "Plano",
    state: "TX",
    zip: "75074",
    industry: "Electrical",
    isTest: true,
    isPlatform: false,
    paymentsWaived: true,
    paymentsRequiredAt: null,
    accessPendingAt: null,
    suspendedAt: null,
    timezone: "America/Chicago",
    brandColor: "#10244A",
    brandColorSecondary: "#F5B700",
    documentColor: "#10244A",
    businessHours: DEFAULT_BUSINESS_HOURS as unknown as Prisma.InputJsonValue,
    hubBookingTypeId: null,
    defaultTaxRate: null,
    // Nothing reaches out on this company's behalf.
    connectorsOff: true,
    assistantEnabled: false,
    leadWebhookToken: null,
    emailDomain: null,
    emailDomainId: null,
    emailDomainStatus: null,
    setupNudgeSentAt: new Date(0),
  } satisfies Prisma.CompanyUpdateInput;
}

async function findDemoCompany(db: Db) {
  return db.company.findUnique({
    where: { slug: DEMO_COMPANY_SLUG },
    select: { id: true, slug: true, isTest: true, isPlatform: true, email: true },
  });
}

function isUniqueClash(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Create the demo company and its fixtures if missing, repair them if
 * drifted. Idempotent; safe to run concurrently (a unique clash from a
 * racing run is retried once against what the winner made).
 */
export async function ensureDemoCompany(): Promise<DemoCompanyIds> {
  try {
    return await ensureOnce();
  } catch (e) {
    if (!isUniqueClash(e)) throw e;
    return ensureOnce();
  }
}

async function ensureOnce(): Promise<DemoCompanyIds> {
  // ── Account (the login nobody knows the password of) ──
  const account = await prisma.account.upsert({
    where: { email: DEMO_OWNER_EMAIL },
    create: { email: DEMO_OWNER_EMAIL, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12) },
    update: {},
    select: { id: true },
  });

  // ── Company ──
  let company = await findDemoCompany(prisma);
  if (company && (company.email ?? "").trim().toLowerCase() !== DEMO_OWNER_EMAIL) {
    // Someone else owns the slug (the demo owner's inbox is the marker): never take it over.
    throw new Error(`[demo-company] slug "${DEMO_COMPANY_SLUG}" belongs to a real company (${company.id})`);
  }
  if (!company) {
    // An earlier web address of a real company? Refuse rather than shadow it.
    const previous = await prisma.company.findFirst({ where: { previousSlugs: { has: DEMO_COMPANY_SLUG } }, select: { id: true } });
    if (previous) throw new Error(`[demo-company] slug "${DEMO_COMPANY_SLUG}" is an earlier address of company ${previous.id}`);
    company = await prisma.company.create({
      data: {
        slug: DEMO_COMPANY_SLUG,
        ...companyFields(),
        sidebarTheme: "white",
        workItems: { create: pricebookForIndustry("Electrical") },
      },
      select: { id: true, slug: true, isTest: true, isPlatform: true, email: true },
    });
  } else {
    await prisma.company.update({ where: { id: company.id }, data: companyFields() });
    company = { ...company, isTest: true, isPlatform: false, email: DEMO_OWNER_EMAIL };
  }
  const refusal = demoResetRefusal(company);
  if (refusal) throw new Error(`[demo-company] refusing: ${refusal}`);
  const companyId = company.id;
  rememberDemoCompanyId(companyId);

  // ── Price book (signup's electrical starter book) ──
  if ((await prisma.workItem.count({ where: { companyId } })) === 0) {
    await prisma.workItem.createMany({ data: pricebookForIndustry("Electrical").map((w) => ({ ...w, companyId })) });
  }

  // ── Owner (bookable, like a fresh signup's owner) ──
  const ownerRow = {
    email: DEMO_OWNER_EMAIL,
    name: DEMO_COMPANY_NAME,
    role: "OWNER" as const,
    isActive: true,
    bookable: true,
    phone: null,
    workingHours: Prisma.DbNull,
  };
  let owner = await prisma.user.findFirst({
    where: { companyId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (owner) {
    await prisma.user.update({ where: { id: owner.id }, data: { ...ownerRow, accountId: account.id } });
  } else {
    owner = await prisma.user.create({ data: { ...ownerRow, companyId, accountId: account.id }, select: { id: true } });
  }
  await prisma.account.update({ where: { id: account.id }, data: { lastActiveUserId: owner.id } });

  // ── Fixture client ──
  const contactId = await ensureClient(companyId);

  // ── Fixture quote + invoice ──
  await ensureQuote(companyId, contactId);
  await ensureInvoice(companyId, contactId);

  // ── Booking item ──
  await ensureBookingItem(companyId, owner.id);

  return { companyId, hubToken: DEMO_HUB_TOKEN, bookingItemSlug: DEMO_BOOKING_ITEM };
}

function clientFields() {
  return {
    ...CLIENT,
    kind: "CLIENT" as const,
    status: "ACTIVE" as const,
    placeholder: false,
    companyName: null,
    phone: null,
    phoneDigits: null,
    notes: null,
    customFields: Prisma.DbNull,
    pipelineStageId: null,
    lostAt: null,
    lostReason: null,
    smsOptOut: false,
    smsDisabled: true,
    smsConsentAt: null,
    smsConsentSource: null,
    leadSource: "Online booking",
    paymentTermsDays: 30,
    processorCustomerRef: null,
    savedCardLabel: null,
    savedCardAt: null,
    squareCustomerId: null,
    finixBuyerIdentityId: null,
    hubToken: DEMO_HUB_TOKEN,
  };
}

async function ensureClient(companyId: string): Promise<string> {
  const existing = await prisma.contact.findUnique({ where: { hubToken: DEMO_HUB_TOKEN }, select: { id: true, companyId: true } });
  if (existing && existing.companyId !== companyId) {
    throw new Error(`[demo-company] hub token ${DEMO_HUB_TOKEN} belongs to another company`);
  }
  if (existing) {
    await prisma.contact.update({ where: { id: existing.id }, data: clientFields() });
    return existing.id;
  }
  const created = await prisma.contact.create({ data: { ...clientFields(), companyId, wonAt: new Date(), timesWon: 1 }, select: { id: true } });
  return created.id;
}

async function priceLines(companyId: string, lines: { name: string; quantity: number }[]) {
  const items = await prisma.workItem.findMany({
    where: { companyId, name: { in: lines.map((l) => l.name) } },
    select: { id: true, name: true, description: true, unitPrice: true, unitCost: true },
  });
  return lines.map((l, i) => {
    const w = items.find((x) => x.name === l.name);
    const unitPrice = w ? Number(w.unitPrice) : 0;
    return {
      name: l.name,
      description: w?.description ?? "",
      quantity: l.quantity,
      unitPrice,
      unitCost: w?.unitCost == null ? null : Number(w.unitCost),
      total: Math.round(unitPrice * l.quantity * 100) / 100,
      workItemId: w?.id ?? null,
      sortOrder: i,
    };
  });
}

function sum(lines: { total: number }[]): number {
  return Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
}

/** The fixture quote: SENT (AWAITING_RESPONSE), unsigned, fresh lines. */
async function ensureQuote(companyId: string, contactId: string, db: Db = prisma, now = new Date()): Promise<string> {
  const lines = await priceLines(companyId, QUOTE_LINES);
  const subtotal = sum(lines);
  const fields = {
    title: QUOTE_TITLE,
    status: "AWAITING_RESPONSE" as const,
    subtotal,
    discountType: "NONE" as const,
    discountValue: null,
    discount: null,
    taxRate: null,
    tax: null,
    total: subtotal,
    depositType: "NONE" as const,
    depositValue: null,
    clientMessage: "Thanks for having us out, Maria. Here is the panel upgrade we talked about.",
    disclaimer: null,
    notes: null,
    validUntil: new Date(now.getTime() + 30 * 86_400_000),
    sentAt: new Date(now.getTime() - 86_400_000),
    scheduledSendAt: null,
    scheduledSendById: null,
    approvedAt: null,
    signatureName: null,
    changeRequest: null,
    jobId: null,
    requestId: null,
    propertyId: null,
    estimatorId: null,
  };
  const existing = await db.quote.findUnique({ where: { publicToken: DEMO_QUOTE_TOKEN }, select: { id: true, companyId: true } });
  if (existing && existing.companyId !== companyId) throw new Error("[demo-company] fixture quote token belongs to another company");
  if (existing) {
    await db.quoteLineItem.deleteMany({ where: { quoteId: existing.id } });
    await db.quote.update({
      where: { id: existing.id },
      data: { ...fields, contactId, lineItems: { create: lines } },
    });
    return existing.id;
  }
  const created = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const quoteNumber = await nextQuoteNumber(tx, companyId);
      return tx.quote.create({
        data: { ...fields, companyId, contactId, quoteNumber, publicToken: DEMO_QUOTE_TOKEN, lineItems: { create: lines } },
        select: { id: true },
      });
    })
  );
  return created.id;
}

/** The fixture invoice: issued, AWAITING_PAYMENT, nothing paid, due in the future. */
async function ensureInvoice(companyId: string, contactId: string, db: Db = prisma, now = new Date()): Promise<string> {
  const lines = (await priceLines(companyId, INVOICE_LINES)).map((l) => ({ ...l, serviceDate: null }));
  const subtotal = sum(lines);
  const issuedAt = new Date(now.getTime() - 2 * 86_400_000);
  const fields = {
    kind: "STANDARD" as const,
    subject: INVOICE_SUBJECT,
    status: "AWAITING_PAYMENT" as const,
    subtotal,
    discountType: "NONE" as const,
    discountValue: null,
    discount: null,
    taxRate: null,
    tax: null,
    surcharge: null,
    depositApplied: null,
    total: subtotal,
    notes: null,
    clientMessage: "Thanks for choosing Brightwire Electric.",
    issuedAt,
    dueDate: dueDateFromTerms(issuedAt, 30),
    paidAt: null,
    scheduledSendAt: null,
    scheduledSendById: null,
    paidCelebratedAt: null,
    autoChargeAttempts: 0,
    autoChargeNextAt: null,
    autoChargeLastError: null,
    autoChargeGaveUpAt: null,
    chargeLockedAt: null,
    jobId: null,
    quoteId: null,
    appointmentId: null,
    subscriptionId: null,
  };
  const existing = await db.invoice.findUnique({ where: { publicToken: DEMO_INVOICE_TOKEN }, select: { id: true, companyId: true } });
  if (existing && existing.companyId !== companyId) throw new Error("[demo-company] fixture invoice token belongs to another company");
  if (existing) {
    await db.invoiceLineItem.deleteMany({ where: { invoiceId: existing.id } });
    await db.invoice.update({ where: { id: existing.id }, data: { ...fields, contactId, lineItems: { create: lines } } });
    return existing.id;
  }
  const created = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, companyId);
      return tx.invoice.create({
        data: { ...fields, companyId, contactId, invoiceNumber, publicToken: DEMO_INVOICE_TOKEN, lineItems: { create: lines } },
        select: { id: true },
      });
    })
  );
  return created.id;
}

/**
 * The booking item: an in-person "Free estimate visit", SCHEDULE mode, the
 * owner in its pool, 60 minutes — so the form shows real open times inside
 * Mon–Fri 8–5 (Company.businessHours) and a booking makes a real Request +
 * Appointment (lib/booking-submit.ts).
 */
async function ensureBookingItem(companyId: string, ownerId: string, db: Db = prisma): Promise<string> {
  const base = defaultSettingsForKind("IN_PERSON", BOOKING_NAME, "SCHEDULE");
  const fields = {
    ...base,
    description: "We come out, look at the job and leave you a written price. No charge.",
    mode: "SCHEDULE" as const,
    isActive: true,
    showOnPage: true,
    durationMinutes: 60,
    sortOrder: 0,
    paymentMode: "NONE" as const,
    confirmation: "INSTANT" as const,
    intake: Prisma.DbNull,
  };
  const existing = await db.bookingType.findUnique({
    where: { companyId_slug: { companyId, slug: DEMO_BOOKING_ITEM } },
    select: { id: true },
  });
  let id: string;
  if (existing) {
    await db.bookingType.update({ where: { id: existing.id }, data: fields });
    id = existing.id;
  } else {
    id = (await db.bookingType.create({ data: { ...fields, companyId, slug: DEMO_BOOKING_ITEM }, select: { id: true } })).id;
  }
  await db.bookingTypeMember.deleteMany({ where: { bookingTypeId: id, userId: { not: ownerId } } });
  await db.bookingTypeMember.upsert({
    where: { bookingTypeId_userId: { bookingTypeId: id, userId: ownerId } },
    create: { bookingTypeId: id, userId: ownerId },
    update: { priority: 0, lastAssignedAt: null },
  });
  return id;
}

export type DemoResetSummary = { companyId: string; deleted: Record<string, number> };

/**
 * Put Brightwire back the way a visitor first sees it: everything visitors
 * made since the fixtures is deleted (contacts, requests, appointments,
 * jobs, messages, notes, new quotes / invoices / payments …), the fixture
 * quote is SENT and unsigned again, the fixture invoice unpaid. Every
 * delete carries `companyId: demoId`, and nothing runs unless the company
 * passes `demoResetRefusal`. Safe hourly.
 */
export async function resetDemoCompany(now: Date = new Date()): Promise<DemoResetSummary> {
  const { companyId } = await ensureDemoCompany();

  // Re-read and re-check right before deleting anything.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true, isTest: true, isPlatform: true, email: true },
  });
  const refusal = demoResetRefusal(company);
  if (refusal) throw new Error(`[demo-company] reset refused: ${refusal}`);
  const demoId = company!.id;

  const [contact, quote, invoice, owner, booking] = await Promise.all([
    prisma.contact.findFirst({ where: { companyId: demoId, hubToken: DEMO_HUB_TOKEN }, select: { id: true } }),
    prisma.quote.findFirst({ where: { companyId: demoId, publicToken: DEMO_QUOTE_TOKEN }, select: { id: true } }),
    prisma.invoice.findFirst({ where: { companyId: demoId, publicToken: DEMO_INVOICE_TOKEN }, select: { id: true } }),
    prisma.user.findFirst({ where: { companyId: demoId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { id: true } }),
    prisma.bookingType.findFirst({ where: { companyId: demoId, slug: DEMO_BOOKING_ITEM }, select: { id: true } }),
  ]);
  if (!contact || !quote || !invoice || !owner || !booking) {
    throw new Error("[demo-company] reset refused: a fixture is missing after ensure");
  }
  const keep = { contactId: contact.id, quoteId: quote.id, invoiceId: invoice.id, ownerId: owner.id, bookingTypeId: booking.id };

  // Stored bytes to drop once the rows are gone (photos, message pictures).
  const [photos, media] = await Promise.all([
    prisma.jobPhoto.findMany({ where: { companyId: demoId }, select: { storageKey: true, thumbKey: true, markedKey: true } }),
    prisma.portalMessageMedia.findMany({ where: { companyId: demoId }, select: { storageKey: true } }),
  ]);
  const blobKeys = [
    ...photos.flatMap((p) => [p.storageKey, p.thumbKey, p.markedKey]),
    ...media.map((m) => m.storageKey),
  ].filter((k): k is string => Boolean(k));

  const deleted: Record<string, number> = {};
  const count = (name: string, r: { count: number }) => {
    if (r.count) deleted[name] = (deleted[name] ?? 0) + r.count;
  };
  const c = { companyId: demoId };

  await prisma.$transaction(
    async (tx) => {
      // Loose records first (nothing references them).
      count("tasks", await tx.task.deleteMany({ where: c }));
      count("stickyNotes", await tx.stickyNote.deleteMany({ where: c }));
      count("notices", await tx.automationNotice.deleteMany({ where: c }));
      count("automations", await tx.automation.deleteMany({ where: c }));
      count("activity", await tx.activityLog.deleteMany({ where: c }));
      count("reviewRequests", await tx.reviewRequest.deleteMany({ where: c }));
      count("clientMessages", await tx.clientMessage.deleteMany({ where: c }));
      count("messageMedia", await tx.portalMessageMedia.deleteMany({ where: c }));
      count("portalMessages", await tx.portalMessage.deleteMany({ where: c }));
      count("calls", await tx.call.deleteMany({ where: c }));
      count("bookingRequests", await tx.bookingRequest.deleteMany({ where: c }));
      count("expenses", await tx.expense.deleteMany({ where: c }));
      count("recurringExpenses", await tx.recurringExpense.deleteMany({ where: c }));

      // Money.
      count("refunds", await tx.refund.deleteMany({ where: c }));
      count("payments", await tx.payment.deleteMany({ where: c }));
      count("giftCards", await tx.giftCardSale.deleteMany({ where: c }));
      count("contracts", await tx.contract.deleteMany({ where: c }));
      await tx.paymentReminder.deleteMany({ where: { invoiceId: keep.invoiceId, invoice: c } });
      await tx.quoteReminder.deleteMany({ where: { quoteId: keep.quoteId, quote: c } });
      await tx.quoteRevision.deleteMany({ where: { quoteId: keep.quoteId, quote: c } });

      // Unhook the fixtures from anything about to go.
      await tx.invoice.updateMany({ where: { ...c, id: keep.invoiceId }, data: { jobId: null, quoteId: null, appointmentId: null, subscriptionId: null } });
      await tx.quote.updateMany({ where: { ...c, id: keep.quoteId }, data: { jobId: null, requestId: null, propertyId: null } });

      count("invoices", await tx.invoice.deleteMany({ where: { ...c, id: { not: keep.invoiceId } } }));
      count("photos", await tx.jobPhoto.deleteMany({ where: c }));
      count("timeBlocks", await tx.timeBlock.deleteMany({ where: c }));
      count("timeBlockSeries", await tx.timeBlockSeries.deleteMany({ where: c }));
      count("locationPings", await tx.locationPing.deleteMany({ where: c }));
      count("timeEntries", await tx.timeEntry.deleteMany({ where: c }));
      count("quotes", await tx.quote.deleteMany({ where: { ...c, id: { not: keep.quoteId } } }));
      count("jobs", await tx.job.deleteMany({ where: c }));
      count("appointments", await tx.appointment.deleteMany({ where: c }));
      count("subscriptions", await tx.subscription.deleteMany({ where: c }));
      count("requests", await tx.request.deleteMany({ where: c }));
      count("savedCards", await tx.savedCard.deleteMany({ where: c }));

      // People: every contact but the fixture client, and the client's extras.
      count("contacts", await tx.contact.deleteMany({ where: { ...c, id: { not: keep.contactId } } }));
      const mine = { contactId: keep.contactId, contact: c };
      count("clientNotes", await tx.contactNote.deleteMany({ where: mine }));
      count("clientPeople", await tx.contactPerson.deleteMany({ where: mine }));
      count("clientAddresses", await tx.contactAddress.deleteMany({ where: mine }));
      count("clientPush", await tx.contactPushSubscription.deleteMany({ where: mine }));

      // Booking items other than the fixture one; teammates other than the owner stay off.
      count("bookingItems", await tx.bookingType.deleteMany({ where: { ...c, id: { not: keep.bookingTypeId } } }));
      await tx.user.updateMany({ where: { ...c, id: { not: keep.ownerId } }, data: { isActive: false, bookable: false } });

      // Fixtures back to their first state.
      await tx.contact.update({ where: { id: keep.contactId }, data: clientFields() });
      await ensureQuote(demoId, keep.contactId, tx, now);
      await ensureInvoice(demoId, keep.contactId, tx, now);
      await ensureBookingItem(demoId, keep.ownerId, tx);
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  if (blobKeys.length && isBlobStorageConfigured()) {
    for (const key of blobKeys) {
      await deleteObject(key).catch((e) => reportError("[demo-company] orphaned object", { key, error: e }));
    }
  }
  return { companyId: demoId, deleted };
}

/** The two links the marketing page frames, after making sure they work. */
export async function getDemoLinks(): Promise<{ bookingPath: string; hubPath: string }> {
  await ensureDemoCompany();
  return { bookingPath: DEMO_BOOKING_PATH, hubPath: DEMO_HUB_PATH };
}
