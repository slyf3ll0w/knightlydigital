// Deployment smoke: the doors a client or tech walks through actually open.
import { test, expect } from "@playwright/test";
import { readState } from "../env";

const state = readState();

test.describe("deployment smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto(`${state.baseUrl}/app/login`);
    await expect(page.locator("form")).toBeVisible();
  });

  test("signed-in dashboard renders with a minted session", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: state.cookieName,
        value: state.ownerA.token,
        url: state.baseUrl,
        secure: state.baseUrl.startsWith("https"),
        httpOnly: true,
      },
    ]);
    const page = await context.newPage();
    await page.goto(`${state.baseUrl}/app/dashboard`);
    await expect(page).not.toHaveURL(/\/app\/login/);
    await context.close();
  });

  test("bogus public pay token is a 404, not an error page", async ({ page }) => {
    const res = await page.goto(`${state.baseUrl}/pay/not-a-real-token`);
    expect(res!.status()).toBe(404);
  });

  test("cron endpoint rejects anonymous and accepts the secret", async () => {
    const anon = await fetch(`${state.baseUrl}/api/cron/recurring`, { method: "POST" });
    expect([401, 503]).toContain(anon.status);

    if (process.env.CRON_SECRET) {
      const authed = await fetch(`${state.baseUrl}/api/cron/recurring`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      expect(authed.status).toBe(200);
      const body = await authed.json();
      expect(body.ok).toBe(true);
    }
  });
});
