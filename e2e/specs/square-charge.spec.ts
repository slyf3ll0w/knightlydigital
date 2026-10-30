// REAL card charges through the deployed /pay page — Square SANDBOX only.
// Covers: successful charge + surcharge math + card on file, a declined card
// leaving the invoice untouched, and autopay charging the saved card at plan
// signup. global-setup only enables this file when the deployment's processor
// is square in sandbox mode and company A is connected to the sandbox test
// seller (seeded by e2e/provision.mts from SQUARE_E2E_ACCESS_TOKEN).
import { test, expect, type Page } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();
test.skip(!state.squareCardTestsEnabled, "Square sandbox not available — Square card specs skipped");

// Square sandbox test values (developer.squareup.com/docs/devtools/sandbox/payments):
// 4111… succeeds with any future expiry and CVV 111; 4000 0000 0000 0002 is
// "card declined"; USD payments need a postal code.
const CARD = { number: "4111111111111111", exp: "1229", cvv: "111", zip: "75201" };
const DECLINED_CARD = "4000000000000002";

/** The Web Payments SDK renders one hosted iframe into our .wb-square-card
 *  container. Its inputs are Square's; ids first, placeholders as fallback. */
function squareField(page: Page, id: string, placeholder: string) {
  const frame = page.frameLocator(".wb-square-card iframe").first();
  return frame
    .locator(`#${id}, input[name="${id}"], input[placeholder="${placeholder}"], input[aria-label="${placeholder}"]`)
    .first();
}

/** When the field lookup misses, print what Square's frames actually contain
 *  so the failing run says which selector to fix. */
async function dumpSquareFrames(page: Page): Promise<void> {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const inputs = await frame.$$eval("input", (els) =>
        els.map((e) => ({
          id: e.id,
          name: e.getAttribute("name"),
          placeholder: e.getAttribute("placeholder"),
          aria: e.getAttribute("aria-label"),
          type: e.getAttribute("type"),
        }))
      );
      console.log(`[e2e] frame ${frame.url()} inputs: ${JSON.stringify(inputs)}`);
    } catch (err) {
      console.log(`[e2e] frame ${frame.url()} unreadable: ${(err as Error).message}`);
    }
  }
}

async function fillSquareCard(page: Page, number: string): Promise<void> {
  await page.locator(".wb-square-card iframe").first().waitFor({ timeout: 30_000 });
  const cardNumber = squareField(page, "cardNumber", "Card number");
  try {
    await cardNumber.waitFor({ timeout: 20_000 });
  } catch (err) {
    await dumpSquareFrames(page);
    throw err;
  }
  // Masked inputs: type digit-by-digit so the mask formats them itself. Each
  // field is clicked first — Square's frame moves focus on its own as a mask
  // completes, and keystrokes sent during that hop were lost (2026-10-28: the
  // ZIP stayed empty, "Postal code is not valid", the charge never ran).
  await cardNumber.click();
  await cardNumber.pressSequentially(number, { delay: 25 });
  for (const [id, placeholder, value] of [
    ["expirationDate", "MM/YY", CARD.exp],
    ["cvv", "CVV", CARD.cvv],
    ["postalCode", "ZIP", CARD.zip],
  ] as const) {
    const field = squareField(page, id, placeholder);
    await field.click();
    await field.pressSequentially(value, { delay: 25 });
    await expect(field).toHaveValue(new RegExp(value.slice(-2)), { timeout: 5_000 }).catch(async () => {
      // Typed into a stale focus target: once more, after a settle.
      await page.waitForTimeout(300);
      await field.click();
      await field.fill("");
      await field.pressSequentially(value, { delay: 40 });
    });
  }
}

async function payInBrowser(page: Page, payUrl: string, opts: { number?: string; saveCard?: boolean } = {}) {
  await page.goto(payUrl);
  await fillSquareCard(page, opts.number ?? CARD.number);
  if (opts.saveCard) {
    await page.locator('input[type="checkbox"]').first().check();
  }
  const payButton = page.getByRole("button", { name: /^pay \$/i });
  await expect(payButton).toBeEnabled({ timeout: 15_000 });
  // Same as the Finix spec: a DOM-dispatched click drives the identical
  // handler chain and isn't swallowed under browser automation.
  await payButton.evaluate((el: HTMLElement) => el.click());
}

