// The Square Payments page (2026-11-10 redesign): overview with the gross
// volume chart, range switch, the underline tab bar and the one transactions
// table with its filter chips — on a desk and on a phone. Only runs when
// company A is connected to the Square sandbox (see square-charge.spec.ts).
import { test, expect, type Browser } from "@playwright/test";
import { readState } from "../env";

const state = readState();
test.skip(!state.squareCardTestsEnabled, "Square sandbox not available — payments dashboard spec skipped");

async function signedIn(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([
    { name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
  ]);
  return context;
}

for (const [name, viewport] of [
  ["desk", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test(`payments dashboard renders and filters (${name})`, async ({ browser }) => {
    const context = await signedIn(browser, viewport);
    const page = await context.newPage();
    const errors: string[] = [];
    // React hydration warnings (#418/#423 …) happen intermittently app-wide
    // and recover on their own (superadmin.spec.ts filters them the same
    // way); the recovery re-render can leave a "reading 'parentNode'" behind.
    page.on("pageerror", (e) => {
      if (/Minified React error #4(18|19|22|23|25)/.test(e.message) || /reading 'parentNode'/.test(e.message)) return;
      errors.push(e.message);
    });
    // A link tapped while that recovery re-render runs can be swallowed: tap
    // again until the URL moves.
    const go = async (loc: ReturnType<typeof page.locator>, url: RegExp) => {
      await expect(async () => {
        await loc.click();
        await expect(page).toHaveURL(url, { timeout: 3_000 });
      }).toPass({ timeout: 20_000 });
    };

    await page.goto(`${state.baseUrl}/app/payments`);
    await expect(page.getByText("Gross volume", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("img", { name: /Gross volume by day/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Payments sections" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Show" })).toBeVisible();

    // Range switch keeps the page and marks the new range
    await go(page.getByRole("navigation", { name: "Range" }).getByRole("link", { name: "7D" }), /range=7d/);
    await expect(page.getByRole("navigation", { name: "Range" }).getByRole("link", { name: "7D" })).toHaveAttribute("aria-current", "true");

    // Filter chips carry the range along
    await go(page.getByRole("group", { name: "Show" }).getByRole("link", { name: /Through WorkBench/ }), /show=workbench/);
    await expect(page).toHaveURL(/range=7d/);
    await expect(page.getByText("Every payment through WorkBench")).toBeVisible();

    // Another tab keeps working under the new bar
    await go(page.getByRole("navigation", { name: "Payments sections" }).getByRole("link", { name: "Reports" }), /tab=reports/);

    // No horizontal page scroll on either size
    await page.goto(`${state.baseUrl}/app/payments`);
    await expect(page.getByText("Gross volume", { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    expect(errors).toEqual([]);
    await context.close();
  });
}
