// Links we email to someone who is BY DEFINITION signed out must live OUTSIDE
// the /app prefix.
//
// Why this suite exists: the mobile shells claim every /app/* URL as an
// Android App Link / iOS Universal Link (middleware serves the assetlinks +
// AASA files that grant it). A phone with WorkBench installed hands such a
// link to the app, which loads its own start URL (/app/dashboard) and ignores
// the path — so a password-reset link tapped on that phone silently lands on
// the login screen and the reset never happens. Moving one of these pages
// back under /app would reintroduce that, invisibly, for app users only.
import { test, expect } from "@playwright/test";
import { readState } from "../env";

const state = readState();

// path → a selector that proves the real page rendered (not a login bounce)
const PAGES: { path: string; query: string; proof: RegExp }[] = [
  { path: "/reset-password", query: "?token=not-a-real-token&email=nobody%40example.com", proof: /Choose a new password/i },
  { path: "/verify-email", query: "?token=not-a-real-token", proof: /Confirm your new email/i },
  { path: "/calendar-connected", query: "?gcal=connected", proof: /Google Calendar connected/i },
];

test.describe("signed-out links stay outside /app", () => {
  for (const { path, query, proof } of PAGES) {
    test(`${path} renders with no session`, async ({ browser }) => {
      // A fresh context — no cookies, exactly what a mail-app tap looks like.
      const context = await browser.newContext();
      const page = await context.newPage();
      const res = await page.goto(`${state.baseUrl}${path}${query}`);
      expect(res!.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}\b`));
      await expect(page).not.toHaveURL(/\/app\//);
      await expect(page.getByText(proof)).toBeVisible();
      await context.close();
    });

    test(`/app${path} still redirects to ${path}`, async () => {
      // Emails already in flight (reset tokens live an hour) point at the old
      // path — it must keep working in a browser.
      const res = await fetch(`${state.baseUrl}/app${path}${query}`, { redirect: "manual" });
      expect(res.status).toBe(308);
      const location = res.headers.get("location")!;
      expect(new URL(location, state.baseUrl).pathname).toBe(path);
      // The token rides in the query — dropping it would break the link just
      // as thoroughly as not redirecting at all.
      expect(new URL(location, state.baseUrl).search).toBe(query);
    });
  }
});
