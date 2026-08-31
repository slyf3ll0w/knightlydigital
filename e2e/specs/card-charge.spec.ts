// REAL card charges through the deployed /pay page — Finix SANDBOX only.
// Covers: successful charge + surcharge math + save-card, amount-triggered
// decline leaving the invoice untouched, and autopay (charge at plan signup,
// decline → retry state). global-setup only enables this file when the
// deployment's processor is finix in sandbox mode with an APPROVED merchant.
import { test, expect, type Page } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();
test.skip(!state.cardTestsEnabled, "Finix sandbox not available — card specs skipped");

// Finix sandbox: any valid-luhn PAN succeeds; outcomes are amount-triggered
// (…$X.02 declines). 4111… is the canonical sandbox Visa.
const CARD = { number: "4111111111111111", exp: "12 / 29", cvv: "123", zip: "75201" };

async function fillFinixForm(page: Page): Promise<void> {
  // finix.js renders each field as a hosted-field iframe. Fill every text
  // input across those frames by placeholder/name heuristics.
  await page.waitForSelector("iframe", { timeout: 20_000 });
  for (const frame of page.frames()) {
    for (const input of await frame.locator("input").all()) {
      const hint = `${await input.getAttribute("placeholder")} ${await input.getAttribute("name")} ${await input.getAttribute("id")} ${await input.getAttribute("aria-label")}`.toLowerCase();
      if (/card|number|pan/.test(hint) && !/exp|cvv|cvc|sec/.test(hint)) {
        await input.fill(CARD.number);
      } else if (/exp/.test(hint)) {
        await input.fill(CARD.exp);
      } else if (/cvv|cvc|security/.test(hint)) {
        await input.fill(CARD.cvv);
      } else if (/zip|postal/.test(hint)) {
        await input.fill(CARD.zip);
      }
    }
  }
}

async function payInBrowser(page: Page, payUrl: string, opts: { saveCard?: boolean } = {}) {
  await page.goto(payUrl);
  await fillFinixForm(page);
  if (opts.saveCard) {
    await page.locator('input[type="checkbox"]').first().check();
  }
  await page.getByRole("button", { name: /pay/i }).last().click();
}

test.describe("card charges (Finix sandbox)", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    contactId = (await createContact(api, "Card")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("successful charge: surcharge collected, invoice PAID, card vaulted", async ({ page }) => {
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E card success",
      lineItems: [{ description: "Card charge check", quantity: 1, unitPrice: 100 }],
    });

    await payInBrowser(page, `${state.baseUrl}/pay/${invoice.publicToken}`, { saveCard: true });
    // The done state replaces the form — wait for the API-recorded payment.
    await expect
      .poll(
        async () =>
          (await api.get(`/api/app/invoices/${invoice.id}`)).status,
        { timeout: 30_000 }
      )
      .toBe("PAID");

    const payment = await db().payment.findFirst({
      where: { invoiceId: invoice.id },
    });
    expect(payment).toBeTruthy();
    expect(payment!.processorRef).toMatch(/^TR/);
    // Company A surcharges 3%: the client paid 103.00 total, 3.00 of it surcharge.
    expect(Number(payment!.surchargeAmount)).toBeCloseTo(3, 2);
    expect(Number(payment!.amount)).toBeCloseTo(103, 2);

    // Save-card vaulted a default card and mirrored it onto the contact.
    const card = await db().savedCard.findFirst({
      where: { contactId, isDefault: true },
    });
    expect(card).toBeTruthy();
    const contact = await db().contact.findUnique({ where: { id: contactId } });
    expect(contact!.processorCustomerRef).toBe(card!.instrumentRef);
  });

  test("decline leaves the invoice untouched", async ({ page }) => {
    // Sandbox amount-trigger: a charge totalling $x.02 declines. With the 3%
    // surcharge, unitPrice 0.99 → charge 1.02.
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E card decline",
      lineItems: [{ description: "Decline check", quantity: 1, unitPrice: 0.99 }],
    });

    await payInBrowser(page, `${state.baseUrl}/pay/${invoice.publicToken}`);
    // Error surfaces on the page; the invoice must not move.
    await page.waitForTimeout(8_000);
    const after = await api.get(`/api/app/invoices/${invoice.id}`);
    expect(after.status).not.toBe("PAID");
    expect(await db().payment.count({ where: { invoiceId: invoice.id } })).toBe(0);

    await api.delete(`/api/app/invoices/${invoice.id}`);
  });

  test("autopay: plan charges the saved card at signup and anchors", async () => {
    const sub = await api.post("/api/app/subscriptions", {
      name: "E2E autopay plan",
      contactId,
      interval: "MONTHLY",
      unitPrice: 12.34,
      invoiceMode: "SEND", // contact has no email — auto-charge runs, nothing sends
    });
    expect(sub.firstBill).toBe("charged");

    const invoice = await db().invoice.findFirst({
      where: { subscriptionId: sub.id },
    });
    expect(invoice!.status).toBe("PAID");
    const dbSub = await db().subscription.findUnique({ where: { id: sub.id } });
    expect(dbSub!.anchoredAt).not.toBeNull();
  });

  test("autopay decline schedules the +1d retry", async () => {
    // Autopay charges the bare balance (no surcharge) — $1.02 is the sandbox
    // decline trigger.
    const sub = await api.post("/api/app/subscriptions", {
      name: "E2E autopay decline",
      contactId,
      interval: "MONTHLY",
      unitPrice: 1.02,
      invoiceMode: "SEND",
    });
    expect(sub.firstBill).not.toBe("charged");

    const invoice = await db().invoice.findFirst({
      where: { subscriptionId: sub.id },
    });
    expect(invoice).toBeTruthy();
    expect(invoice!.status).not.toBe("PAID");
    expect(invoice!.autoChargeAttempts).toBeGreaterThanOrEqual(1);
    expect(invoice!.autoChargeNextAt).not.toBeNull();
    const hoursOut =
      (invoice!.autoChargeNextAt!.getTime() - Date.now()) / 3600_000;
    expect(hoursOut).toBeGreaterThan(12);
    expect(hoursOut).toBeLessThan(36);
  });
});
