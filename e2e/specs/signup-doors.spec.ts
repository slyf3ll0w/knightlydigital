// The ways INTO WorkBench, and what an invite code does at each one.
//
// Two things this suite pins down:
//  1. Signing up works inside the mobile app. The shell keeps /app/* in the
//     webview and hands every other path (the marketing site's /apply
//     included) to the system browser — so the in-app "Get started" link has
//     to point at an /app path, or the app ejects people to finish signing up.
//  2. Every signup door takes an invite code. A code waives the payment-setup
//     step (and, in the Finix era, review + underwriting); when /apply had
//     no field for one, testers handed the shared code filled out the whole
//     application and landed on the KYC gate anyway. Since 2026-11-03 the
//     field is folded behind "Have an invite code?" and opens on its own
//     when the link carries ?code=.
import { test, expect } from "@playwright/test";
import { readState } from "../env";

const state = readState();

const DOORS = [
  { path: "/app/get-started", name: "in-app" },
  { path: "/apply", name: "marketing site" },
];

test.describe("signup doors", () => {
  for (const { path, name } of DOORS) {
    test(`${path} (${name}) opens signed out and takes an invite code`, async ({ browser }) => {
      // Fresh context — a signed-out stranger, which is who signs up.
      const context = await browser.newContext();
      const page = await context.newPage();
      const res = await page.goto(`${state.baseUrl}${path}`);
      expect(res!.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator("#apply-invite-code")).toHaveCount(0);
      await page.getByRole("button", { name: /have an invite code/i }).click();
      await expect(page.locator("#apply-invite-code")).toBeVisible();
      // A link that carries the code opens the field already filled in.
      await page.goto(`${state.baseUrl}${path}?code=WB-TEST-0000`);
      await expect(page.locator("#apply-invite-code")).toHaveValue("WB-TEST-0000");
      await context.close();
    });
  }

  test("the app's Get started link stays inside the app", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${state.baseUrl}/app/login`);
    const href = await page.getByRole("link", { name: /get started/i }).getAttribute("href");
    // Anything outside /app is a path the native shell opens in the system
    // browser — which is the bug this link used to be.
    expect(href!.startsWith("/app/")).toBe(true);
    await context.close();
  });

  test("the retired built-in tester code is dead; a configured shared code works", async () => {
    // Until the 2026-11-01 security audit "Workbench123" was the built-in
    // default shared code — a brand-name word in a public repository that
    // skipped review and underwriting. There is no default any more: the
    // shared code is whatever UNIVERSAL_INVITE_CODE says on the deployment,
    // and nothing else opens a company. E2E_UNIVERSAL_INVITE_CODE (CI env)
    // names the deployment's code when one is set.
    const check = async (code: string) => {
      const res = await fetch(`${state.baseUrl}/api/app/invite-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      expect(res.status).toBe(200);
      return (await res.json()).valid as boolean;
    };
    const configured = process.env.E2E_UNIVERSAL_INVITE_CODE;
    if (configured && configured.replace(/\s+/g, "").toLowerCase() === "workbench123") {
      expect(await check("Workbench123")).toBe(true);
      return;
    }
    expect(await check("Workbench123")).toBe(false);
    if (configured) expect(await check(configured)).toBe(true);
  });
});
