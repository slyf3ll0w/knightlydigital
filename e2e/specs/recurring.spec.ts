// Recurring engine: monthly plan first-bill + payment anchoring, run-due
// idempotency, per-visit billing (exactly one invoice per visit), and the
// ready-to-bill queue. Uses DRAFT invoiceMode throughout so nothing emails.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const todayIso = () => new Date().toISOString().slice(0, 10);

test.describe("recurring billing", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA();
    contactId = (await createContact(api, "Recurring")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("interval and billPerVisit are mutually exclusive", async () => {
    await api.post(
      "/api/app/subscriptions",
      {
        name: "E2E invalid shape",
        contactId,
        interval: "MONTHLY",
        billPerVisit: true,
        unitPrice: 50,
        visitFrequency: "WEEKLY",
        nextVisitDate: todayIso(),
      },
      400
    );
  });

  test("monthly plan bills at signup and anchors to the first payment", async () => {
    const sub = await api.post("/api/app/subscriptions", {
      name: "E2E monthly plan",
      contactId,
      interval: "MONTHLY",
      unitPrice: 60,
      invoiceMode: "DRAFT",
    });
    expect(sub.firstBill).toBe("drafted");

    const invoice = await db().invoice.findFirst({
      where: { subscriptionId: sub.id },
    });
    expect(invoice).toBeTruthy();
    expect(Number(invoice!.total)).toBeCloseTo(60, 2);

    // Unanchored until money moves.
    let dbSub = await db().subscription.findUnique({ where: { id: sub.id } });
    expect(dbSub!.anchoredAt).toBeNull();

    // Run-due sweep must not double-bill the fresh plan.
    await api.post("/api/app/subscriptions/run", undefined, 200);
    const invoiceCount = await db().invoice.count({
      where: { subscriptionId: sub.id },
    });
    expect(invoiceCount).toBe(1);

    // The first real payment sets the anchor and re-points the cursor forward.
    const pay = await api.post("/api/app/payments", {
      invoiceId: invoice!.id,
      amount: 60,
      method: "CHECK",
    });
    expect(pay.fullyPaid).toBe(true);

    dbSub = await db().subscription.findUnique({ where: { id: sub.id } });
    expect(dbSub!.anchoredAt).not.toBeNull();
    expect(dbSub!.nextRunDate).not.toBeNull();
    expect(dbSub!.nextRunDate!.getTime()).toBeGreaterThan(Date.now());
    // Anchored to today's day-of-month (clamped for short months).
    const expectedDay = Math.min(
      new Date().getDate(),
      new Date(
        dbSub!.nextRunDate!.getFullYear(),
        dbSub!.nextRunDate!.getMonth() + 1,
        0
      ).getDate()
    );
    expect(dbSub!.nextRunDate!.getDate()).toBe(expectedDay);
  });

  test("per-visit billing mints exactly one invoice per completed visit", async () => {
    const sub = await api.post("/api/app/subscriptions", {
      name: "E2E per-visit series",
      contactId,
      billPerVisit: true,
      unitPrice: 40,
      invoiceMode: "DRAFT",
      visitFrequency: "WEEKLY",
      nextVisitDate: todayIso(),
    });
    expect(sub.visitsCreated).toBeGreaterThan(0);

    const visit = await db().job.findFirst({
      where: { subscriptionId: sub.id },
      orderBy: { scheduledAt: "asc" },
    });
    expect(visit).toBeTruthy();

    // Completing the visit bills it…
    const done = await api.patch(`/api/app/jobs/${visit!.id}/status`, {
      status: "REQUIRES_INVOICING",
    });
    expect(done.visitBilling).toBe("drafted");
    const invoice = await db().invoice.findFirst({ where: { jobId: visit!.id } });
    expect(invoice).toBeTruthy();
    expect(Number(invoice!.total)).toBeCloseTo(40, 2);

    // …and completing it again cannot bill twice (one-invoice-per-job).
    await api.patch(`/api/app/jobs/${visit!.id}/status`, {
      status: "REQUIRES_INVOICING",
    });
    const count = await db().invoice.count({
      where: { subscriptionId: sub.id },
    });
    expect(count).toBe(1);
  });

  test("ready-to-bill queue pools visits until bill-ready sweeps them", async () => {
    // holdForReview alone = queue mode (consolidateMonthly stored true but NO
    // cursor); sending consolidateMonthly:true too would make it a legacy
    // monthly-cursor series instead.
    const sub = await api.post("/api/app/subscriptions", {
      name: "E2E queue series",
      contactId,
      billPerVisit: true,
      holdForReview: true,
      unitPrice: 35,
      invoiceMode: "DRAFT",
      visitFrequency: "WEEKLY",
      nextVisitDate: todayIso(),
    });
    // Queue mode = no cursor: the cron's consolidation sweep must never claim it.
    const dbSub = await db().subscription.findUnique({ where: { id: sub.id } });
    expect(dbSub!.nextRunDate).toBeNull();

    const visit = await db().job.findFirst({
      where: { subscriptionId: sub.id },
      orderBy: { scheduledAt: "asc" },
    });
    expect(visit).toBeTruthy();

    // Completion pools the visit — no invoice yet.
    const done = await api.patch(`/api/app/jobs/${visit!.id}/status`, {
      status: "REQUIRES_INVOICING",
    });
    expect(done.visitBilling).toBeNull();
    expect(await db().invoice.count({ where: { subscriptionId: sub.id } })).toBe(0);

    // The queue sweep bills the pool as one invoice and stamps the visit.
    const swept = await api.post("/api/app/subscriptions/bill-ready", undefined, 200);
    expect(swept.invoices).toBeGreaterThanOrEqual(1);
    const invoice = await db().invoice.findFirst({
      where: { subscriptionId: sub.id },
      include: { lineItems: true },
    });
    expect(invoice).toBeTruthy();
    expect(Number(invoice!.total)).toBeCloseTo(35, 2);
    expect(invoice!.lineItems.some((li) => li.serviceDate)).toBe(true);
    const sweptVisit = await db().job.findUnique({ where: { id: visit!.id } });
    expect(sweptVisit!.consolidatedInvoiceId).toBe(invoice!.id);

    // A second sweep with an empty pool must not bill again.
    await api.post("/api/app/subscriptions/bill-ready", undefined, 200);
    expect(await db().invoice.count({ where: { subscriptionId: sub.id } })).toBe(1);
  });
});
