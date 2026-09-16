// Invoice money math + status lifecycle, driven through the real API.
// Guards the invariants in lib/payments.ts: server-computed totals, partial
// payments, PAID ⇔ balance cleared, payment edit/delete recompute, and the
// zero/negative guards. Invoice detail has no GET route (pages read it
// server-side), so state assertions look straight at the database.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

test.describe("invoice money paths", () => {
  let api: Api;
  let contactId: string;

  const invoiceState = (id: string) =>
    db().invoice.findUniqueOrThrow({
      where: { id },
      select: { status: true, paidAt: true },
    });

  test.beforeAll(async () => {
    api = Api.forOwnerA();
    contactId = (await createContact(api, "Invoice")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("server computes totals: line items + percent discount + tax", async () => {
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E math check",
      taxRate: 0.0825,
      discountType: "PERCENT",
      discountValue: 10,
      lineItems: [
        { description: "Mow", quantity: 2, unitPrice: 45 },
        { description: "Edge", quantity: 1, unitPrice: 30.5 },
      ],
    });
    // subtotal 120.50, 10% discount 12.05, tax 8.25% of 108.45 = 8.95
    expect(Number(invoice.subtotal)).toBeCloseTo(120.5, 2);
    expect(Number(invoice.discount)).toBeCloseTo(12.05, 2);
    expect(Number(invoice.tax)).toBeCloseTo(8.95, 2);
    expect(Number(invoice.total)).toBeCloseTo(117.4, 2);
    expect(invoice.status).toBe("DRAFT");

    await api.delete(`/api/app/invoices/${invoice.id}`);
  });

  test("partial → full payment flips status exactly at the balance", async () => {
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E payment lifecycle",
      lineItems: [{ description: "Service call", quantity: 1, unitPrice: 200 }],
    });

    // Partial payment: not fully paid, DRAFT promoted to AWAITING_PAYMENT.
    const p1 = await api.post("/api/app/payments", {
      invoiceId: invoice.id,
      amount: 80,
      method: "CHECK",
    });
    expect(p1.fullyPaid).toBe(false);
    expect((await invoiceState(invoice.id)).status).toBe("AWAITING_PAYMENT");

    // One cent short must NOT mark it paid.
    const p2 = await api.post("/api/app/payments", {
      invoiceId: invoice.id,
      amount: 119.99,
      method: "CASH",
    });
    expect(p2.fullyPaid).toBe(false);

    // The final cent flips it.
    const p3 = await api.post("/api/app/payments", {
      invoiceId: invoice.id,
      amount: 0.01,
      method: "CASH",
    });
    expect(p3.fullyPaid).toBe(true);
    let state = await invoiceState(invoice.id);
    expect(state.status).toBe("PAID");
    expect(state.paidAt).toBeTruthy();

    // Deleting a payment reopens the invoice.
    await api.delete(`/api/app/payments/${p3.payment.id}`);
    state = await invoiceState(invoice.id);
    expect(["AWAITING_PAYMENT", "PAST_DUE"]).toContain(state.status);
    expect(state.paidAt).toBeNull();

    // Shrinking a payment keeps the math honest.
    await api.patch(`/api/app/payments/${p2.payment.id}`, { amount: 20 });
    expect((await invoiceState(invoice.id)).status).not.toBe("PAID");

    await api.delete(`/api/app/invoices/${invoice.id}?force=1`);
  });

  test("guards: zero/negative payments and empty invoices are rejected", async () => {
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      lineItems: [{ description: "Guard check", quantity: 1, unitPrice: 50 }],
    });
    await api.post(
      "/api/app/payments",
      { invoiceId: invoice.id, amount: 0, method: "CASH" },
      400
    );
    await api.post(
      "/api/app/payments",
      { invoiceId: invoice.id, amount: -5, method: "CASH" },
      400
    );
    await api.post("/api/app/invoices", { contactId, lineItems: [] }, 400);
    await api.delete(`/api/app/invoices/${invoice.id}`);
  });

  test("guards: overpayment, and payments on paid or archived invoices, are rejected", async () => {
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      lineItems: [{ description: "Overpay check", quantity: 1, unitPrice: 50 }],
    });
    // More than the balance never silently flips the invoice to PAID.
    await api.post("/api/app/payments", { invoiceId: invoice.id, amount: 60, method: "CASH" }, 400);
    await api.post("/api/app/payments", { invoiceId: invoice.id, amount: 20, method: "CASH" });
    await api.post("/api/app/payments", { invoiceId: invoice.id, amount: 30.01, method: "CASH" }, 400);
    const p = await api.post("/api/app/payments", { invoiceId: invoice.id, amount: 30, method: "CASH" });
    expect(p.fullyPaid).toBe(true);
    // Settled: nothing more can be recorded against it.
    await api.post("/api/app/payments", { invoiceId: invoice.id, amount: 1, method: "CASH" }, 400);

    const shelved = await api.post("/api/app/invoices", {
      contactId,
      lineItems: [{ description: "Archived check", quantity: 1, unitPrice: 50 }],
    });
    await api.patch(`/api/app/invoices/${shelved.id}/status`, { status: "ARCHIVED" });
    await api.post("/api/app/payments", { invoiceId: shelved.id, amount: 10, method: "CASH" }, 400);

    await api.delete(`/api/app/invoices/${invoice.id}?force=1`);
    await api.delete(`/api/app/invoices/${shelved.id}?force=1`);
  });

  test("a partially paid deposit is credited on the final invoice and the deposit invoice retired", async () => {
    // $400 quote with a $100 fixed deposit, approved by the client → the
    // deposit invoice is minted automatically.
    const quote = await api.post("/api/app/quotes", {
      contactId,
      title: "E2E deposit credit",
      depositType: "FIXED",
      depositValue: 100,
      lineItems: [{ description: "Fence repair", quantity: 1, unitPrice: 400 }],
    });
    await api.patch(`/api/app/quotes/${quote.id}`, { status: "AWAITING_RESPONSE" });
    await api.json(
      "POST",
      `/api/public/quote/${quote.publicToken}`,
      { action: "approve", signatureName: `${runTag} Invoice`, optedOutItemIds: [] },
      200
    );
    const deposit = await db().invoice.findFirstOrThrow({
      where: { quoteId: quote.id, kind: "DEPOSIT" },
      select: { id: true, total: true, status: true },
    });
    expect(Number(deposit.total)).toBeCloseTo(100, 2);

    // The client pays only part of the deposit.
    await api.post("/api/app/payments", { invoiceId: deposit.id, amount: 40, method: "CHECK" });
    expect((await invoiceState(deposit.id)).status).not.toBe("PAID");

    // Work done, final invoice for the job: the $40 is credited, the deposit
    // invoice is shelved so the client isn't dunned for the other $60 twice.
    const job = await api.post(`/api/app/quotes/${quote.id}/convert`);
    const final = await api.post("/api/app/invoices", {
      contactId,
      jobId: job.id,
      lineItems: [{ description: "Fence repair", quantity: 1, unitPrice: 400 }],
    });
    expect(Number(final.depositApplied)).toBeCloseTo(40, 2);
    expect(Number(final.total)).toBeCloseTo(360, 2);
    expect((await invoiceState(deposit.id)).status).toBe("ARCHIVED");

    await api.delete(`/api/app/invoices/${final.id}?force=1`);
    await api.delete(`/api/app/invoices/${deposit.id}?force=1`);
    await api.delete(`/api/app/jobs/${job.id}`);
    await api.delete(`/api/app/quotes/${quote.id}`);
  });
});
