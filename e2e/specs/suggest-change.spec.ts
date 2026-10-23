// "Suggest a change" (components/SuggestChange.tsx): the tester-only picker
// freezes the page, a real browser renders the screen to a picture, the
// sheet sends, and the ticket lands tagged change-request with the capture
// and its picture — which the console can serve. The e2e tenants are test
// accounts (provision.mts), so the feature is on for them.
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { db, disconnectDb } from "../helpers/db";

const state = readState();
const owner = state.ownerA;
const sa = state.superadmin;

const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844 }],
] as const;

test.describe("suggest a change", () => {
  test.describe.configure({ timeout: 150_000 });
  test.afterAll(disconnectDb);

  test("anonymous POST is refused", async () => {
    const res = await fetch(`${state.baseUrl}/api/app/feedback/change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "x" }),
    });
    expect(res.status).toBe(401);
  });

  for (const [label, viewport] of VIEWPORTS) {
    test(`${label}: pick the heading, the picture renders, the ticket carries the capture`, async ({ browser }) => {
      const phone = viewport.width < 800;
      const context = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone });
      await context.addCookies([
        { name: state.cookieName, value: owner.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
      ]);
      const page = await context.newPage();
      await page.goto(`${state.baseUrl}/app/dashboard`);
      await expect(page).not.toHaveURL(/\/app\/login/);
      const h1 = page.getByRole("heading", { level: 1 }).first();
      await expect(h1).toBeVisible();

      // The More sheet / user menu fire this event; drive it directly so the
      // test is about the picker, not the menus.
      await page.evaluate(() => window.dispatchEvent(new Event("wb:suggest-change")));
      await expect(page.getByText(/what you want changed/)).toBeVisible();

      // In pick mode a press is a pick, nothing else fires
      await h1.click();
      const dialog = page.getByRole("dialog", { name: "Suggest a change" });
      await expect(dialog).toBeVisible({ timeout: 45_000 });
      await expect(page).toHaveURL(/\/app\/dashboard/);
      await expect(dialog.getByText(/^Picked:/)).toBeVisible();
      await expect(dialog.getByRole("img", { name: "This screen" })).toBeVisible();

      await dialog.getByRole("radio", { name: "How it works" }).click();
      const note = `E2E ${label} change request ${Date.now().toString(36)}`;
      await dialog.getByRole("textbox").fill(note);
      await dialog.getByRole("button", { name: "Send", exact: true }).click();
      await expect(dialog.getByText(/Sent — thanks\. Ticket #[a-z0-9]{6}\./)).toBeVisible({ timeout: 45_000 });

      const ticket = await db().feedbackTicket.findFirst({
        where: { companyId: owner.companyId, pageUrl: "change-request", details: { contains: note } },
        orderBy: { createdAt: "desc" },
      });
      expect(ticket).not.toBeNull();
      try {
        expect(ticket!.type).toBe("SUGGESTION");
        expect(ticket!.title).toMatch(/^Change: E2E .* — h1 /);
        expect(ticket!.details).toContain(`WHAT TO CHANGE (How it works)\n${note}`);
        expect(ticket!.details).toContain("page: /app/dashboard");
        expect(ticket!.details).toContain(`viewport: ${viewport.width}×${viewport.height}`);
        expect(ticket!.details).toContain("ELEMENT\n<h1");
        const capture = ticket!.capture as { target?: { tag?: string }; shot?: string; page?: { url?: string } } | null;
        expect(capture?.target?.tag).toBe("h1");
        expect(capture?.page?.url).toContain("/app/dashboard");

        // The picture: present whenever the deployment has R2, and the
        // console route hands it out as a redirect to a signed URL.
        if (ticket!.screenshotKey) {
          expect(capture?.shot).toBe("auto");
          expect(ticket!.details).toContain("picture: rendered by the app");
          if (sa) {
            const shot = await fetch(`${state.baseUrl}/api/superadmin/feedback/${ticket!.id}/screenshot`, {
              headers: { cookie: `wb-superadmin=${sa.token}` },
              redirect: "manual",
            });
            expect(shot.status).toBe(302);
          }
          const anon = await fetch(`${state.baseUrl}/api/superadmin/feedback/${ticket!.id}/screenshot`, { redirect: "manual" });
          expect([401, 302, 307]).toContain(anon.status); // middleware may bounce to the console login
          expect(anon.status === 302 || anon.status === 307 ? anon.headers.get("location") ?? "" : "").not.toMatch(/r2\.cloudflarestorage|X-Amz/);
        }
      } finally {
        // Tidy: through the console (which also drops the picture) when a
        // superadmin session exists, else the row alone.
        if (sa) {
          await fetch(`${state.baseUrl}/api/superadmin/feedback/${ticket!.id}`, { method: "DELETE", headers: { cookie: `wb-superadmin=${sa.token}` } });
        } else {
          await db().feedbackTicket.delete({ where: { id: ticket!.id } }).catch(() => undefined);
        }
      }
      await context.close();
    });
  }
});
