// Plan gating (lib/plans.ts, lib/plan-gate.ts): once PLAN_GATING=1 is set on
// the deployment, a Core company (tenant B) meets the PlanRequired card on a
// Pro page and a 402 PLAN_REQUIRED from a Pro API, while a company on Pro
// (tenant A, provisioned with the SHOP grant in e2e/provision.mts) sees the
// feature as before. /api/health reports `planGating`; while it is false the
// gate is dark and every check answers "allowed", so the spec skips itself.
import { test, expect, type Browser } from "@playwright/test";
import { Api } from "../helpers/api";
import { readState } from "../env";

const state = readState();

async function deployedPlanGating(): Promise<boolean> {
  const res = await fetch(`${state.baseUrl}/api/health`);
  const json = (await res.json().catch(() => ({}))) as { planGating?: unknown };
  return json.planGating === true;
}

/** A signed-in browser page for one tenant's owner (the minted session cookie). */
async function pageAs(browser: Browser, token: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.addCookies([
    { name: state.cookieName, value: token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
  ]);
  return { context, page: await context.newPage() };
}

test.describe("plan gate (Pro features)", () => {
  let live = false;

  test.beforeAll(async () => {
    live = await deployedPlanGating();
  });

  test.beforeEach(() => {
    test.skip(!live, "PLAN_GATING is not live on this deployment (/api/health planGating=false) — the gate answers 'allowed' for everyone");
  });

  test("Core company: /app/routes shows the Route Manager upsell card", async ({ browser }) => {
    const { context, page } = await pageAs(browser, state.ownerB.token);
    try {
      await page.goto(`${state.baseUrl}/app/routes`);
      await expect(page).not.toHaveURL(/\/app\/login/);
      await expect(page.locator('[data-plan-required="routes"]')).toBeVisible();
      await expect(page.getByRole("link", { name: "See plans" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("Core company: /app/estimates shows the Estimator upsell card", async ({ browser }) => {
    const { context, page } = await pageAs(browser, state.ownerB.token);
    try {
      await page.goto(`${state.baseUrl}/app/estimates`);
      await expect(page).not.toHaveURL(/\/app\/login/);
      await expect(page.locator('[data-plan-required="estimator"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("Core company: GET /api/app/route-plan answers 402 PLAN_REQUIRED", async () => {
    const apiB = Api.forOwnerB(state);
    const today = new Date().toISOString().slice(0, 10);
    const res = await apiB.raw("GET", `/api/app/route-plan?date=${today}`);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code?: string; plan?: string; feature?: string; error?: string };
    expect(body.code).toBe("PLAN_REQUIRED");
    expect(body.plan).toBe("SHOP");
    expect(body.feature).toBe("routes");
    expect(body.error).toMatch(/Pro/);
  });

  test("Pro company: /app/routes renders the map, no upsell card", async ({ browser }) => {
    const { context, page } = await pageAs(browser, state.ownerA.token);
    try {
      await page.goto(`${state.baseUrl}/app/routes`);
      await expect(page).not.toHaveURL(/\/app\/login/);
      await expect(page.locator("[data-plan-required]")).toHaveCount(0);
      const apiA = Api.forOwnerA(state);
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiA.raw("GET", `/api/app/route-plan?date=${today}`);
      expect(res.status).toBe(200);
    } finally {
      await context.close();
    }
  });
});
