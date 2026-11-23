/**
 * Unit tests for the pure halves of the 2026-11-23 security fixes:
 *   lib/connector/oauth.ts   — an app cannot borrow a brand's name
 *   lib/connector/server.ts  — generated passwords stay out of what an outside AI is told
 *   lib/connector/tools.ts   — secret web addresses are withheld from outside AI apps
 *   lib/website-check.ts     — which addresses the server must never fetch
 *   lib/public-fetch.ts      — a web-push endpoint must be a browser's push service
 *   lib/superadmin-session.ts — a console session says when it was minted
 *   lib/public-doc-privacy.ts — when a public page shows nothing about the client
 *   components/AssistantCard.tsx — which Atlas cards a spoken yes can never confirm
 *   lib/tool-send.ts         — the free tool's overall daily email ceiling
 *   npx tsx scripts/test-security-nov23.ts
 * Plain assertions, no framework. No database (placeholder DATABASE_URL).
 */
import assert from "node:assert/strict";
import { isPrivateIp } from "../lib/website-check";
import { isPushServiceEndpoint, pinnedHttpsRequest } from "../lib/public-fetch";
import { MAX_SESSIONS_PER_DAY, PREPAID_CENTS, UNREPORTED_LIMIT, applyReport, audioCents, mintVerdict } from "../lib/live-voice-meter";
import { cameThroughEdge, clientIp } from "../lib/rate-limit";

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/unused";
process.env.AUTH_SECRET ??= "unit-test-secret";