test.describe("card charges (Square sandbox)", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    contactId = (await createContact(api, "SquareCard")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("successful charge: surcharge collected, invoice PAID, card on file", async ({ page }) => {
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E Square card success",
      lineItems: [{ description: "Card charge check", quantity: 1, unitPrice: 100 }],
    });

    await payInBrowser(page, `${state.baseUrl}/pay/${invoice.publicToken}`, { saveCard: true });
    // The done state replaces the form — wait for the recorded payment to land.
    await expect
      .poll(
        async () =>
          (await db().invoice.findUniqueOrThrow({
            where: { id: invoice.id },
            select: { status: true },
          })).status,
        { timeout: 45_000 }
      )
      .toBe("PAID");

    const payment = await db().payment.findFirst({ where: { invoiceId: invoice.id } });
    expect(payment).toBeTruthy();
    // processorRef is the Square payment id — never a Finix TR… transfer.
    expect(payment!.processorRef).toBeTruthy();
    expect(payment!.processorRef).not.toMatch(/^TR/);
    // Company A surcharges 3%: the client paid 103.00 total, 3.00 of it surcharge.
    expect(Number(payment!.surchargeAmount)).toBeCloseTo(3, 2);
    expect(Number(payment!.amount)).toBeCloseTo(103, 2);

    // Card on file: a Square card (ccof:…) under the contact's Square customer.
    const card = await db().savedCard.findFirst({ where: { contactId, isDefault: true } });
    expect(card).toBeTruthy();
    expect(card!.instrumentRef).toMatch(/^ccof:/);
    const contact = await db().contact.findUnique({ where: { id: contactId } });
    expect(contact!.squareCustomerId).toBeTruthy();
  });

  test("declined card leaves the invoice untouched", async ({ page }) => {
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      subject: "E2E Square card decline",
      lineItems: [{ description: "Decline check", quantity: 1, unitPrice: 10 }],
    });

    await payInBrowser(page, `${state.baseUrl}/pay/${invoice.publicToken}`, { number: DECLINED_CARD });
    // The decline wording surfaces on the page (lib/square.ts declineMessage);
    // the invoice must not move.
    await expect(page.getByText(/declined|check (them|it) and try again/i).first()).toBeVisible({ timeout: 30_000 });
    const after = await db().invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { status: true },
    });
    expect(after.status).not.toBe("PAID");
    expect(await db().payment.count({ where: { invoiceId: invoice.id } })).toBe(0);

    await api.delete(`/api/app/invoices/${invoice.id}`);
  });

  test("autopay: plan charges the card on file at signup and anchors", async () => {
    const sub = await api.post("/api/app/subscriptions", {
      name: "E2E Square autopay plan",
      contactId,
      interval: "MONTHLY",
      unitPrice: 12.34,
      invoiceMode: "SEND", // contact has no email — auto-charge runs, nothing sends
    });
    expect(sub.firstBill).toBe("charged");

    const invoice = await db().invoice.findFirst({ where: { subscriptionId: sub.id }, include: { payments: true } });
    expect(invoice!.status).toBe("PAID");
    const dbSub = await db().subscription.findUnique({ where: { id: sub.id } });
    expect(dbSub!.anchoredAt).not.toBeNull();
    // Company A's 3% service fee rides the card-on-file charge too (2026-10-30):
    // $12.34 principal + $0.37 surcharge = $12.71 on the card, itemized.
    expect(invoice!.payments).toHaveLength(1);
    expect(Number(invoice!.payments[0].amount)).toBeCloseTo(12.71, 2);
    expect(Number(invoice!.payments[0].surchargeAmount)).toBeCloseTo(0.37, 2);
    expect(Number(invoice!.surcharge)).toBeCloseTo(0.37, 2);
  });
});
