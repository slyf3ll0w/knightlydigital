/**
 * Settings → Client pages request rules (lib/client-theme-requests.ts).
 *   npx tsx scripts/test-client-theme-requests.ts
 */
import assert from "node:assert/strict";
import { isDraftToken, publishTargetOf, themePreviewLinks } from "../lib/client-theme-requests";

// Publish targets
assert.deepEqual(publishTargetOf({ draft: true }), { draft: true });
assert.deepEqual(publishTargetOf({ draft: true, expect: "0123456789abcdef" }), { draft: true, expect: "0123456789abcdef" }, "a card names the draft it showed");
assert.deepEqual(publishTargetOf({ draft: true, expect: "nope" }), { draft: true }, "a malformed fingerprint is ignored");
assert.deepEqual(publishTargetOf({ reset: true }), { reset: true });
assert.deepEqual(publishTargetOf({ version: "default" }), { reset: true });
assert.deepEqual(publishTargetOf({ version: 7 }), { version: 7 });
assert.equal(publishTargetOf({ version: 0 }), null);
assert.equal(publishTargetOf({ version: 2.5 }), null);
assert.equal(publishTargetOf({ version: "7" }), null);
assert.equal(publishTargetOf({ draft: "yes" }), null);
assert.equal(publishTargetOf({}), null);
assert.equal(publishTargetOf(null), null);
assert.equal(publishTargetOf([{ draft: true }]), null);
assert.equal(publishTargetOf({ draft: true, version: 3 }), null, "two asks at once");
assert.equal(publishTargetOf({ draft: true, reset: true }), null, "two asks at once");

// Preview links
assert.equal(themePreviewLinks(null, "acme", "mow"), null);
const links = themePreviewLinks("tok_123-abc", "acme", "mow")!;
assert.equal(links.portal, "/client-preview?theme=tok_123-abc&doc=hub");
assert.equal(links.login, "/client-preview?theme=tok_123-abc&doc=login");
assert.equal(links.booking, "/book/acme?preview=1&theme=tok_123-abc");
assert.equal(links.form, "/book/acme/mow?preview=1&theme=tok_123-abc");
assert.equal(themePreviewLinks("tok", "acme", null)!.form, "/client-preview?theme=tok&doc=form");

// Draft token vs the old ?theme=light|dark override and fixtures
assert.equal(isDraftToken("dark"), false);
assert.equal(isDraftToken("light"), false);
assert.equal(isDraftToken("fixture:green-photo"), false);
assert.equal(isDraftToken(undefined), false);
assert.equal(isDraftToken("Zx8_v2-AbCdEfGhIjKlMnOp"), true);
assert.equal(isDraftToken("a".repeat(201)), false);

console.log("test-client-theme-requests: all assertions passed");
