// Paste a picture from the clipboard into a conversation (lib/use-paste-files.ts):
// Ctrl+V with a screenshot on the clipboard sends it as a photo message, the
// same path a dropped or picked file takes. A plain-text paste is left to the
// composer. Covers the Messages thread on its portal channel (no business
// line needed); the team chat shares the hook.
import { test, expect, type Page } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact } from "../helpers/api";

const state = readState();

// 1×1 transparent PNG
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Fire a paste event carrying a PNG file (or plain text) at the focused element. */
async function pasteInto(page: Page, kind: "image" | "text") {
  await page.evaluate(
    ({ kind, png }) => {
      const dt = new DataTransfer();
      if (kind === "image") {
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], "image.png", { type: "image/png" }));
      } else {
        dt.setData("text/plain", "pasted words");
      }
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { kind, png: PNG_BASE64 }
  );
}

test.describe("paste a picture into a conversation", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    const c = await createContact(api, "Paste");
    // An email puts the thread on the client-portal channel
    await api.raw("PATCH", `/api/app/contacts/${c.id}`, { email: `paste-${Date.now()}@example.com` });
    contactId = c.id;
  });
  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
  });

  test("Ctrl+V with a screenshot sends it; pasting words just types", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addCookies([
      { name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
    ]);
    const page = await context.newPage();
    try {
      await page.goto(`${state.baseUrl}/app/messages/thread/${contactId}`);
      // The page template re-mounts on entry, so two composers can overlap for a beat
      await expect(page.getByPlaceholder(/^Message /)).toHaveCount(1, { timeout: 15_000 });
      const composer = page.getByPlaceholder(/^Message /);
      await expect(composer).toBeVisible();

      // Words paste as words — the composer keeps them, nothing is sent
      await composer.focus();
      await pasteInto(page, "text");
      await expect(page.locator("[data-paste-zone] img")).toHaveCount(0);

      // A picture pastes as a photo message
      await pasteInto(page, "image");
      const bubble = page.locator("[data-paste-zone] img").first();
      await expect(bubble).toBeVisible({ timeout: 15_000 });
      // …and the upload lands server-side (the bubble swaps its blob: preview for the stored file)
      await expect.poll(
        async () => {
          const res = await api.raw("GET", `/api/app/messages/${contactId}`);
          const data = await res.json();
          const msgs: Array<{ media?: unknown[] }> = data.messages ?? [];
          return msgs.filter((m) => (m.media?.length ?? 0) > 0).length;
        },
        { timeout: 15_000 }
      ).toBe(1);

      // Paste with nothing focused still sends (Slack-style page-level paste)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
      await pasteInto(page, "image");
      await expect(page.locator("[data-paste-zone] img")).toHaveCount(2, { timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});
