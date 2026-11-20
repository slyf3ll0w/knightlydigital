// Facebook ads (2026-11-20): the page under Insights → Lead sources, turning
// reporting on with a dataset ID and an access token, and off again, on a desk
// and on a phone. Nothing here talks to Facebook: saving stores the two
// values and the first real send is the hourly cron's. Which steps are sent
// and what a request holds is covered by scripts/test-meta-ads-shape.ts.
import { test, expect, type Browser } from "@playwright/test";
import { readState } from "../env";
import { Api } from "../helpers/api";

const state = readState();
const DATASET = "1234567890123456";
// shaped like an Events Manager token; Facebook would refuse it, and it is never sent in this spec
const TOKEN = `EAAB${"e2e".repeat(60)}`;

async function signedIn(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([
    { name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
  ]);
  return context;
}

test.describe("facebook ads", () => {
  test.describe.configure({ mode: "serial" });
  let api: Api;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    await api.raw("DELETE", "/api/app/meta-ads");
  });

  test.afterAll(async () => {
    await api.raw("DELETE", "/api/app/meta-ads");
  });

  test("the API refuses a dataset ID or token that cannot be one, and saves a real-looking pair", async () => {
    const badId = await api.raw("POST", "/api/app/meta-ads", { datasetId: "act_123", token: TOKEN });
    expect(badId.status).toBe(400);
    expect((await badId.json()).error).toMatch(/dataset ID/i);
    const badToken = await api.raw("POST", "/api/app/meta-ads", { datasetId: DATASET, token: "short" });
    expect(badToken.status).toBe(400);
    expect((await badToken.json()).error).toMatch(/access token/i);
    const off = await api.json<{ on: boolean }>("GET", "/api/app/meta-ads");
    expect(off.on).toBe(false);

    const on = await api.json<Record<string, unknown>>("POST", "/api/app/meta-ads", { datasetId: DATASET, token: TOKEN });
    expect(on.on).toBe(true);
    expect(on.datasetId).toBe(DATASET);
    // the token never comes back
    expect(JSON.stringify(on)).not.toContain(TOKEN);
    await api.json("DELETE", "/api/app/meta-ads");
  });

  for (const [name, viewport] of [
    ["desk", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844 }],
  ] as const) {
    test(`turn reporting on and off from the page (${name})`, async ({ browser }) => {
      const context = await signedIn(browser, viewport);
      const page = await context.newPage();

      // Lead sources links here, and says Off
      await page.goto(`${state.baseUrl}/app/insights/lead-sources`);
      const link = page.getByTestId("fb-ads-link");
      await expect(link).toContainText("Facebook ads");
      await expect(link).toContainText("Off");
      await link.click();
      await expect(page.getByRole("heading", { name: "Facebook ads" })).toBeVisible();

      // Off: the three steps with two boxes; Turn on waits for both
      const setup = page.getByTestId("fb-setup");
      await expect(setup).toBeVisible();
      await expect(page.getByTestId("fb-status")).toHaveCount(0);
      const save = page.getByTestId("fb-save");
      await expect(save).toBeDisabled();
      await page.getByTestId("fb-dataset").fill("123");
      await page.getByTestId("fb-token").fill(TOKEN);
      await save.click();
      await expect(page.getByTestId("fb-error")).toContainText(/dataset ID/i);

      await page.getByTestId("fb-dataset").fill(DATASET);
      await save.click();
      const status = page.getByTestId("fb-status");
      await expect(status).toContainText("On");
      await expect(status).toContainText(`Dataset ${DATASET}`);
      await expect(setup).toHaveCount(0);
      await expect(page.getByTestId("fb-numbers")).toContainText("Facebook leads");
      // the test-event row is there and waits for a code
      await expect(page.getByTestId("fb-test")).toBeDisabled();

      // Lead sources now says On
      await page.goto(`${state.baseUrl}/app/insights/lead-sources`);
      await expect(page.getByTestId("fb-ads-link")).toContainText("On");

      // Turn off asks first
      await page.goto(`${state.baseUrl}/app/insights/lead-sources/facebook`);
      await page.getByTestId("fb-off").click();
      await page.getByRole("button", { name: "Turn off" }).last().click();
      await expect(page.getByTestId("fb-setup")).toBeVisible();
      await expect(page.getByTestId("fb-status")).toHaveCount(0);
      await context.close();
    });
  }
});
