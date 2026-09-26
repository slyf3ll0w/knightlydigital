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

type Hit = { text: string; fg: string; bg: string; ratio: number; cls: string; tag: string };

// Runs inside the page. Kept dependency-free so it serializes cleanly.
function auditPage(): { mode: string | undefined; hits: Hit[] } {
  type Rgb = { r: number; g: number; b: number; a: number };
  const parse = (c: string | null): Rgb | null => {
    if (!c) return null;
    let m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = c.match(/color\(srgb\s+([^)]+)\)/);
    if (m) {
      const p = m[1].replace("/", " ").split(/\s+/).filter(Boolean).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const lum = ({ r, g, b }: Rgb) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (top: Rgb, under: Rgb): Rgb => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const dark = document.documentElement.dataset.mode === "dark";
  const bgOf = (el: Element): Rgb => {
    const layers: Rgb[] = [];
    let e: Element | null = el;
    while (e) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.98) break;
      }
      e = e.parentElement;
    }
    let out: Rgb = dark ? { r: 14, g: 19, b: 29, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out);
    return out;
  };
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const check = (el: Element, text: string) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const fg0 = parse(cs.color);
    if (!fg0) return;
    const bg = bgOf(el);
    const fg = fg0.a < 1 ? blend(fg0, bg) : fg0;
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio >= 2) return;
    const cls = (el.getAttribute("class") || "").slice(0, 120);
    const key = cls + "|" + text;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ text: text.slice(0, 40), fg: cs.color, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`, ratio: Math.round(ratio * 100) / 100, cls, tag: el.tagName });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || "").trim();
    if (t.length >= 2 && n.parentElement) check(n.parentElement, t);
  }
  for (const el of Array.from(document.querySelectorAll("input:not([type=hidden]), textarea, select"))) {
    const field = el as HTMLInputElement;
    check(el, `[field ${(field.value || field.placeholder || "").slice(0, 16)}]`);
  }
  return { mode: document.documentElement.dataset.mode, hits };
}

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
