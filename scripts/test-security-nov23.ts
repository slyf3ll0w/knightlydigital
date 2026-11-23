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
import { isPushServiceEndpoint } from "../lib/public-fetch";

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

  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
