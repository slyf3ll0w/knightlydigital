/**
 * lib/embed-query.ts — what an embed's in-frame links carry and which
 * auto-resize keys a frame answers to.
 *   npx tsx scripts/test-embed-query.ts
 */
import assert from "node:assert/strict";
import { EMBED_QUERY_KEYS, embedQuery, resizeKeys, withEmbedQuery } from "../lib/embed-query";

// ── the placement's query rides every in-frame link ──
assert.equal(embedQuery({}), "");
assert.equal(embedQuery(undefined), "");
assert.equal(embedQuery({ theme: "dark" }), "?theme=dark");
assert.equal(embedQuery({ match: "0", theme: "light" }), "?theme=light&match=0", "keys in a fixed order");
assert.equal(embedQuery({ transparent: "1", accent: "22c55e", font: "Lexend", preview: "1", src: "truck" }), "?transparent=1&accent=22c55e&font=Lexend&preview=1&src=truck");
assert.equal(embedQuery({ service: "mow", prefill: "abc", theme: "dark" }), "?theme=dark", "a form's own params are not carried");
assert.equal(embedQuery({ theme: ["dark", "light"] }), "?theme=dark", "a repeated param takes the first");
assert.equal(embedQuery({ theme: "" }), "", "an empty value is nothing");
assert.equal(embedQuery(new URLSearchParams("match=0&x=1")), "?match=0", "URLSearchParams works too");
assert.ok(embedQuery({ accent: "x".repeat(200) }).length < 120, "values are clipped");
assert.ok((EMBED_QUERY_KEYS as readonly string[]).includes("match") && (EMBED_QUERY_KEYS as readonly string[]).includes("theme"));

assert.equal(withEmbedQuery("/embed/acme/visit", ""), "/embed/acme/visit");
assert.equal(withEmbedQuery("/embed/acme/visit", "?theme=dark"), "/embed/acme/visit?theme=dark");
assert.equal(withEmbedQuery("/embed/acme/visit?service=mow", "?match=0"), "/embed/acme/visit?service=mow&match=0", "merges into an existing query");
assert.equal(withEmbedQuery("/embed/acme/visit", "theme=dark"), "/embed/acme/visit?theme=dark", "with or without the ?");

// ── a renamed business keeps old snippets resizing ──
assert.deepEqual(resizeKeys("new-name"), ["new-name"]);
assert.deepEqual(resizeKeys("new-name", ["old-name"]), ["new-name", "old-name"]);
assert.deepEqual(resizeKeys("new-name", ["old-name", "older"], "visit"), ["new-name/visit", "old-name/visit", "older/visit"]);
assert.deepEqual(resizeKeys("new-name", ["new-name", "old-name", "", "old-name"]), ["new-name", "old-name"], "deduped, blanks dropped");
assert.deepEqual(resizeKeys("acme", [], "estimate/roof"), ["acme/estimate/roof"]);

console.log("test-embed-query: ok");
