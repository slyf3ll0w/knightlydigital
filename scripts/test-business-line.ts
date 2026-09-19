/**
 * Unit tests for the business-line state machine (lib/business-line.ts):
 * how the three Telnyx statuses (brand identity, campaign, number binding)
 * collapse into ours, the area-code normalizer, and the registration form
 * validator.
 *   npx tsx scripts/test-business-line.ts
 * Needs a placeholder DATABASE_URL (the module imports Prisma, never queries).
 */
import assert from "node:assert/strict";
import {
  deriveRegistration,
  normalizeAreaCode,
  sanitizeRegistrationForm,
  campaignCopy,
  LineError,
} from "../lib/business-line";

// ── deriveRegistration ───────────────────────────────────────────────────────

const base = { entityType: "PRIVATE_PROFIT", hasCampaign: false } as const;

// Brand still being checked → pending, nothing to do yet
assert.deepEqual(deriveRegistration({ ...base, brandStatus: "SELF_DECLARED" }), {
  status: "BRAND_PENDING",
  reason: null,
  next: null,
});
assert.equal(deriveRegistration({ ...base, brandStatus: null }).status, "BRAND_PENDING");

// EIN brand UNVERIFIED = TCR couldn't match the EIN → rejected with a useful reason
{
  const d = deriveRegistration({ ...base, brandStatus: "UNVERIFIED" });
  assert.equal(d.status, "REJECTED");
  assert.match(d.reason ?? "", /EIN/);
}
// …with Telnyx's own reason when there is one
assert.equal(
  deriveRegistration({ ...base, brandStatus: "UNVERIFIED", brandFailure: "Tax ID mismatch" }).reason,
  "Tax ID mismatch"
);
// Registration failed outright
assert.equal(deriveRegistration({ ...base, brandRegistration: "REGISTRATION_FAILED" }).status, "REJECTED");

// Sole prop UNVERIFIED means "PIN not entered yet", not rejected
assert.deepEqual(deriveRegistration({ entityType: "SOLE_PROPRIETOR", hasCampaign: false, brandStatus: "UNVERIFIED" }), {
  status: "BRAND_PENDING",
  reason: null,
  next: "await_otp",
});

// Verified brand, no campaign → create one
assert.deepEqual(deriveRegistration({ ...base, brandStatus: "VERIFIED" }), {
  status: "CAMPAIGN_PENDING",
  reason: null,
  next: "create_campaign",
});
assert.equal(deriveRegistration({ ...base, brandStatus: "VETTED_VERIFIED" }).next, "create_campaign");

// Campaign exists, number not bound yet → bind it
assert.deepEqual(
  deriveRegistration({ ...base, brandStatus: "VERIFIED", hasCampaign: true, campaignStatus: "TCR_ACCEPTED" }),
  { status: "CAMPAIGN_PENDING", reason: null, next: "assign_number" }
);

// Bound but carriers still reviewing → pending, nothing to do
assert.deepEqual(
  deriveRegistration({
    ...base,
    brandStatus: "VERIFIED",
    hasCampaign: true,
    campaignStatus: "MNO_PENDING",
    assignmentStatus: "PENDING_ASSIGNMENT",
  }),
  { status: "CAMPAIGN_PENDING", reason: null, next: null }
);

// Carriers accepted + number assigned → ACTIVE
for (const campaignStatus of ["MNO_ACCEPTED", "MNO_PROVISIONED"]) {
  assert.equal(
    deriveRegistration({ ...base, brandStatus: "VERIFIED", hasCampaign: true, campaignStatus, assignmentStatus: "ASSIGNED" }).status,
    "ACTIVE",
    campaignStatus
  );
}
// Accepted but the binding is still pending → not active yet
assert.equal(
  deriveRegistration({ ...base, brandStatus: "VERIFIED", hasCampaign: true, campaignStatus: "MNO_ACCEPTED", assignmentStatus: "PENDING_ASSIGNMENT" }).status,
  "CAMPAIGN_PENDING"
);

// Every campaign failure state rejects, carrying Telnyx's reason
for (const campaignStatus of ["TCR_FAILED", "TCR_EXPIRED", "TCR_SUSPENDED", "TELNYX_FAILED", "MNO_REJECTED", "MNO_PROVISIONING_FAILED"]) {
  const d = deriveRegistration({
    ...base,
    brandStatus: "VERIFIED",
    hasCampaign: true,
    campaignStatus,
    campaignFailure: "Sample messages missing opt-out language",
  });
  assert.equal(d.status, "REJECTED", campaignStatus);
  assert.equal(d.reason, "Sample messages missing opt-out language");
}
assert.equal(
  deriveRegistration({ ...base, brandStatus: "VERIFIED", hasCampaign: true, campaignSubmission: "FAILED" }).status,
  "REJECTED"
);
assert.equal(
  deriveRegistration({ ...base, brandStatus: "VERIFIED", hasCampaign: true, campaignStatus: "MNO_ACCEPTED", assignmentStatus: "FAILED_ASSIGNMENT" }).status,
  "REJECTED"
);

