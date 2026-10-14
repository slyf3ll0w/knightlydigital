// Photos in a conversation stage in the composer before they go (iMessage
// style, components/PendingAttachments.tsx): a pasted screenshot
// (lib/use-paste-files.ts), a dropped or picked file lands as a thumbnail
// above the box, words go under it, and Send ships them together. A
// plain-text paste is left to the composer. Covers the Messages thread on
// its portal channel (no business line needed); the team chat shares the
// same pieces.
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

test.describe("photos stage in the composer before they send", () => {
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

  test("paste attaches a thumbnail, words go under it, Send ships both", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addCookies([
      { name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true },
    ]);
    const page = await context.newPage();
    const thumbs = page.locator("[data-pending-attachments] img");
    const sent = page.locator("[data-paste-zone] a[title='Open full size'] img");
    const attach = page.getByRole("button", { name: "Attach a photo" });
    const sendBtn = page.getByRole("button", { name: "Send", exact: true });
    try {
      await page.goto(`${state.baseUrl}/app/messages/thread/${contactId}`);
      // The page template re-mounts on entry, so two composers can overlap for a beat
      await expect(page.getByPlaceholder(/^Message /)).toHaveCount(1, { timeout: 15_000 });
      const composer = page.getByPlaceholder(/^Message /);
      await expect(composer).toBeVisible();

      // Words paste as words — nothing attaches, nothing sends
      await composer.focus();
      await pasteInto(page, "text");
      await expect(thumbs).toHaveCount(0);
      await expect(sent).toHaveCount(0);
      await expect(sendBtn).toBeDisabled();

      // A picture pastes as a thumbnail in the composer, not a message yet
      await pasteInto(page, "image");
      await expect(thumbs).toHaveCount(1);
      await expect(sent).toHaveCount(0);
      await expect(sendBtn).toBeEnabled();

      // Words under it + Enter → one message carrying both
      await composer.fill("With a caption");
      await composer.press("Enter");
      await expect(thumbs).toHaveCount(0);
      await expect(sent).toHaveCount(1, { timeout: 15_000 });
      await expect(page.locator("[data-paste-zone]").getByText("With a caption")).toBeVisible();
      await expect.poll(
        async () => {
          const res = await api.raw("GET", `/api/app/messages/${contactId}`);
          const data = await res.json();
          const msgs: Array<{ body: string; media?: unknown[] }> = data.messages ?? [];
          return msgs.filter((m) => (m.media?.length ?? 0) > 0).map((m) => m.body);
        },
        { timeout: 15_000 }
      ).toEqual(["With a caption"]);
      // One send at a time: the attach button comes back once the upload's response is in
      await expect(attach).toBeEnabled({ timeout: 90_000 });

      // Paste with nothing focused still attaches (Slack-style page-level paste);
      // the remove badge drops it; Send with no words ships a bare photo
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
      await pasteInto(page, "image");
      await expect(thumbs).toHaveCount(1);
      await page.getByRole("button", { name: /^Remove / }).click();
      await expect(thumbs).toHaveCount(0);
      await expect(sendBtn).toBeDisabled();
      await pasteInto(page, "image");
      await expect(thumbs).toHaveCount(1);
      await sendBtn.click();
      await expect(thumbs).toHaveCount(0);
      await expect(sent).toHaveCount(2, { timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});