async function main() {
  const { honestName } = await import("../lib/connector/oauth");
  const { withholdPassword } = await import("../lib/connector/server");
  const { scrubResult, LINK_WITHHELD } = await import("../lib/connector/tools");
  const { createSuperadminSessionToken, readSuperadminSessionToken, verifySuperadminSessionToken } = await import("../lib/superadmin-session");
  const { withholdsClient } = await import("../lib/public-doc-privacy");
  const { voiceConfirmable } = await import("../components/AssistantCard");
  const { overallDailyCap } = await import("../lib/tool-send");
  const { clearForeignWorkItemIds } = await import("../lib/own-work-items");
  let passed = 0;
  async function test(name: string, fn: () => void | Promise<void>) {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  }

  console.log("connector: app names");
  await test("a brand name is kept only when the app returns to that brand's own site", () => {
    assert.equal(honestName("Claude", ["https://claude.ai/api/mcp/auth_callback"]), "Claude");
    assert.equal(honestName("ChatGPT", ["https://chatgpt.com/connector_platform_oauth_redirect"]), "ChatGPT");
    assert.equal(honestName("Claude", ["https://evil.example/cb"]), "An app at evil.example");
    assert.equal(honestName("Claude by Anthropic", ["https://claude.ai/cb", "https://evil.example/cb"]), "An app at evil.example");
    assert.equal(honestName("Chat GPT", ["https://openai.evil.example/cb"]), "An app at openai.evil.example");
    assert.equal(honestName("WorkBench Support", ["https://evil.example/cb"]), "An app at evil.example");
  });
  await test("a desktop app on the person's own machine keeps its name; other names are untouched", () => {
    assert.equal(honestName("Claude Code", ["http://localhost:53124/callback"]), "Claude Code");
    assert.equal(honestName("Acme Assistant", ["https://acme.example/cb"]), "Acme Assistant");
  });

  console.log("connector: what an outside AI is told");
  await test("a card line carrying a generated password is withheld", () => {
    assert.ok(!withholdPassword("Starting password: Hub-1a2b3c4d — share it with them").includes("Hub-1a2b3c4d"));
    assert.ok(!withholdPassword("New password: Hub-deadbeef — the old one stops working").includes("Hub-deadbeef"));
    assert.equal(withholdPassword("Email: mike@example.com"), "Email: mike@example.com");
  });
  await test("the lead-intake, automation, calendar and ads-file addresses are withheld like pay links", () => {
    const token = "a".repeat(32);
    for (const path of ["api/public/leads", "api/public/automations", "api/public/calendar", "api/public/ads-conversions", "pay", "quote"]) {
      const out = scrubResult({ url: `https://workbenchfsm.com/${path}/${token}` }) as { url: string };
      assert.equal(out.url, LINK_WITHHELD, path);
    }
    assert.equal((scrubResult({ url: "https://workbenchfsm.com/help/leads" }) as { url: string }).url, "https://workbenchfsm.com/help/leads");
  });

  console.log("server-side fetches");
  await test("private, shared and disguised addresses are refused", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.1", "172.20.0.1", "100.64.0.1", "100.127.255.255", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1"]) {
      assert.equal(isPrivateIp(ip), true, ip);
    }
    for (const ip of ["8.8.8.8", "100.63.255.255", "100.128.0.1", "2606:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808"]) {
      assert.equal(isPrivateIp(ip), false, ip);
    }
  });
  await test("a web-push endpoint must belong to a browser's push service", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2-by3p.notify.windows.com/w/?token=abc",
    ]) assert.equal(isPushServiceEndpoint(ok), true, ok);
    for (const bad of [
      "https://internal.railway.internal/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilfcm.googleapis.com/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "not a url",
    ]) assert.equal(isPushServiceEndpoint(bad), false, bad);
  });

  console.log("console session");
  await test("a console token says when it was minted; the old check still answers the user", async () => {
    const before = Date.now();
    const token = await createSuperadminSessionToken("user_1");
    const read = await readSuperadminSessionToken(token);
    assert.ok(read);
    assert.equal(read.userId, "user_1");
    assert.ok(read.issuedAt >= before - 5 && read.issuedAt <= Date.now() + 5);
    assert.equal(await verifySuperadminSessionToken(token), "user_1");
    assert.equal(await readSuperadminSessionToken(token.slice(0, -2) + "xx"), null);
  });

  console.log("public pay / quote pages");
  await test("an open-form document against a client already on file shows nothing about them", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    const old = new Date("2026-06-01T12:00:00Z");
    assert.equal(withholdsClient({ openForm: true, docCreatedAt: now, contactCreatedAt: old }), true);
    // made by this very form: they typed it, they may see it
    assert.equal(withholdsClient({ openForm: true, docCreatedAt: now, contactCreatedAt: new Date(now.getTime() - 3_000) }), false);
    // the team's own invoices and quotes are untouched
    assert.equal(withholdsClient({ openForm: false, docCreatedAt: now, contactCreatedAt: old }), false);
    assert.equal(withholdsClient({ openForm: true, docCreatedAt: now, contactCreatedAt: null }), false);
  });

  console.log("Atlas voice");
  await test("team, settings, automation and payment-record cards take a tap; ordinary ones can be spoken", () => {
    const card = (kind: string, extra: object = {}) => ({ id: "1", kind, title: "t", lines: [], endpoint: "/api/app/x", method: "POST", payload: {}, ...extra }) as never;
    for (const kind of ["add_team_member", "update_team_member", "update_team_policy", "manage_automation", "update_company_settings", "manage_lead_webhook", "record_payment"]) {
      assert.equal(voiceConfirmable(card(kind)), false, kind);
    }
    assert.equal(voiceConfirmable(card("update_client")), true);
    assert.equal(voiceConfirmable(card("update_client", { money: true })), false);
    assert.equal(voiceConfirmable(card("update_client", { danger: true })), false);
  });

  console.log("free-tool email");
  await test("the overall daily ceiling is 300 unless the environment says otherwise", () => {
    delete process.env.TOOLS_EMAIL_DAILY_CAP;
    assert.equal(overallDailyCap(), 300);
    process.env.TOOLS_EMAIL_DAILY_CAP = "1000";
    assert.equal(overallDailyCap(), 1000);
    process.env.TOOLS_EMAIL_DAILY_CAP = "nonsense";
    assert.equal(overallDailyCap(), 300);
    delete process.env.TOOLS_EMAIL_DAILY_CAP;
  });

  console.log("live voice metering");
  await test("a session is prepaid, reports are charged only past that, and seconds never exceed its age", () => {
    const startedAt = new Date("2026-11-23T12:00:00Z");
    const fresh = { startedAt, inSeconds: 0, outSeconds: 0, chargedCents: PREPAID_CENTS };
    // 20 s each way is inside the prepaid half minute: nothing more to charge
    const small = applyReport(fresh, { inSeconds: 20, outSeconds: 20 }, new Date(startedAt.getTime() + 30_000));
    assert.ok(small);
    assert.equal(small.chargeNow, 0);
    // two minutes each way owes more than was prepaid
    const big = applyReport(fresh, { inSeconds: 120, outSeconds: 120 }, new Date(startedAt.getTime() + 130_000));
    assert.ok(big);
    assert.ok(Math.abs(big.chargedCents - audioCents(120, 120)) < 1e-9);
    assert.ok(Math.abs(big.chargeNow - (audioCents(120, 120) - PREPAID_CENTS)) < 1e-9);
    // an hour claimed one minute in is cut to the session's age (+ a minute of slack)
    const clamp = applyReport(fresh, { inSeconds: 3600, outSeconds: 3600 }, new Date(startedAt.getTime() + 60_000));
    assert.ok(clamp);
    assert.equal(clamp.inSeconds, 120);
    assert.equal(clamp.outSeconds, 120);
    // garbage and negative numbers add nothing; a report for a long-dead session is ignored
    const junk = applyReport(fresh, { inSeconds: NaN, outSeconds: -5 }, new Date(startedAt.getTime() + 60_000));
    assert.ok(junk);
    assert.equal(junk.inSeconds + junk.outSeconds, 0);
    assert.equal(applyReport(fresh, { inSeconds: 10, outSeconds: 10 }, new Date(startedAt.getTime() + 2 * 3600_000)), null);
  });
  await test("a login is paused after too many silent sessions or too many sessions in a day", () => {
    assert.equal(mintVerdict({ sessions24h: 0, unreported24h: 0 }), "ok");
    assert.equal(mintVerdict({ sessions24h: MAX_SESSIONS_PER_DAY - 1, unreported24h: UNREPORTED_LIMIT - 1 }), "ok");
    assert.equal(mintVerdict({ sessions24h: MAX_SESSIONS_PER_DAY, unreported24h: 0 }), "daily-cap");
    assert.equal(mintVerdict({ sessions24h: 20, unreported24h: UNREPORTED_LIMIT }), "unreported");
  });

  console.log("cards");
  await test("a plan edit and a long message never go out on a spoken yes", () => {
    const card = (kind: string, extra: object = {}) => ({ id: "1", kind, title: "t", lines: [], endpoint: "/api/app/x", method: "POST", payload: {}, ...extra }) as never;
    assert.equal(voiceConfirmable(card("manage_subscription")), false);
    assert.equal(voiceConfirmable(card("email_client", { fullText: "x".repeat(900) })), false);
    assert.equal(voiceConfirmable(card("email_client")), true);
  });

  console.log("price-book ids on lines");
  await test("an id that is not the company's own is cleared; its own and hand-typed lines are untouched", () => {
    const lines = [{ name: "Mow", workItemId: "mine" }, { name: "Edge", workItemId: "theirs" }, { name: "Typed" }, { name: "Odd", workItemId: 42 }, { name: "Null", workItemId: null }];
    clearForeignWorkItemIds(lines, new Set(["mine"]));
    assert.deepEqual(lines.map((l) => l.workItemId), ["mine", null, undefined, null, null]);
  });

  console.log("visitor address");
  await test("cf-connecting-ip is believed only when Cloudflare's shared header is there", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    const saved = process.env.EDGE_SHARED_SECRET;
    try {
      delete process.env.EDGE_SHARED_SECRET;
      assert.equal(clientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9, 2.2.2.2" })), "1.1.1.1");
      process.env.EDGE_SHARED_SECRET = "s3cret-value";
      // typed by a caller who reached the host directly: ignored, keyed on what the hosting proxy saw
      assert.equal(clientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9, 2.2.2.2" })), "2.2.2.2");
      assert.equal(clientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-wb-edge": "wrong-value!", "x-forwarded-for": "2.2.2.2" })), "2.2.2.2");
      assert.equal(clientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-wb-edge": "s3cret-value", "x-forwarded-for": "2.2.2.2" })), "1.1.1.1");
      assert.equal(cameThroughEdge(h({ "x-wb-edge": "s3cret-value" })), true);
      process.env.EDGE_SHARED_SECRET = "off";
      assert.equal(clientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })), "2.2.2.2");
    } finally {
      if (saved === undefined) delete process.env.EDGE_SHARED_SECRET;
      else process.env.EDGE_SHARED_SECRET = saved;
    }
  });

  console.log("pinned requests");
  await test("a private or non-https address is refused before any connection", async () => {
    for (const u of ["https://127.0.0.1/", "https://[::1]/", "https://10.0.0.1/x", "https://169.254.169.254/latest/meta-data/", "http://example.com/", "https://user:pw@example.com/", "not a url"]) {
      assert.equal(await pinnedHttpsRequest(u, { timeoutMs: 2000 }), null, u);
    }
  });

  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