// ── normalizeAreaCode ────────────────────────────────────────────────────────

assert.equal(normalizeAreaCode("214"), "214");
assert.equal(normalizeAreaCode("(469) 555-0100"), "469");
assert.equal(normalizeAreaCode("+1 972 555 0100"), "972");
assert.equal(normalizeAreaCode("1-817-555-0100"), "817");
assert.equal(normalizeAreaCode("21"), null);
assert.equal(normalizeAreaCode("011"), null, "area codes never start with 0/1");
assert.equal(normalizeAreaCode(""), null);
assert.equal(normalizeAreaCode(null), null);

// ── sanitizeRegistrationForm ─────────────────────────────────────────────────

const good = {
  entityType: "PRIVATE_PROFIT",
  legalName: "Streamflaire LLC",
  displayName: "Streamflaire",
  ein: "12-3456789",
  street: "100 Main St",
  city: "Allen",
  state: "tx",
  postalCode: "75013-1234",
  website: "streamflaire.com",
  vertical: "TECHNOLOGY",
  contactFirstName: "David",
  contactLastName: "Lessly",
  contactEmail: "Info@Streamflaire.com",
  contactPhone: "(469) 833-5853",
};
{
  const f = sanitizeRegistrationForm(good);
  assert.equal(f.ein, "123456789", "EIN stored as 9 digits");
  assert.equal(f.state, "TX");
  assert.equal(f.postalCode, "75013", "5-digit ZIP");
  assert.equal(f.website, "https://streamflaire.com", "scheme added");
  assert.equal(f.contactEmail, "info@streamflaire.com");
  assert.equal(f.contactPhone, "+14698335853", "E.164");
}
const rejects = (patch: Record<string, unknown>, re: RegExp) => {
  try {
    sanitizeRegistrationForm({ ...good, ...patch });
    assert.fail(`expected rejection for ${JSON.stringify(patch)}`);
  } catch (err) {
    assert.ok(err instanceof LineError, `LineError expected for ${JSON.stringify(patch)}, got ${String(err)}`);
    assert.match(err.message, re);
  }
};
rejects({ ein: "1234" }, /EIN/);
rejects({ street: "PO Box 12" }, /PO box/i);
rejects({ street: "P.O. Box 12" }, /PO box/i);
rejects({ state: "Texas" }, /state/);
rejects({ postalCode: "7501" }, /ZIP/);
rejects({ vertical: "SPACE" }, /industry/);
rejects({ contactEmail: "nope" }, /email/);
rejects({ contactPhone: "123" }, /phone/);
rejects({ website: "not a url at all" }, /website/);
// Sole prop: no EIN needed, the mobile is what gets the PIN
{
  const f = sanitizeRegistrationForm({ ...good, entityType: "SOLE_PROPRIETOR", ein: "" });
  assert.equal(f.entityType, "SOLE_PROPRIETOR");
  assert.equal(f.ein, null);
}
// Display name falls back to legal name
assert.equal(sanitizeRegistrationForm({ ...good, displayName: "" }).displayName, "Streamflaire LLC");

// ── campaignCopy: what the carriers review ───────────────────────────────────

{
  const c = campaignCopy("Acme Plumbing", "https://acme.example");
  assert.equal(c.samples.length, 5, "five samples");
  for (const s of c.samples) {
    assert.match(s, /Acme Plumbing/, "every sample names the business");
    assert.match(s, /Reply STOP to opt out/, "every sample carries opt-out language");
    assert.ok(s.length <= 320, "sample fits two segments");
  }
  assert.match(c.messageFlow, /acme\.example/);
  assert.match(c.messageFlow, /STOP/);
}

console.log("test-business-line: all assertions passed");

// ── Toll-free path ───────────────────────────────────────────────────────────

import { deriveTollFree } from "../lib/business-line";
import { isTollFreeNumber } from "../lib/telnyx";
import { stateName } from "../lib/us-states";

