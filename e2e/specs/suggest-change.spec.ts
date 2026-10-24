// "Suggest a change" (components/SuggestChange.tsx): the tester-only picker
// freezes the page, a real browser renders the screen to a picture, the
// sheet sends, and the ticket lands tagged change-request with the capture
// and its picture — which the console can serve. The e2e tenants are test
// accounts (provision.mts), so the feature is on for them.
import { test, expect, type Browser } from "@playwright/test";
import { readState } from "../env";
import { db, disconnectDb } from "../helpers/db";

const state = readState();
const owner = state.ownerA;
const sa = state.superadmin;

const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844 }],
] as const;

/** A signed-in owner context. The welcome tour (first dashboard visit) is dismissed up front: its dialog would sit over the heading. */
async function ownerContext(browser: Browser, viewport: { width: number; height: number }) {
  const phone = viewport.width < 800;
  const context = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone });
  await context.addCookies([
    { name: state.cookieName, value: owner.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
  ]);
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("sf-tour-dismissed", "1");
    } catch {
      /* ignore */
    }
    // Evidence for a failure: who saw each right-click, and whether something had already claimed it
    const log: unknown[] = [];
    (window as unknown as { __cm: unknown[] }).__cm = log;
    document.addEventListener("contextmenu", (e) => log.push({ at: "doc-capture", tag: (e.target as Element)?.tagName, prevented: e.defaultPrevented }), true);
    window.addEventListener("contextmenu", (e) => log.push({ at: "win-bubble", tag: (e.target as Element)?.tagName, prevented: e.defaultPrevented }));
  });
  return context;
}

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

  test("the menu entry opens pick mode; Escape leaves the page untouched", async ({ browser }) => {
    const context = await ownerContext(browser, { width: 1440, height: 900 });
    const page = await context.newPage();
    await page.goto(`${state.baseUrl}/app/dashboard`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const banner = page.getByText(/what you want changed/);
    await expect
      .poll(
        async () => {
          await page.evaluate(() => window.dispatchEvent(new Event("wb:suggest-change")));
          return banner.isVisible();
        },
        { timeout: 30_000, intervals: [500, 1000] }
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(banner).toBeHidden();
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await context.close();
  });

  for (const [label, viewport] of VIEWPORTS) {
    test(`${label}: pick the heading, the picture renders, the ticket carries the capture`, async ({ browser }) => {
      const phone = viewport.width < 800;
      const context = await ownerContext(browser, viewport);
      const page = await context.newPage();
      await page.goto(`${state.baseUrl}/app/dashboard`);
      await expect(page).not.toHaveURL(/\/app\/login/);
      const h1 = page.getByRole("heading", { level: 1 }).first();
      await expect(h1).toBeVisible();

      // The gesture: a press-and-hold on the phone, a right-click at the desk —
      // straight into the flow on that element. The listeners exist only once
      // the layout has hydrated, so repeat the gesture until the flow answers
      // (a repeat while the picture is being taken is ignored).
      const dialog = page.getByRole("dialog", { name: "Suggest a change" });
      const started = async () => (await dialog.isVisible()) || (await page.getByText("Taking a picture…").isVisible());
      if (phone) {
        const cdp = await context.newCDPSession(page);
        const box = (await h1.boundingBox())!;
        const x = box.x + Math.min(40, box.width / 2);
        const y = box.y + box.height / 2;
        await expect
          .poll(
            async () => {
              if (await started()) return true;
              await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
              await page.waitForTimeout(700);
              await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
              return started();
            },
            { timeout: 30_000, intervals: [400, 800] }
          )
          .toBe(true);
      } else {
        // On a desk a control (button, link) goes straight in. Plain text and
        // empty space belong to sticky notes first — their right-click menu
        // carries the "Suggest a change" row (checked by hand; the Linux
        // runner's headless Chromium never showed that popover).
        const control = page.getByRole("link", { name: "New job", exact: true }).or(page.getByRole("button", { name: "New job", exact: true })).first();
        await expect(control).toBeVisible();
        await expect
          .poll(
            async () => {
              if (await started()) return true;
              await control.click({ button: "right", timeout: 3000 }).catch(() => undefined);
              await page.waitForTimeout(600);
              return started();
            },
            { timeout: 40_000, intervals: [500, 1000] }
          )
          .toBe(true)
          .catch(async (err: unknown) => {
            const seen = await page.evaluate(() => (window as unknown as { __cm?: unknown[] }).__cm ?? []);
            const menus = await page.evaluate(() => Array.from(document.querySelectorAll("[role=menuitem]")).map((m) => m.textContent?.trim()));
            const flag = await page.evaluate(() => document.documentElement.dataset.suggestChanges ?? "(unset)");
            const box = await control.boundingBox();
            const under = box
              ? await page.evaluate(
                  ([x, y]) => {
                    const chain: string[] = [];
                    let p = document.elementFromPoint(x, y);
                    while (p && p !== document.body && chain.length < 8) {
                      chain.unshift(`${p.tagName.toLowerCase()}${p.getAttribute("role") ? `[${p.getAttribute("role")}]` : ""}.${(p.getAttribute("class") || "").split(/\s+/).slice(0, 3).join(".")}`);
                      p = p.parentElement;
                    }
                    return chain.join(" > ");
                  },
                  [box.x + box.width / 2, box.y + box.height / 2] as [number, number]
                )
              : "(no box)";
            throw new Error(
              `right-click never started the flow · flag=${flag} · contextmenu seen: ${JSON.stringify(seen)} · menu items: ${JSON.stringify(menus)} · under the pointer: ${under}\n${String(err)}`
            );
          });
      }
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
        // The pick is the exact element under the pointer: the heading (or
        // the greeting span inside it) on the phone, the New job control at
        // the desk.
        expect(ticket!.title).toMatch(phone ? /^Change: E2E .* — (h1|span) / : /^Change: E2E .* — (a|button) “New job”/);
        expect(ticket!.details).toContain(`WHAT TO CHANGE (How it works)\n${note}`);
        expect(ticket!.details).toContain("page: /app/dashboard");
        expect(ticket!.details).toContain(`viewport: ${viewport.width}×${viewport.height}`);
        expect(ticket!.details).toMatch(phone ? /ELEMENT\n<(h1|span)/ : /ELEMENT\n<(a|button)/);
        const capture = ticket!.capture as { target?: { tag?: string; path?: string; text?: string }; shot?: string; page?: { url?: string } } | null;
        expect(phone ? ["h1", "span"] : ["a", "button"]).toContain(capture?.target?.tag);
        if (phone) expect(capture?.target?.path).toMatch(/h1/);
        else expect(capture?.target?.text).toBe("New job");
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
