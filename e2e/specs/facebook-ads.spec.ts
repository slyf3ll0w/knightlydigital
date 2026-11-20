// Facebook ads (2026-11-20): the page under Insights → Lead sources, turning
// reporting on with a dataset ID and an access token, and off again, on a desk
// and on a phone. Nothing here talks to Facebook: saving stores the two
// values and the first real send is the hourly cron's. Which steps are sent
// and what a request holds is covered by scripts/test-meta-ads-shape.ts.
import { test, expect, type Browser } from "@playwright/test";
import { readState } from "../env";
import { Api, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

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
    await disconnectDb();
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

  test("Facebook's webhook refuses a handshake with the wrong token and a lead notice with no signature", async () => {
    const shake = await fetch(`${state.baseUrl}/api/public/webhooks/meta?hub.mode=subscribe&hub.verify_token=not-the-token&hub.challenge=12345`);
    expect(shake.status).toBe(403);
    const body = JSON.stringify({ object: "page", entry: [{ id: "111222333444555", changes: [{ field: "leadgen", value: { leadgen_id: "1234567890123456", page_id: "111222333444555" } }] }] });
    const unsigned = await fetch(`${state.baseUrl}/api/public/webhooks/meta`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect(unsigned.status).toBe(401);
    const forged = await fetch(`${state.baseUrl}/api/public/webhooks/meta`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${"0".repeat(64)}` }, body });
    expect(forged.status).toBe(401);
  });

  // Facebook form leads are filed by the same code as the lead webhook
  // (lib/lead-intake.ts), which is the half a test can reach without Facebook.
  test("a lead posted to the lead webhook lands as a lead under its source, once per person", async () => {
    const before = await api.json<{ enabled: boolean; url: string | null }>("GET", "/api/app/pipeline/webhook");
    const url = before.url ?? (await api.json<{ url: string }>("POST", "/api/app/pipeline/webhook")).url;
    const path = new URL(url).pathname;
    // a phone nobody else has; no email, so nothing is mailed to a stranger
    const phone = `469${String(Date.now()).slice(-7)}`;
    const lead = { full_name: `${runTag} Fbform`, phone, source: "fb ads", message: "What kind of fence?: Cedar" };

    const first = await fetch(`${state.baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
    expect(first.status).toBe(201);
    const { leadId } = (await first.json()) as { leadId: string };
    try {
      const contact = await db().contact.findUniqueOrThrow({ where: { id: leadId }, select: { leadSource: true, status: true, firstName: true, lastName: true, pipelineStageId: true, requests: { select: { source: true, title: true } } } });
      expect(contact.pipelineStageId).not.toBeNull();
      expect(contact.requests).toEqual([{ source: "webhook", title: "Facebook Ads lead" }]);
      expect(contact.leadSource).toBe("Facebook Ads");
      expect(contact.status).toBe("LEAD");
      expect(`${contact.firstName} ${contact.lastName}`).toBe(`${runTag} Fbform`);

      // the same person again is the same lead, not a second one
      const again = await fetch(`${state.baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
      expect(again.status).toBe(201);
      expect(((await again.json()) as { leadId: string }).leadId).toBe(leadId);

      // nameless, or with no way to reach them, is refused
      const nameless = await fetch(`${state.baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      expect(nameless.status).toBe(400);
    } finally {
      await deleteContact(api, leadId);
      if (!before.enabled) await api.raw("DELETE", "/api/app/pipeline/webhook");
    }
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
