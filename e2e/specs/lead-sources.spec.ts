// Lead sources (2026-11-17): one spelling per source however it was typed,
// the pick list that offers it back, and the report that counts it — on a
// desk and on a phone. How a website visitor's arrival is named is covered
// by scripts/test-lead-source.ts (the public forms sit behind the captcha
// here, so a scripted submit can't reach it).
import { test, expect, type Browser } from "@playwright/test";
import { readState } from "../env";
import { Api, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();
// A source nobody else has, so the row's numbers are this run's alone
const OWN = `${runTag} Home show`;

async function signedIn(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([
    { name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
  ]);
  return context;
}

test.describe("lead sources", () => {
  let api: Api;
  const ids: string[] = [];

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    // Three spellings of one standard source, and two leads from the company's own
    for (const [suffix, leadSource, status] of [
      ["SrcA", "adwords", "LEAD"],
      ["SrcB", "  google ADS ", "LEAD"],
      ["SrcC", OWN.toUpperCase(), "LEAD"],
      ["SrcD", OWN, "ACTIVE"],
    ] as const) {
      const c = await api.post("/api/app/contacts", { firstName: runTag, lastName: suffix, status, leadSource });
      ids.push(c.id);
    }
  });

  test.afterAll(async () => {
    for (const id of ids) await deleteContact(api, id);
    await disconnectDb();
  });

  test("typed spellings are saved as one name", async () => {
    const rows = await db().contact.findMany({ where: { id: { in: ids.slice(0, 2) } }, select: { leadSource: true } });
    expect(rows.map((r) => r.leadSource)).toEqual(["Google Ads", "Google Ads"]);
    // An edit goes through the same rule
    await api.patch(`/api/app/contacts/${ids[0]}`, { leadSource: "word of mouth" });
    const edited = await db().contact.findUniqueOrThrow({ where: { id: ids[0] }, select: { leadSource: true } });
    expect(edited.leadSource).toBe("Referral");
    await api.patch(`/api/app/contacts/${ids[0]}`, { leadSource: "adwords" });
  });

  test("the pick list offers the standard names and the company's own, once each", async () => {
    const { sources } = await api.get<{ sources: string[] }>("/api/app/lead-sources");
    expect(sources[0]).toBe("Referral");
    expect(sources).toContain("Google Ads");
    expect(sources.filter((s) => s.toLowerCase() === OWN.toLowerCase())).toHaveLength(1);
  });

  for (const [name, viewport] of [
    ["desk", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844 }],
  ] as const) {
    test(`the report counts leads and wins per source (${name})`, async ({ browser }) => {
      const context = await signedIn(browser, viewport);
      const page = await context.newPage();
      await page.goto(`${state.baseUrl}/app/insights/lead-sources?range=30`);
      await expect(page.getByRole("heading", { name: /Lead sources/ })).toBeVisible();
      const list = page.getByTestId(name === "desk" ? "lead-source-table" : "lead-source-rows");
      const row = list.locator(name === "desk" ? "tr" : "a").filter({ hasText: new RegExp(OWN, "i") });
      await expect(row).toHaveCount(1);
      if (name === "desk") {
        // Source | Leads | Quoted | Won | Win rate | Collected
        await expect(row.locator("td").nth(1)).toHaveText("2");
        await expect(row.locator("td").nth(3)).toHaveText("1");
        await expect(row.locator("td").nth(4)).toHaveText("50%");
      } else {
        await expect(row).toContainText("2 leads · 1 won (50%)");
      }
      // The leads behind the row
      await (name === "desk" ? row.getByRole("link") : row).click();
      const leads = page.getByTestId("lead-source-leads");
      await expect(leads).toBeVisible();
      await expect(leads.getByRole("link", { name: new RegExp(`${runTag} Src[CD]`) })).toHaveCount(2);
      // Insights links here
      await page.goto(`${state.baseUrl}/app/insights`);
      await expect(page.getByRole("link", { name: /Lead sources/ })).toBeVisible();
      await context.close();
    });
  }
});