assert.deepEqual(deriveTollFree("Verified"), { status: "ACTIVE", reason: null, next: null });
assert.equal(deriveTollFree("Rejected", "Website does not match business").reason, "Website does not match business");
assert.equal(deriveTollFree("Rejected").status, "REJECTED");
// Reviewer wants more info: surfaced as a rejection so the resubmit path (PATCH) is offered
assert.equal(deriveTollFree("Waiting For Customer", "Please add an opt-in screenshot").status, "REJECTED");
for (const s of ["In Progress", "Waiting For Vendor", "Waiting For Telnyx", null, undefined]) {
  assert.equal(deriveTollFree(s).status, "CAMPAIGN_PENDING", String(s));
}

for (const n of ["+18334950229", "+18005550100", "+18885550100", "+18775550100", "+18665550100", "+18555550100", "+18445550100"]) {
  assert.ok(isTollFreeNumber(n), n);
}
assert.ok(!isTollFreeNumber("+18225550100"), "822 is not toll-free yet");
assert.ok(!isTollFreeNumber("+12145550100"));

assert.equal(stateName("tx"), "Texas");
assert.equal(stateName("DC"), "District of Columbia");
assert.equal(stateName("ZZ"), "ZZ", "unknown codes pass through");

// Toll-free form: website + EIN required, sole prop not offered, volume/use-case defaulted
{
  const f = sanitizeRegistrationForm({ ...good, messageVolume: "10,000", useCase: "Mixed" }, "TOLL_FREE");
  assert.equal(f.messageVolume, "10,000");
  assert.equal(f.useCase, "Mixed");
  const d = sanitizeRegistrationForm({ ...good, messageVolume: "bogus", useCase: "bogus" }, "TOLL_FREE");
  assert.equal(d.messageVolume, "1,000");
  assert.equal(d.useCase, "Appointments");
  assert.equal(sanitizeRegistrationForm({ ...good, entityType: "SOLE_PROPRIETOR" }, "TOLL_FREE").entityType, "PRIVATE_PROFIT");
}
const rejectsTf = (patch: Record<string, unknown>, re: RegExp) => {
  try {
    sanitizeRegistrationForm({ ...good, ...patch }, "TOLL_FREE");
    assert.fail(`expected toll-free rejection for ${JSON.stringify(patch)}`);
  } catch (err) {
    assert.ok(err instanceof LineError, `LineError expected for ${JSON.stringify(patch)}, got ${String(err)}`);
    assert.match(err.message, re);
  }
};
rejectsTf({ website: "" }, /website/);
rejectsTf({ ein: "" }, /EIN/);
// …while 10DLC still allows a blank website
assert.equal(sanitizeRegistrationForm({ ...good, website: "" }).website, null);
// 10DLC ignores the toll-free-only fields
assert.equal(sanitizeRegistrationForm({ ...good, messageVolume: "10,000" }).messageVolume, null);

console.log("test-business-line (toll-free): all assertions passed");

// ── Number rights after cancellation ─────────────────────────────────────────

import { lineReleasePlan } from "../lib/business-line";

const now = new Date("2026-09-19T12:00:00Z");
const later = new Date(now.getTime() + 31 * 86_400_000);
const soon = new Date(now.getTime() + 5 * 86_400_000);
const active = new Date("2026-08-01T00:00:00Z");

// Subscribed: nothing to do; a leftover schedule is cleared (they resubscribed)
assert.equal(lineReleasePlan({ lineNumber: "+12145550100", addonActiveAt: active, lineReleaseAt: null }, now), null);
assert.equal(lineReleasePlan({ lineNumber: "+12145550100", addonActiveAt: active, lineReleaseAt: soon }, now), "clear");
// Lapsed with a number: schedule first, wait, release once the date passes
assert.equal(lineReleasePlan({ lineNumber: "+12145550100", addonActiveAt: null, lineReleaseAt: null }, now), "stamp");
assert.equal(lineReleasePlan({ lineNumber: "+12145550100", addonActiveAt: null, lineReleaseAt: soon }, now), null);
assert.equal(lineReleasePlan({ lineNumber: "+12145550100", addonActiveAt: null, lineReleaseAt: now }, now), "release");
assert.equal(lineReleasePlan({ lineNumber: "+12145550100", addonActiveAt: null, lineReleaseAt: soon }, later), "release");
// No number (or only a provisioning claim): never stamp; clear a stale date
assert.equal(lineReleasePlan({ lineNumber: null, addonActiveAt: null, lineReleaseAt: null }, now), null);
assert.equal(lineReleasePlan({ lineNumber: "pending:abc", addonActiveAt: null, lineReleaseAt: null }, now), null);
assert.equal(lineReleasePlan({ lineNumber: null, addonActiveAt: null, lineReleaseAt: soon }, now), "clear");

console.log("test-business-line (number rights): all assertions passed");
