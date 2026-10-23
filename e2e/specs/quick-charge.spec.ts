// Quick charge ("Request payment"): one amount, one line, no invoice editor.
// Covers the API the form and Atlas share (invoice + pay link + QR), the
// invoice it leaves behind, the public pay page header, the guard rails, and
// the form itself in a signed-in browser. Nothing here charges a card — that is
// square-charge.spec.ts; a quick charge is just a QUICK_CHARGE invoice.
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();
const ROUTE = "/api/app/invoices/quick-charge";

test.describe("quick charge (payment request)", () => {
  let api: Api;
  let contactId: string;
  /** Client-less requests have no contact to force-delete through. */
  const loose: string[] = [];

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    contactId = (await createContact(api, "QuickCharge")).id;
  });

  test.afterAll(async () => {
    for (const id of loose) {
      const res = await api.raw("DELETE", `/api/app/invoices/${id}`);
      if (!res.ok) console.warn(`[e2e] cleanup: delete invoice ${id} → ${res.status}`);
    }
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("API: a request for a client → QUICK_CHARGE invoice, pay link, QR; the pay page says Payment request", async ({ page }) => {
    const r = await api.json("POST", ROUTE, { amount: 42.5, description: `${runTag} filter swap`, contactId, taxRate: 0.08 }, 200);
    expect(r.invoice.total).toBe(45.9); // 42.50 + 8% tax
    expect(r.invoice.invoiceNumber).toBeGreaterThan(0);
    expect(r.payUrl).toContain(`/pay/${r.invoice.publicToken}`);
    expect(r.qrSvg).toContain("<svg");
    expect(r.contact?.id).toBe(contactId);

    const row = await db().invoice.findUnique({ where: { id: r.invoice.id }, select: { kind: true, status: true, total: true, contactId: true } });
    expect(row?.kind).toBe("QUICK_CHARGE");
    expect(row?.contactId).toBe(contactId);
    expect(Number(row?.total)).toBe(45.9);
    expect(row?.status).not.toBe("PAID");

    await page.goto(r.payUrl);
    await expect(page.getByText("Payment request").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("$45.90").first()).toBeVisible();
  });

  test("API: no client → link only; amount and wording guard rails", async () => {
    const r = await api.json("POST", ROUTE, { amount: 1, description: `${runTag} walk-in` }, 200);
    loose.push(r.invoice.id);
    expect(r.contact).toBeNull();
    expect(r.invoice.total).toBe(1);

    const tooSmall = await api.json("POST", ROUTE, { amount: 0.5, description: "x" }, 400);
    expect(String(tooSmall.error)).toMatch(/at least \$1\.00/);
    const tooBig = await api.json("POST", ROUTE, { amount: 30_000, description: "x" }, 400);
    expect(String(tooBig.error)).toMatch(/top out/);
    const noWords = await api.json("POST", ROUTE, { amount: 10, description: "   " }, 400);
    expect(String(noWords.error)).toMatch(/what the payment is for/);
    await api.json("POST", ROUTE, { amount: 10, description: "x", contactId: "nope" }, 404);
  });

  test("form: amount + what for → Get link → share step with the pay link and Open invoice", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
    ]);
    const page = await context.newPage();
    try {
      await page.goto(`${state.baseUrl}/app/invoices/request`);
      const getLink = page.getByRole("button", { name: "Get link" });
      await expect(getLink).toBeDisabled();
      await page.getByPlaceholder("0.00").fill("12.34");
      await page.getByPlaceholder(/Filter swap/).fill(`${runTag} from the form`);
      await expect(getLink).toBeEnabled();
      await getLink.click();

      await expect(page.getByText("Pay link", { exact: true })).toBeVisible({ timeout: 20_000 });
      const link = await page.locator("input[readonly]").first().inputValue();
      expect(link).toMatch(/\/pay\/[A-Za-z0-9_-]+$/);
      await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
      // No client on this request → nobody to text or email.
      await expect(page.getByRole("button", { name: "Text it" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Email it" })).toBeDisabled();

      const href = await page.getByRole("link", { name: "Open invoice" }).getAttribute("href");
      const id = href?.split("/").pop();
      expect(id).toBeTruthy();
      loose.push(id!);
      const row = await db().invoice.findUnique({ where: { id: id! }, select: { kind: true, total: true } });
      expect(row?.kind).toBe("QUICK_CHARGE");
      expect(Number(row?.total)).toBe(12.34);
    } finally {
      await context.close();
    }
  });
});
