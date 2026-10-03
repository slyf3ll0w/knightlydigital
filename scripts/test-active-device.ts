/**
 * Unit tests for lib/active-device.ts — one active device per login.
 *   npx tsx scripts/test-active-device.ts
 * Needs a placeholder DATABASE_URL (the module imports Prisma, never queries).
 */
import assert from "node:assert/strict";
import {
  decideDevice,
  deviceLabel,
  deviceRuleEnabled,
  exemptEmail,
  exemptPlan,
  isDeviceId,
  HOLD_REFRESH_MS,
  HOLD_WINDOW_MS,
} from "../lib/active-device";

const T0 = Date.parse("2026-10-02T15:00:00Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs);
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

// ── decideDevice ─────────────────────────────────────────────────────────────

{
  // Nobody holds it → claim
  assert.deepEqual(decideDevice({ activeDeviceId: null, activeDeviceAt: null, activeDeviceLabel: null }, A, at(0)), { kind: "claim" });
}

{
  // Same device, fresh stamp → held, no rewrite; older than the refresh gap → held + refresh
  const hold = { activeDeviceId: A, activeDeviceAt: at(0), activeDeviceLabel: "Chrome on Windows" };
  assert.deepEqual(decideDevice(hold, A, at(5_000)), { kind: "held", refresh: false });
  assert.deepEqual(decideDevice(hold, A, at(HOLD_REFRESH_MS)), { kind: "held", refresh: true });
}

{
  // Other device inside the window → busy, naming the holder
  const hold = { activeDeviceId: A, activeDeviceAt: at(0), activeDeviceLabel: "the iPhone app" };
  const d = decideDevice(hold, B, at(60_000));
  assert.equal(d.kind, "busy");
  if (d.kind === "busy") {
    assert.equal(d.device, "the iPhone app");
    assert.equal(d.since.getTime(), T0);
  }
  // Right at the edge of the window still busy; one ms past → claim
  assert.equal(decideDevice(hold, B, at(HOLD_WINDOW_MS)).kind, "busy");
  assert.deepEqual(decideDevice(hold, B, at(HOLD_WINDOW_MS + 1)), { kind: "claim" });
}

{
  // A hold with no label still reads sensibly
  const d = decideDevice({ activeDeviceId: A, activeDeviceAt: at(0), activeDeviceLabel: null }, B, at(1_000));
  assert.equal(d.kind, "busy");
  if (d.kind === "busy") assert.equal(d.device, "another device");
}

// ── deviceLabel ──────────────────────────────────────────────────────────────

{
  const shellIos = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 StreamflaireHubShell";
  const shellAndroid = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 StreamflaireHubShell";
  const chromeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
  const edgeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";
  const safariIphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const safariMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
  const firefoxLinux = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
  const chromeAndroid = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
  assert.equal(deviceLabel(shellIos), "the iPhone app");
  assert.equal(deviceLabel(shellAndroid), "the Android app");
  assert.equal(deviceLabel(chromeWin), "Chrome on Windows");
  assert.equal(deviceLabel(edgeWin), "Edge on Windows");
  assert.equal(deviceLabel(safariIphone), "Safari on an iPhone");
  assert.equal(deviceLabel(safariMac), "Safari on a Mac");
  assert.equal(deviceLabel(firefoxLinux), "Firefox on Linux");
  assert.equal(deviceLabel(chromeAndroid), "Chrome on an Android phone");
  assert.equal(deviceLabel(null), "a browser");
  assert.equal(deviceLabel("curl/8.0"), "a browser");
}

// ── isDeviceId / exemptions / switch ─────────────────────────────────────────

{
  assert.equal(isDeviceId(A), true);
  assert.equal(isDeviceId("not-a-uuid"), false);
  assert.equal(isDeviceId(undefined), false);
  assert.equal(isDeviceId(""), false);
}

{
  assert.equal(exemptEmail("e2e-owner@workbenchfsm.com", {}), true);
  assert.equal(exemptEmail("E2E-Tenant-B@WorkbenchFSM.com", {}), true);
  assert.equal(exemptEmail("owner@workbenchfsm.com", {}), false);
  assert.equal(exemptEmail("e2e-owner@example.com", {}), false);
  assert.equal(exemptEmail(null, {}), false);
  assert.equal(exemptEmail("demo@shop.com", { ONE_ACTIVE_DEVICE_EXEMPT: "Demo@shop.com, other@x.com" }), true);
  assert.equal(exemptEmail("other@shop.com", { ONE_ACTIVE_DEVICE_EXEMPT: "demo@shop.com" }), false);
}

{
  // Pro / Max never see the wall; Core and Voice do
  assert.equal(exemptPlan({ planGrants: ["SHOP"] }), true);
  assert.equal(exemptPlan({ planGrants: ["DISPATCH", "SHOP", "JOBSITE"] }), true); // Max = every add-on
  assert.equal(exemptPlan({ planGrants: [] }), false);
  assert.equal(exemptPlan({ planGrants: ["DISPATCH"], addonActiveAt: new Date() }), false);
  assert.equal(exemptPlan({ planGrants: ["JOBSITE"] }), false);
  assert.equal(exemptPlan(null), false);
}

{
  assert.equal(deviceRuleEnabled({}), true);
  assert.equal(deviceRuleEnabled({ ONE_ACTIVE_DEVICE: "1" }), true);
  assert.equal(deviceRuleEnabled({ ONE_ACTIVE_DEVICE: "0" }), false);
}

console.log("active-device: all assertions passed");
