// Square gift cards through the deployed app — Square SANDBOX only
// (docs/plans/square-products-2026-10-30.md). Sell a gift card (a PENDING
// Square card + an invoice), pay the invoice, watch the card ACTIVATE with the
// amount, check its balance, redeem it on a second invoice from the staff
// route and on a third from the public pay page. global-setup enables this
// file only when company A is
// connected to the sandbox test seller.
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();
test.skip(!state.squareCardTestsEnabled, "Square sandbox not available — Square gift card specs skipped");

test.describe("square gift cards (sandbox)", () => {
  test.describe.configure({ mode: "serial" });
  const api = Api.forOwnerA(state);
  let contactId = "";
  let gan = "";
  let saleInvoiceId = "";

  test.beforeAll(async () => {
    contactId = (await createContact(api, "gift")).id;
  });
  test.afterAll(async () => {
    // Force-delete takes the invoices and payments with it; the Square-side
    // card and its activities stay (sandbox).
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("sell: a pending Square card and an invoice; paying the invoice loads the card", async () => {
    const sale = await api.post("/api/app/payments/square/gift-cards", {
      amountCents: 2500,
      contactId,
      recipientName: "E2E Recipient",
      recipientEmail: "e2e-gift-recipient@example.com",
      message: "Enjoy",
    });
    expect(sale.giftCardId).toBeTruthy();
    expect(sale.gan).toMatch(/^\d{10,20}$/);
    expect(sale.payUrl).toContain(`/pay/${sale.publicToken}`);
    gan = sale.gan;
    saleInvoiceId = sale.invoiceId;

    // Not loaded until it is paid
    const before = await api.get(`/api/app/payments/square/gift-cards/lookup?gan=${gan}`);
    expect(before.giftCard.state).toBe("PENDING");
    expect(before.giftCard.balanceCents).toBe(0);

    // The tab lists it as waiting
    const list = await api.get("/api/app/payments/square/gift-cards");
    expect(list.sales.some((s: { invoiceId: string; state: string }) => s.invoiceId === saleInvoiceId && s.state === "PENDING")).toBe(true);

    // Pay the invoice in cash (any payment counts) → the hook activates the card
    const pay = await api.raw("POST", "/api/app/payments", { invoiceId: saleInvoiceId, amount: 25, method: "CASH" });
    expect(pay.ok, `record payment → ${pay.status}`).toBe(true);

    let row = await db().giftCardSale.findUnique({ where: { invoiceId: saleInvoiceId } });
    for (let i = 0; i < 20 && row?.state !== "ACTIVE"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      row = await db().giftCardSale.findUnique({ where: { invoiceId: saleInvoiceId } });
    }
    expect(row?.state, row?.lastError ?? "").toBe("ACTIVE");
    expect(row?.activatedAt).not.toBeNull();

    const after = await api.get(`/api/app/payments/square/gift-cards/lookup?gan=${gan}`);
    expect(after.giftCard.state).toBe("ACTIVE");
    expect(after.giftCard.balanceCents).toBe(2500);

    // Its history shows the load
    const detail = await api.get(`/api/app/payments/square/gift-cards/${sale.giftCardId}`);
    expect(detail.giftCard.balanceCents).toBe(2500);
    expect(detail.activities.some((a: { type: string; deltaCents: number }) => a.type === "ACTIVATE" && a.deltaCents === 2500)).toBe(true);
  });

  test("redeem: staff take $10 of the card on an invoice; the payment is GIFT_CARD with a Square reference", async () => {
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E gift card redeem (staff)",
      lineItems: [{ description: "Redeem check", quantity: 1, unitPrice: 10 }],
    });
    const r = await api.json("POST", `/api/app/invoices/${invoice.id}/gift-card`, { gan });
    expect(r.success).toBe(true);
    expect(r.amount).toBeCloseTo(10, 2);
    expect(r.fullyPaid).toBe(true);
    expect(r.cardBalanceCents).toBe(1500);

    const paid = await db().invoice.findUnique({ where: { id: invoice.id }, include: { payments: true } });
    expect(paid!.status).toBe("PAID");
    expect(paid!.payments).toHaveLength(1);
    expect(paid!.payments[0].method).toBe("GIFT_CARD");
    expect(paid!.payments[0].processorRef).toBeTruthy();
    expect(Number(paid!.payments[0].surchargeAmount ?? 0)).toBe(0);

    const balance = await api.get(`/api/app/payments/square/gift-cards/lookup?gan=${gan}`);
    expect(balance.giftCard.balanceCents).toBe(1500);
  });

  test("redeem: the client pays from the pay page with the card; a card that runs short pays what it holds", async () => {
    // $5 invoice — the card (now $15) covers it
    const small = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E gift card redeem (pay page)",
      lineItems: [{ description: "Pay page check", quantity: 1, unitPrice: 5 }],
    });
    const res = await fetch(`${state.baseUrl}/api/public/pay/${small.publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GIFT_CARD", gan: `${gan.slice(0, 4)} ${gan.slice(4)}` }),
    });
    const data = await res.json();
    expect(res.status, JSON.stringify(data)).toBe(200);
    expect(data.success).toBe(true);
    expect(data.paid).toBeCloseTo(5, 2);
    expect(data.remaining).toBe(0);
    expect(data.cardBalance).toBeCloseTo(10, 2);

    // $40 invoice — the card has $10 left: it pays $10 and $30 stays owed
    const big = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E gift card partial",
      lineItems: [{ description: "Partial check", quantity: 1, unitPrice: 40 }],
    });
    const res2 = await fetch(`${state.baseUrl}/api/public/pay/${big.publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GIFT_CARD", gan }),
    });
    const data2 = await res2.json();
    expect(res2.status, JSON.stringify(data2)).toBe(200);
    expect(data2.paid).toBeCloseTo(10, 2);
    expect(data2.remaining).toBeCloseTo(30, 2);
    const open = await db().invoice.findUnique({ where: { id: big.id } });
    expect(open!.status).not.toBe("PAID");

    // Empty now → refused, nothing recorded
    const res3 = await fetch(`${state.baseUrl}/api/public/pay/${big.publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GIFT_CARD", gan }),
    });
    expect(res3.status).toBe(402);
    const data3 = await res3.json();
    expect(data3.code).toBe("NO_BALANCE");
  });

  test("a wrong number and a bad amount are refused", async () => {
    const miss = await api.raw("GET", `/api/app/payments/square/gift-cards/lookup?gan=1234567890123456`);
    expect(miss.status).toBe(404);
    const short = await api.raw("POST", "/api/app/payments/square/gift-cards", { amountCents: 100, recipientEmail: "x@example.com" });
    expect(short.status).toBe(400);
    const noEmail = await api.raw("POST", "/api/app/payments/square/gift-cards", { amountCents: 2500 });
    expect(noEmail.status).toBe(400);
  });
});
