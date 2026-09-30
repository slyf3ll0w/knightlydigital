// Dark-theme guard, runtime side: every text node and form field on the
// app's main screens must be readable against what's actually painted
// behind it, in BOTH themes, at phone and desktop widths. Black-on-black
// (and white-on-white) has slipped through several times because nothing
// measured it; this does, on every staging deploy, before main moves.
//
// Method: walk the DOM, take each text node's computed color, composite the
// ancestors' background colors (alpha-aware) down to the canvas, and compute
// the WCAG contrast ratio. Anything under 2.0:1 is a bug (real text sits at
// 4.5+; disabled/placeholder ink is ~2.5–3). The source-side half is
// scripts/check-theme.mjs.
import { test, expect, type Browser, type Page } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact } from "../helpers/api";
import { auditPage } from "../helpers/contrast";

const state = readState();

const ROUTES = [
  "/app/dashboard",
  "/app/schedule",
  "/app/contacts",
  "/app/requests",
  "/app/quotes",
  "/app/quotes/new",
  "/app/jobs",
  "/app/invoices",
  "/app/invoices/new",
  "/app/payments",
  "/app/settings",
  "/app/settings/profile",
];

async function signedInPage(browser: Browser, mode: "light" | "dark", width: number): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height: width < 800 ? 844 : 900 },
    isMobile: width < 800,
    hasTouch: width < 800,
    colorScheme: mode,
  });
  await context.addCookies([
    { name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
  ]);
  // The per-device appearance override (Settings → Appearance) — set before
  // the head script runs so the first paint is already themed.
  await context.addInitScript((m: string) => {
    try {
      localStorage.setItem("hub-theme", m);
    } catch {
      /* ignore */
    }
  }, mode);
  return context.newPage();
}

test.describe("theme contrast", () => {
  test.describe.configure({ timeout: 240_000 });
  let api: Api;
  let contactId: string;
  let quotePath = "";
  let invoicePath = "";

  test.beforeAll(async () => {
    api = Api.forOwnerA();
    contactId = (await createContact(api, "Theme")).id;
    const quote = await api.post("/api/app/quotes", {
      contactId,
      title: "Theme contrast quote",
      lineItems: [{ description: "Panel upgrade", quantity: 1, unitPrice: 1450 }],
    });
    quotePath = `/app/quotes/${quote.id}`;
    const invoice = await api.post("/api/app/invoices", {
      contactId,
      subject: "Theme contrast invoice",
      lineItems: [{ description: "Service call", quantity: 1, unitPrice: 180 }],
    });
    invoicePath = `/app/invoices/${invoice.id}`;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
  });

  for (const mode of ["dark", "light"] as const) {
    for (const width of [390, 1440]) {
      test(`${mode} @ ${width}px: every screen is readable`, async ({ browser }) => {
        const page = await signedInPage(browser, mode, width);
        const routes = [...ROUTES, quotePath, `${quotePath}/edit`, invoicePath, `${invoicePath}/edit`];
        const failures: string[] = [];
        for (const route of routes) {
          await page.goto(`${state.baseUrl}${route}`, { waitUntil: "load" });
          await expect(page).not.toHaveURL(/\/app\/login/);
          await page.waitForTimeout(1200); // reveal animations + fonts
          const result = await page.evaluate(auditPage);
          expect(result.mode, `${route} should be in ${mode} mode`).toBe(mode);
          for (const h of result.hits) {
            failures.push(`${route}: ${h.tag} "${h.text}" ${h.fg} on ${h.bg} (${h.ratio}:1) [${h.cls}]`);
          }
        }
        await page.context().close();
        expect(failures, `unreadable text in ${mode} mode at ${width}px:\n${failures.join("\n")}`).toEqual([]);
      });
    }
  }
});
