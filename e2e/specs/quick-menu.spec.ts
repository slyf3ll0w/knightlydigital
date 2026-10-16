// Quick-action menus on list rows (components/QuickMenu.tsx): right-click on
// a desk, press-and-hold on a phone, then a destructive verb that asks first.
// The phone path is the one that broke (2026-10-12): the row swallowed the
// first tap in the sheet because no click follows a long press on a phone,
// so "Delete" did nothing and the sheet just sat there.
import { test, expect, type Browser } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();

async function signedIn(browser: Browser, phone: boolean) {
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 1400, height: 900 } }
  );
  await context.addCookies([
    { name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
  ]);
  return { context, page: await context.newPage() };
}

test.describe("quick-action menus", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    contactId = (await createContact(api, "QuickMenu")).id;
  });
  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("desk: right-click a job row → Delete → confirm deletes it", async ({ browser }) => {
    const job = await api.post("/api/app/jobs", { contactId, title: `${runTag} right-click job` });
    const { context, page } = await signedIn(browser, false);
    await page.goto(`${state.baseUrl}/app/jobs`);
    const row = page.locator(`a[href="/app/jobs/${job.id}"]`).first();
    await expect(row).toBeVisible();
    await row.click({ button: "right" });

    const menu = page.locator('[role="menu"]:visible');
    await expect(menu).toHaveCount(1);
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();

    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toContainText("Permanently delete this job?");
    const gone = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().endsWith(`/api/app/jobs/${job.id}`));
    await dialog.locator("button:visible", { hasText: "Delete job" }).click();
    expect((await gone).status()).toBe(200);
    await expect(page.locator(`a[href="/app/jobs/${job.id}"]`)).toHaveCount(0);
    expect(await db().job.findUnique({ where: { id: job.id } })).toBeNull();
    await context.close();
  });

  test("phone: press-and-hold a job row → Delete → confirm deletes it", async ({ browser }) => {
    const job = await api.post("/api/app/jobs", { contactId, title: `${runTag} held job` });
    const { context, page } = await signedIn(browser, true);
    await page.goto(`${state.baseUrl}/app/jobs`);
    const row = page.locator(`a[href="/app/jobs/${job.id}"]`).first();
    await expect(row).toBeVisible();
    // The list can re-render once more right after first paint (live
    // refresh), detaching the node mid-scroll — resolve the row fresh each
    // try instead of holding one element across the re-render.
    let box: { x: number; y: number; width: number; height: number } | null = null;
    for (let i = 0; i < 20 && !box; i++) {
      await row.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
      box = await row.boundingBox().catch(() => null);
      if (!box) await page.waitForTimeout(250);
    }
    if (!box) throw new Error("job row never settled on the page");
    const at: [number, number] = [box.x + box.width / 2, box.y + box.height / 2];

    // A real long press: touchstart, hold past the threshold, touchend — and,
    // as on a phone, NO click afterwards. React reads e.touches[0], so these
    // must be genuine Touch objects.
    await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)!;
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      (window as unknown as { __held: Element }).__held = el;
    }, at);
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const el = (window as unknown as { __held: Element }).__held;
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [] }));
    });

    const sheet = page.locator('[role="dialog"]:visible');
    await expect(sheet).toHaveCount(1);
    // The first tap in the sheet must count.
    await sheet.getByRole("button", { name: /^Delete$/ }).tap();

    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toContainText("Permanently delete this job?");
    const gone = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().endsWith(`/api/app/jobs/${job.id}`));
    await dialog.locator("button:visible", { hasText: "Delete job" }).tap();
    expect((await gone).status()).toBe(200);
    expect(await db().job.findUnique({ where: { id: job.id } })).toBeNull();
    await context.close();
  });
});
