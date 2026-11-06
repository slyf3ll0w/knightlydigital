/**
 * Emailing a document from the free generator (lib/tool-send.ts), the pure
 * parts: the signed sender cookie, recipient parsing and caps, the From
 * address, and the feature switch.
 *   npx tsx scripts/test-tool-send.ts
 */
process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/unused";
process.env.AUTH_SECRET ??= "test-secret-for-tool-send";
import assert from "node:assert/strict";

async function main() {
  const {
    RECIPIENTS_PER_SEND,
    SENDS_PER_DAY,
    SENT_TTL_DAYS,
    SESSION_TTL_MS,
    cookieValue,
    mintSenderCookie,
    parseRecipients,
    readSenderCookie,
    senderCookieHeader,
    toolEmailEnabled,
    toolsFrom,
  } = await import("../lib/tool-send");

  // ── Cookie ──
  const id = "clx1234567890abcdef";
  const now = 1_800_000_000_000;
  const cookie = mintSenderCookie(id, now);
  assert.equal(readSenderCookie(cookie, now), id, "a fresh cookie names the sender");
  assert.equal(readSenderCookie(cookie, now + SESSION_TTL_MS + 1), null, "an expired cookie is nothing");
  assert.equal(readSenderCookie(cookie.replace(/.$/, (c) => (c === "a" ? "b" : "a")), now), null, "a tampered signature is nothing");
  const [, exp, sig] = cookie.split(".");
  assert.equal(readSenderCookie(`${id}.${Number(exp) + 1000}.${sig}`, now), null, "a stretched expiry is nothing");
  assert.equal(readSenderCookie(`otherid123456.${exp}.${sig}`, now), null, "another id with the same signature is nothing");
  assert.equal(readSenderCookie("", now), null);
  assert.equal(readSenderCookie("a.b", now), null);
  assert.equal(cookieValue(`foo=1; wb_tool_sender=${cookie}; bar=2`), cookie, "the cookie is read out of the header");
  assert.equal(cookieValue("foo=1"), null);
  const header = senderCookieHeader(cookie);
  assert.ok(header.startsWith(`wb_tool_sender=${cookie}; Path=/; Max-Age=`), header);
  assert.ok(/HttpOnly; SameSite=Lax/.test(header), "HttpOnly + Lax");
  assert.ok(senderCookieHeader("", 0).includes("Max-Age=0"), "clearing sets Max-Age=0");

  // ── Recipients ──
  assert.deepEqual(parseRecipients(["Client@Example.com", " client@example.com ", "not an email", "two@example.com", "three@example.com"]), ["client@example.com", "two@example.com"], "normalized, distinct, capped at RECIPIENTS_PER_SEND");
  assert.equal(RECIPIENTS_PER_SEND, 2);
  assert.deepEqual(parseRecipients("one@example.com"), ["one@example.com"], "a bare string is one recipient");
  assert.deepEqual(parseRecipients(undefined), []);
  assert.deepEqual(parseRecipients(["a@b"]), [], "no TLD, no recipient");

  // ── Caps David chose 2026-11-05 ──
  assert.equal(SENDS_PER_DAY, 5);
  assert.equal(SENT_TTL_DAYS, 60);

  // ── From + feature switch ──
  delete process.env.TOOLS_EMAIL_FROM;
  assert.equal(toolsFrom(), null, "no env, no From");
  assert.equal(toolEmailEnabled(), false, "dark without TOOLS_EMAIL_FROM");
  process.env.TOOLS_EMAIL_FROM = "WorkBench <invoices@tools.workbenchfsm.com>";
  assert.deepEqual(toolsFrom(), { address: "invoices@tools.workbenchfsm.com", display: "WorkBench" });
  process.env.TOOLS_EMAIL_FROM = '"WorkBench Tools" <invoices@tools.workbenchfsm.com>';
  assert.deepEqual(toolsFrom(), { address: "invoices@tools.workbenchfsm.com", display: "WorkBench Tools" });
  process.env.TOOLS_EMAIL_FROM = "invoices@tools.workbenchfsm.com";
  assert.deepEqual(toolsFrom(), { address: "invoices@tools.workbenchfsm.com", display: "WorkBench" }, "a bare address gets the default display name");
  process.env.TOOLS_EMAIL_FROM = "not-an-address";
  assert.equal(toolsFrom(), null, "a malformed From is refused");

  console.log("tool-send: cookie, recipients, caps, From all OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
