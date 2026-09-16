// The ways INTO WorkBench, and what an invite code does at each one.
//
// Two things this suite pins down:
//  1. Signing up works inside the mobile app. The shell keeps /app/* in the
//     webview and hands every other path (the marketing site's /apply
//     included) to the system browser — so the in-app "Get started" link has
//     to point at an /app path, or the app ejects people to finish signing up.
//  2. Every signup door takes an invite code. A code waives the application
//     review AND Finix underwriting; when /apply had no field for one,
//     testers handed the shared code filled out the whole application and
//     landed on the KYC gate anyway.
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
      await expect(page.locator("#apply-invite-code")).toBeVisible();
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

  test("the shared tester code is live", async () => {
    // Workbench123 (UNIVERSAL_INVITE_CODE) is what testers are handed: it
    // skips review and underwriting. If it's rotated on Railway, rotate it
    // here too — a red test means testers are hitting the KYC gate.
    const res = await fetch(`${state.baseUrl}/api/app/invite-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "Workbench123" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(true);
  });
});
