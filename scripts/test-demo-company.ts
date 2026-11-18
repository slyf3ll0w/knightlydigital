/**
 * lib/demo-company-shared.ts + lib/demo-company.ts — the marketing site's
 * demo company (Brightwire Electric): the guard that refuses to reset any
 * other company, the fixed links, and source checks that every reset delete
 * is scoped to the demo company and every outbound sender asks the guard.
 *   npx tsx scripts/test-demo-company.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEMO_BOOKING_ITEM,
  DEMO_BOOKING_PATH,
  DEMO_COMPANY_SLUG,
  DEMO_HUB_PATH,
  DEMO_HUB_TOKEN,
  DEMO_OWNER_EMAIL,
  demoCompanyEnabled,
  demoResetRefusal,
  idsToDelete,
  isDemoAddress,
  isDemoCompanyRecord,
} from "../lib/demo-company-shared";

const demo = { id: "c1", slug: DEMO_COMPANY_SLUG, isTest: true, isPlatform: false, email: DEMO_OWNER_EMAIL };

// ── The reset guard ──
assert.equal(demoResetRefusal(demo), null);
assert.equal(isDemoCompanyRecord(demo), true);
assert.equal(demoResetRefusal({ ...demo, email: "  Demo-Brightwire-Electric@WorkBenchFSM.com " }), null, "inbox match ignores case/space");
assert.match(demoResetRefusal(null)!, /no company/);
assert.match(demoResetRefusal({ ...demo, slug: "summit-plumbing" })!, /slug/);
assert.match(demoResetRefusal({ ...demo, isTest: false })!, /test account/);
assert.match(demoResetRefusal({ ...demo, isPlatform: true })!, /platform/);
assert.match(demoResetRefusal({ ...demo, email: "owner@realbusiness.com" })!, /email/);
assert.match(demoResetRefusal({ ...demo, email: null })!, /email/);
assert.equal(isDemoCompanyRecord({ ...demo, slug: "brightwire-electric-1" }), false);

// ── Fixtures are never in the delete list ──
assert.deepEqual(idsToDelete(["a", "b", "c"], ["b", null, undefined]), ["a", "c"]);
assert.deepEqual(idsToDelete(["a"], ["a"]), []);
assert.deepEqual(idsToDelete([], ["a"]), []);

// ── Addresses ──
assert.equal(isDemoAddress(DEMO_OWNER_EMAIL), true);
assert.equal(isDemoAddress(DEMO_OWNER_EMAIL.toUpperCase()), true);
assert.equal(isDemoAddress("maria.demo@example.com"), false);
assert.equal(isDemoAddress(undefined), false);
assert.equal(isDemoAddress(""), false);

// ── Env switch: on unless DEMO_COMPANY=0 ──
assert.equal(demoCompanyEnabled({}), true);
assert.equal(demoCompanyEnabled({ DEMO_COMPANY: "1" }), true);
assert.equal(demoCompanyEnabled({ DEMO_COMPANY: "0" }), false);

// ── Links the static marketing page uses ──
assert.equal(DEMO_BOOKING_PATH, `/embed/brightwire-electric/${DEMO_BOOKING_ITEM}`);
assert.equal(DEMO_HUB_PATH, `/hub/${DEMO_HUB_TOKEN}`);
// lib/hub-form.ts only accepts hub tokens of 16–128 characters
assert.ok(DEMO_HUB_TOKEN.length >= 16 && DEMO_HUB_TOKEN.length <= 128);
assert.match(DEMO_HUB_TOKEN, /^[a-z0-9-]+$/);
assert.match(DEMO_BOOKING_ITEM, /^[a-z0-9-]+$/);
assert.ok(!["privacy", "sms-terms", "shop", "about"].includes(DEMO_BOOKING_ITEM), "not a reserved item slug");

// ── The shared file stays client-safe (the static page imports it) ──
const shared = readFileSync("lib/demo-company-shared.ts", "utf8");
assert.doesNotMatch(shared, /from ["']@\/lib\/db["']|@prisma\/client/, "demo-company-shared must not import Prisma");

// ── Every delete in resetDemoCompany is scoped to the demo company ──
const src = readFileSync("lib/demo-company.ts", "utf8").replace(/\r\n/g, "\n");
const start = src.indexOf("export async function resetDemoCompany");
const end = src.indexOf("\nexport async function getDemoLinks");
assert.ok(start > 0 && end > start, "resetDemoCompany found");
const reset = src.slice(start, end);
assert.match(reset, /demoResetRefusal\(company\)/, "reset re-checks the guard before deleting");
const deletes = [...reset.matchAll(/\.deleteMany\(\{\s*where:\s*([^)]*?)\s*\}\)/g)].map((m) => m[1]);
assert.ok(deletes.length >= 30, `expected the full delete list, found ${deletes.length}`);
for (const where of deletes) {
  const scoped =
    where === "c" ||
    where === "mine" ||
    /^\{ \.\.\.c, id: \{ not: keep\.\w+ \} \}$/.test(where) ||
    /^\{ \w+Id: keep\.\w+, (quote|invoice): c \}$/.test(where);
  assert.ok(scoped, `unscoped delete in resetDemoCompany: where ${where}`);
}
assert.match(reset, /const c = \{ companyId: demoId \}/);
assert.match(reset, /const mine = \{ contactId: keep\.contactId, contact: c \}/);
// Fixtures are kept: each "everything but" delete names its fixture.
for (const keepId of ["invoiceId", "quoteId", "contactId", "bookingTypeId"]) {
  assert.match(reset, new RegExp(`id: \\{ not: keep\\.${keepId} \\}`), `reset keeps fixture ${keepId}`);
}

// ── Every outbound sender asks the guard ──
const guarded: [string, RegExp][] = [
  ["lib/email.ts", /isDemoCompanyId\(companyId\)/],
  ["lib/email.ts", /isDemoAddress\(to\) \|\| isDemoAddress\(replyTo\)/],
  ["lib/sms.ts", /isDemoCompanyId\(companyId\)/],
  ["lib/push.ts", /demoCompanyId\(\)/],
  ["lib/push.ts", /isDemoContactId\(contactId\)/],
  ["lib/voice.ts", /isDemoCompanyId\(companyId\)/],
  ["lib/automations-actions.ts", /isDemoCompanyId\(companyId\)/],
  ["lib/plan-billing.ts", /isDemoCompanyId\(companyId\)/],
  ["app/api/cron/recurring/route.ts", /step\("demoCompany", \(\) => resetDemoCompany\(now\)\)/],
];
for (const [file, re] of guarded) {
  assert.match(readFileSync(file, "utf8"), re, `${file} is missing its demo-company guard`);
}

console.log("demo-company: all checks passed");
