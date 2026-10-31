// The online store, lane 1 (docs/plans/online-store-2026-10-31.md): a
// product marked Sell online is on the shop page with a buy page of its
// own; a scripted order is refused by the captcha like every public POST;
// a client ordering from their hub (hub token = the auth) gets a
// STORE_ORDER invoice on their record, due today, that pays like any other.
import { test, expect } from "@playwright/test";
import { COMPANY_A_SLUG, readState } from "../env";
import { Api, createContact, deleteContact } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();

test.describe("online store (lane 1)", () => {
  test.describe.configure({ mode: "serial" });
  const api = Api.forOwnerA(state);
  const slug = state.companyASlug || COMPANY_A_SLUG;
  let itemId = "";
  let contactId = "";
  let hubToken = "";
  let invoiceId = "";

  test.beforeAll(async () => {
    const contact = await createContact(api, "store");
    contactId = contact.id;
    const row = await db().contact.findUnique({ where: { id: contactId }, select: { hubToken: true } });
    hubToken = row?.hubToken ?? "";
    expect(hubToken).toBeTruthy();
  });

  test.afterAll(async () => {
    if (itemId) await api.raw("DELETE", `/api/app/work-items/${itemId}`).catch(() => {});
    if (contactId) await deleteContact(api, contactId).catch(() => {});
    await disconnectDb();
  });

  test("a product marked Sell online is on the shop page with a buy page", async ({ page }) => {
    const item = await api.post("/api/app/work-items", { name: "E2E Air filter", type: "PRODUCT", unitPrice: 19.5, description: "16×25×1, MERV 11", sellOnline: true });
    itemId = item.id;
    expect(item.sellOnline).toBe(true);

    // A service can't be sold online, whatever the body says
    const svc = await api.post("/api/app/work-items", { name: "E2E Not for sale", type: "SERVICE", unitPrice: 50, sellOnline: true });
    expect(svc.sellOnline).toBe(false);
    await api.raw("DELETE", `/api/app/work-items/${svc.id}`);

    await page.goto(`/book/${slug}/shop`);
    await expect(page.getByText("E2E Air filter")).toBeVisible();
    await page.getByText("E2E Air filter").click();
    await expect(page).toHaveURL(new RegExp(`/book/${slug}/shop/${itemId}$`));
    await expect(page.getByRole("button", { name: /Continue to payment/ })).toBeVisible();
    // The business page shows the Shop door
    await page.goto(`/book/${slug}`);
    await expect(page.getByRole("link", { name: /^Shop/ })).toBeVisible();
  });

  test("a scripted order without a real captcha token is refused", async () => {
    const res = await api.raw("POST", `/api/public/store/${slug}`, {
      itemId,
      quantity: 1,
      firstName: "Script",
      lastName: "Bot",
      email: "bot@example.com",
      captchaToken: "e2e-bogus-token",
      elapsedMs: 9000,
    });
    expect(res.status, "TURNSTILE keys must both be set on this deployment for the captcha gate to hold").toBe(400);
    expect(String((await res.json()).error)).toMatch(/captcha/i);
  });

  test("a client ordering from their hub gets an Order invoice that pays like any other", async ({ page }) => {
    const res = await api.raw("POST", `/api/public/store/${slug}`, { itemId, quantity: 2, hubToken, email: "e2e-store-buyer@example.com", note: "Leave it by the door", elapsedMs: 9000 });
    const text = await res.text();
    expect(res.status, text).toBe(201);
    const data = JSON.parse(text);
    expect(data.payUrl).toMatch(/^\/pay\//);
    invoiceId = data.invoiceId;

    const invoice = await db().invoice.findUnique({ where: { id: invoiceId }, include: { lineItems: true } });
    expect(invoice?.kind).toBe("STORE_ORDER");
    expect(invoice?.status).toBe("AWAITING_PAYMENT");
    expect(invoice?.contactId).toBe(contactId);
    expect(invoice?.subject).toBe("Order · 2 × E2E Air filter");
    expect(Number(invoice?.subtotal)).toBeCloseTo(39, 2);
    expect(invoice?.lineItems).toHaveLength(1);
    expect(Number(invoice?.lineItems[0].quantity)).toBe(2);
    expect(invoice?.lineItems[0].workItemId).toBe(itemId);
    expect(invoice?.clientMessage).toBe("Leave it by the door");

    // The pay page calls it an Order
    await page.goto(data.payUrl);
    await expect(page.getByText("Order", { exact: true }).first()).toBeVisible();

    // Any payment settles it — cash here, the card path is covered by square-charge
    const pay = await api.raw("POST", "/api/app/payments", { invoiceId, amount: Number(invoice!.total), method: "CASH" });
    expect(pay.ok, `record payment → ${pay.status}`).toBe(true);
    const paid = await db().invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
    expect(paid?.status).toBe("PAID");

    // A quantity past the cap is refused up front
    const tooMany = await api.raw("POST", `/api/public/store/${slug}`, { itemId, quantity: 21, hubToken, elapsedMs: 9000 });
    expect(tooMany.status).toBe(400);
  });
});
