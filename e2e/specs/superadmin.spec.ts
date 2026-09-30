// Platform console smoke + contrast: the console signs in with its own
// cookie (minted in global-setup when the target DB has a SUPERADMIN user),
// every page renders on the design system, the company page's tabs open,
// and nothing is unreadable in either theme at phone or desktop width.
import { test, expect, type Browser, type Page } from "@playwright/test";
import { readState } from "../env";
import { auditPage } from "../helpers/contrast";

const state = readState();
const sa = state.superadmin;

async function consolePage(browser: Browser, mode: "light" | "dark", width: number): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height: width < 800 ? 844 : 900 },
    isMobile: width < 800,
    hasTouch: width < 800,
    colorScheme: mode,
  });
  await context.addCookies([
    { name: "wb-superadmin", value: sa!.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
  ]);
  await context.addInitScript((m: string) => {
    try {
      localStorage.setItem("hub-theme", m);
    } catch {
      /* ignore */
    }
  }, mode);
  return context.newPage();
}

test.describe("platform console", () => {
  test.skip(!sa, "no SUPERADMIN user in the target database — console specs skipped");
  test.describe.configure({ timeout: 180_000 });

  test("signed-out /superadmin bounces to the console login", async ({ page }) => {
    await page.goto(`${state.baseUrl}/superadmin`);
    await expect(page).toHaveURL(/\/superadmin\/login/);
    await expect(page.locator("form")).toBeVisible();
  });

  test("accounts home, company tabs and the other sections render", async ({ browser }) => {
    const page = await consolePage(browser, "light", 1440);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(`${state.baseUrl}/superadmin`);
    await expect(page.getByRole("heading", { name: "Accounts", exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Live accounts/, level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Test accounts/, level: 2 })).toBeVisible();

    // The e2e harness company is a real row: open it and walk the tabs.
    const link = page.locator(`a[href="/superadmin/company/${state.ownerA.companyId}"]`).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/superadmin/company/${state.ownerA.companyId}`));
    for (const tab of ["Overview", "Team", "Money", "Usage", "Controls"]) {
      await page.getByRole("link", { name: tab, exact: true }).click();
      await expect(page.getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
    }
    await expect(page.getByRole("heading", { name: /^Console history/, level: 2 })).toBeVisible();

    for (const [path, heading] of [
      ["/superadmin/signups", "Sign-ups"],
      ["/superadmin/profitability", "Profitability"],
      ["/superadmin/feedback", "Feedback"],
      ["/superadmin/library", "Library"],
    ] as const) {
      await page.goto(`${state.baseUrl}${path}`);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }

    // Retired pages redirect instead of 404ing.
    await page.goto(`${state.baseUrl}/superadmin/applications`);
    await expect(page).toHaveURL(/\/superadmin\/signups/);

    expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
    await page.context().close();
  });

  test("search finds the harness company", async ({ browser }) => {
    const page = await consolePage(browser, "light", 1440);
    await page.goto(`${state.baseUrl}/superadmin`);
    await page.getByLabel("Find an account").fill(state.companyASlug.slice(0, 6));
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/superadmin\/company\//);
    await page.context().close();
  });

  for (const mode of ["dark", "light"] as const) {
    for (const width of [390, 1440]) {
      test(`${mode} @ ${width}px: every console screen is readable`, async ({ browser }) => {
        const page = await consolePage(browser, mode, width);
        const routes = [
          "/superadmin",
          `/superadmin/company/${state.ownerA.companyId}`,
          `/superadmin/company/${state.ownerA.companyId}?tab=team`,
          `/superadmin/company/${state.ownerA.companyId}?tab=money`,
          `/superadmin/company/${state.ownerA.companyId}?tab=usage`,
          `/superadmin/company/${state.ownerA.companyId}?tab=controls`,
          "/superadmin/signups",
          "/superadmin/signups?tab=invites",
          "/superadmin/profitability",
          "/superadmin/feedback",
          "/superadmin/library",
        ];
        const failures: string[] = [];
        for (const route of routes) {
          await page.goto(`${state.baseUrl}${route}`);
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(600); // ds-rise settles
          const result = await page.evaluate(auditPage);
          expect(result.mode, `${route} rendered in ${result.mode}, expected ${mode}`).toBe(mode);
          for (const h of result.hits) failures.push(`${route}: "${h.text}" ${h.fg} on ${h.bg} = ${h.ratio}:1 <${h.tag} class="${h.cls}">`);
        }
        expect(failures, failures.join("\n")).toEqual([]);
        await page.context().close();
      });
    }
  }
});
