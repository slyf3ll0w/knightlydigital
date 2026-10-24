/**
 * Unit tests for lib/change-request.ts — "Suggest a change" tickets.
 *   npx tsx scripts/test-change-request.ts
 */
import assert from "node:assert/strict";
import {
  CHANGE_REQUEST_TAG,
  DETAILS_SEPARATOR,
  changeRequestDetails,
  changeRequestTitle,
  describeTarget,
  pathOf,
  sanitizeCapture,
  shortTicketId,
} from "../lib/change-request";

const actor = { name: "Dana Tester", id: "user_1", role: "OWNER", companyId: "co_1", companyName: "Brightwire Electric" };

// ── sanitizeCapture clamps and defaults ──────────────────────────────────────
{
  const c = sanitizeCapture(null);
  assert.equal(c.kind, "looks");
  assert.equal(c.target, null);
  assert.equal(c.shot, "none");
  assert.deepEqual(c.diag, { errors: [], requests: [] });
  assert.ok(c.capturedAt);
}
{
  const c = sanitizeCapture({
    kind: "works",
    shot: "auto",
    target: { tag: "BUTTON", text: "x".repeat(500), classes: "ds-btn", attrs: { "aria-label": "Save", bogus: 5 }, path: "main > button", html: "<button>".repeat(2000), rect: { x: 1.4, y: 2, w: 100, h: 40 } },
    page: { url: "https://app.test/app/jobs/1?tab=notes", title: "Job", history: ["/app", "/app/jobs", 7], viewport: { w: 390, h: 844, dpr: 3 }, theme: "dark", ua: "UA", platform: "iPhone", standalone: true, lang: "en-US", online: false },
    diag: {
      errors: [{ at: "12:00:00", kind: "console", message: "boom" }, { message: "" }, "junk"],
      requests: [{ at: "12:00:01", method: "post", url: "/api/app/jobs", status: 500, ms: 120.6 }, { url: "" }],
    },
  });
  assert.equal(c.kind, "works");
  assert.equal(c.shot, "auto");
  assert.equal(c.target?.tag, "button");
  assert.equal(c.target?.text.length, 200, "text clamped");
  assert.equal(c.target?.html.length, 4000, "html clamped");
  assert.deepEqual(c.target?.attrs, { "aria-label": "Save" }, "non-string attrs dropped");
  assert.deepEqual(c.target?.rect, { x: 1, y: 2, w: 100, h: 40 });
  assert.deepEqual(c.page.history, ["/app", "/app/jobs"], "non-string history dropped");
  assert.equal(c.page.online, false);
  assert.equal(c.diag.errors.length, 1, "empty / junk errors dropped");
  assert.equal(c.diag.requests.length, 1);
  assert.equal(c.diag.requests[0].method, "POST");
  assert.equal(c.diag.requests[0].ms, 121);
}
{
  // unknown kind / shot fall back; oversized lists are trimmed to the newest
  const c = sanitizeCapture({ kind: "nope", shot: "maybe", diag: { errors: Array.from({ length: 50 }, (_, i) => ({ message: `e${i}` })) } });
  assert.equal(c.kind, "looks");
  assert.equal(c.shot, "none");
  assert.equal(c.diag.errors.length, 30);
  assert.equal(c.diag.errors[29].message, "e49", "newest kept");
}

// ── describeTarget / title / pathOf ──────────────────────────────────────────
{
  assert.equal(describeTarget(null), "the whole page");
  const c = sanitizeCapture({ target: { tag: "button", text: "Save" }, page: { url: "https://x/app/jobs/1?tab=notes" } });
  assert.equal(describeTarget(c.target), "button “Save”");
  const t = changeRequestTitle("make this bigger and move it under the price", c);
  assert.equal(t, "Change: make this bigger and move it under the price — button “Save” on /app/jobs/1?tab=notes");
  const long = changeRequestTitle("x".repeat(300), c);
  assert.ok(long.length <= 200);
  assert.ok(long.startsWith("Change: " + "x".repeat(70) + "…"), "note truncated at 70");
  assert.equal(pathOf("https://workbenchfsm.com/app/leads?x=1"), "/app/leads?x=1");
  assert.equal(pathOf("garbage"), "/garbage");
}
{
  // no text → aria-label, then the bare tag
  const c = sanitizeCapture({ target: { tag: "button", attrs: { "aria-label": "Close assistant" } } });
  assert.equal(describeTarget(c.target), "button “Close assistant”");
  assert.equal(describeTarget(sanitizeCapture({ target: { tag: "div" } }).target), "div");
}

// ── changeRequestDetails: sections in order, first one is the note ────────────
{
  const c = sanitizeCapture({
    kind: "both",
    shot: "own",
    target: { tag: "button", text: "Save", classes: "ds-btn ds-btn-primary", attrs: { type: "submit" }, path: "main > form > button.ds-btn", html: '<button class="ds-btn">Save</button>', rect: { x: 10, y: 20, w: 100, h: 40 } },
    page: { url: "https://x/app/jobs/1", title: "Job · WorkBench", history: ["/app/dashboard", "/app/jobs"], viewport: { w: 1440, h: 900, dpr: 2 }, theme: "light", ua: "UA", platform: "Windows", standalone: false, lang: "en-US", online: true },
    diag: { errors: [{ at: "12:00:00", kind: "console", message: "boom" }], requests: [{ at: "12:00:01", method: "POST", url: "/api/app/jobs/1", status: 500, ms: 120 }] },
  });
  const d = changeRequestDetails("  Make it green  ", c, actor);
  const sections = d.split(DETAILS_SEPARATOR);
  assert.equal(sections.length, 6);
  assert.equal(sections[0], "WHAT TO CHANGE (Looks and works)\nMake it green");
  assert.ok(sections[1].startsWith("WHERE\npage: /app/jobs/1 — Job · WorkBench\ntarget: button “Save”\npath: main > form > button.ds-btn\nbox: 100×40 at (10, 20)\ncame from: /app/dashboard → /app/jobs"), sections[1]);
  assert.ok(sections[2].startsWith('ELEMENT\n<button type="submit">\nclasses: ds-btn ds-btn-primary\ntext: Save\n'), sections[2]);
  assert.ok(sections[2].includes('<button class="ds-btn">Save</button>'));
  assert.ok(sections[3].includes("viewport: 1440×900 @2x · light · browser tab"), sections[3]);
  assert.ok(sections[3].includes("picture: attached by the user"));
  assert.ok(sections[3].includes("user: Dana Tester (user_1) · role OWNER · company Brightwire Electric co_1"));
  assert.equal(sections[4], "RECENT ERRORS\n12:00:00 console: boom");
  assert.equal(sections[5], "FAILED REQUESTS\n12:00:01 POST /api/app/jobs/1 → 500 (120 ms)");
}
{
  // whole page, nothing captured: still every section, with honest placeholders
  const d = changeRequestDetails("Too much white space", sanitizeCapture({ page: { url: "https://x/app/leads" } }), actor);
  const sections = d.split(DETAILS_SEPARATOR);
  assert.equal(sections.length, 5, "no ELEMENT section without a target");
  assert.ok(sections[1].includes("target: the whole page"));
  assert.ok(sections[3].endsWith("(none in the last few minutes)"));
  assert.ok(sections[4].endsWith("(none in the last few minutes)"));
}

assert.equal(CHANGE_REQUEST_TAG, "change-request");
assert.equal(shortTicketId("clzx1abcdefghij0123456"), "123456");

console.log("test-change-request: all passed");
