// npx tsx scripts/test-meta-leads-shape.ts
// Facebook lead forms: the webhook's signature, what a notice names, and
// what a lead's answers become (lib/meta-leads-shape.ts). No network.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  LEAD_FIELDS,
  formLeadSource,
  isLeadsAccessRefusal,
  leadFromFacebook,
  parseClientBusinessId,
  parseDatasets,
  parseLeadgenNotices,
  parsePages,
  verifyMetaSignature,
} from "../lib/meta-leads-shape";
import { splitFullName } from "../lib/lead-intake";
import { canonicalLeadSource } from "../lib/lead-source";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
}

const SECRET = "app-secret-for-tests";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
const notice = (over: Record<string, unknown> = {}) => ({
  object: "page",
  entry: [{ id: "111222333444555", time: 1763600000, changes: [{ field: "leadgen", value: { leadgen_id: "1234567890123456", page_id: "111222333444555", form_id: "999888777666555", ad_id: "23850000000000001", adgroup_id: "23850000000000002", created_time: 1763600000, ...over } }] }],
});

console.log("the signature");
t("Facebook's signature of the exact body passes", () => {
  const body = JSON.stringify(notice());
  assert.equal(verifyMetaSignature(body, sign(body), SECRET), true);
});
t("TRAP: a body changed by one character fails", () => {
  const body = JSON.stringify(notice());
  assert.equal(verifyMetaSignature(body.replace("1234567890123456", "1234567890123457"), sign(body), SECRET), false);
});
t("TRAP: signed with another secret, the old sha1 header, no header, or junk all fail", () => {
  const body = JSON.stringify(notice());
  assert.equal(verifyMetaSignature(body, sign(body, "someone-else"), SECRET), false);
  assert.equal(verifyMetaSignature(body, sign(body).replace("sha256=", "sha1="), SECRET), false);
  assert.equal(verifyMetaSignature(body, null, SECRET), false);
  assert.equal(verifyMetaSignature(body, "sha256=zz", SECRET), false);
  assert.equal(verifyMetaSignature(body, "", SECRET), false);
});
t("TRAP: with no app secret on the server nothing passes, not even an empty-key signature", () => {
  const body = JSON.stringify(notice());
  assert.equal(verifyMetaSignature(body, sign(body, ""), undefined), false);
  assert.equal(verifyMetaSignature(body, sign(body, ""), ""), false);
});
t("a body with accents is signed over its bytes", () => {
  const body = JSON.stringify({ object: "page", entry: [], note: "José Peña" });
  assert.equal(verifyMetaSignature(body, sign(body), SECRET), true);
});

console.log("what a notice names");
t("one lead: its id, the Page, the form and the ad", () => {
  assert.deepEqual(parseLeadgenNotices(notice()), [{ leadgenId: "1234567890123456", pageId: "111222333444555", formId: "999888777666555", adId: "23850000000000001" }]);
});
t("Facebook batches: several Pages and several leads in one body", () => {
  const body = {
    object: "page",
    entry: [
      { id: "111", changes: [] },
      { id: "11122233344", changes: [{ field: "leadgen", value: { leadgen_id: "1000000000000001", page_id: "11122233344" } }, { field: "leadgen", value: { leadgen_id: "1000000000000002", page_id: "11122233344" } }] },
      { id: "55566677788", changes: [{ field: "leadgen", value: { leadgen_id: "1000000000000003" } }] },
    ],
  };
  const got = parseLeadgenNotices(body);
  assert.deepEqual(got.map((g) => g.leadgenId), ["1000000000000001", "1000000000000002", "1000000000000003"]);
  // no page_id in the value: the entry's own id is the Page
  assert.equal(got[2].pageId, "55566677788");
  assert.equal(got[2].adId, null);
});
t("TRAP: the same lead named twice in one body comes back once", () => {
  const body = notice();
  body.entry[0].changes.push(body.entry[0].changes[0]);
  assert.equal(parseLeadgenNotices(body).length, 1);
});
t("TRAP: other objects, other fields and junk name nothing", () => {
  assert.deepEqual(parseLeadgenNotices({ object: "user", entry: notice().entry }), []);
  assert.deepEqual(parseLeadgenNotices({ object: "page", entry: [{ id: "111222333444555", changes: [{ field: "feed", value: { leadgen_id: "1234567890123456" } }] }] }), []);
  assert.deepEqual(parseLeadgenNotices(notice({ leadgen_id: "1 OR 1=1" })), []);
  assert.deepEqual(parseLeadgenNotices(null), []);
  assert.deepEqual(parseLeadgenNotices("hello"), []);
  assert.deepEqual(parseLeadgenNotices({ object: "page", entry: "nope" }), []);
});

console.log("what a lead's answers become");
const answers = (fields: [string, string | string[]][], extra: Record<string, unknown> = {}) => ({
  id: "1234567890123456",
  created_time: "2026-11-20T15:00:00+0000",
  ad_id: "23850000000000001",
  form_id: "999888777666555",
  field_data: fields.map(([name, v]) => ({ name, values: Array.isArray(v) ? v : [v] })),
  ...extra,
});
t("a full name is split; email, phone and address are kept", () => {
  const lead = leadFromFacebook(answers([["full_name", "Maria Elena Lopez"], ["email", "maria@example.com"], ["phone_number", "+14695550123"], ["street_address", "412 Oak St"], ["city", "Allen"], ["state", "TX"], ["zip_code", "75002"]]));
  assert.deepEqual(lead, { firstName: "Maria", lastName: "Elena Lopez", email: "maria@example.com", phone: "+14695550123", address: "412 Oak St", city: "Allen", state: "TX", zip: "75002", message: "", adId: "23850000000000001" });
});
t("first and last name fields win over a full name", () => {
  const lead = leadFromFacebook(answers([["full_name", "M Lopez"], ["first_name", "Maria"], ["last_name", "Lopez"], ["phone_number", "4695550123"]]));
  assert.equal(lead?.firstName, "Maria");
  assert.equal(lead?.lastName, "Lopez");
  assert.equal(lead?.email, null);
});
t("one name only gets a dash for the last name, like the lead webhook", () => {
  assert.equal(leadFromFacebook(answers([["full_name", "Cher"], ["email", "cher@example.com"]]))?.lastName, "—");
  assert.deepEqual(splitFullName("  Cher "), { firstName: "Cher", lastName: "—" });
  assert.deepEqual(splitFullName("Maria Elena  Lopez"), { firstName: "Maria", lastName: "Elena Lopez" });
});
t("the advertiser's own questions ride along as lines of the message", () => {
  const lead = leadFromFacebook(answers([["full_name", "Sam Roe"], ["email", "sam@example.com"], ["what_kind_of_fence?", "Cedar privacy"], ["how_soon", ["This month", "ASAP"]]]));
  assert.equal(lead?.message, "What kind of fence?: Cedar privacy\nHow soon: This month, ASAP");
});
t("TRAP: no name, or neither an email nor a phone, is nobody to file", () => {
  assert.equal(leadFromFacebook(answers([["email", "x@example.com"]])), null);
  assert.equal(leadFromFacebook(answers([["full_name", "Sam Roe"], ["city", "Allen"]])), null);
  assert.equal(leadFromFacebook({ id: "1" }), null);
  assert.equal(leadFromFacebook(null), null);
});
t("TRAP: a broken email is dropped, and the lead still files on its phone", () => {
  const lead = leadFromFacebook(answers([["full_name", "Sam Roe"], ["email", "not an email"], ["phone_number", "4695550123"]]));
  assert.equal(lead?.email, null);
  assert.equal(lead?.phone, "4695550123");
});
t("TRAP: control characters and runaway answers are cleaned and capped", () => {
  const lead = leadFromFacebook(answers([["full_name", "Sam\u0000\nRoe"], ["email", "sam@example.com"], ["notes", "x".repeat(9000)]]));
  assert.equal(lead?.firstName, "Sam");
  assert.equal(lead?.lastName, "Roe");
  assert.ok((lead?.message.length ?? 0) <= 1010);
});
t("a form on an ad is filed as Facebook Ads; a form filled in from the Page itself as Facebook", () => {
  assert.equal(formLeadSource({ adId: "23850000000000001" }), "Facebook Ads");
  assert.equal(formLeadSource({ adId: null }), "Facebook");
  assert.equal(leadFromFacebook(answers([["full_name", "Sam Roe"], ["email", "sam@example.com"]], { ad_id: undefined }))?.adId, null);
  // both are standard source names, spelled as the pick list spells them
  assert.equal(canonicalLeadSource("Facebook Ads"), "Facebook Ads");
  assert.equal(canonicalLeadSource("Facebook"), "Facebook");
});
t("only fields Meta's guide documents are asked for", () => {
  assert.equal(LEAD_FIELDS, "created_time,id,ad_id,form_id,field_data");
});

console.log("Pages and refusals");
t("Pages this sign-in can act for, by name; one without a token is left out", () => {
  const pages = parsePages({ data: [{ id: "22233344455", name: "Zed Roofing", access_token: "tokZ", tasks: ["ADVERTISE", "ANALYZE"] }, { id: "11122233344", name: "Acme Fence", access_token: "tokA", tasks: ["ANALYZE"] }, { id: "33344455566", name: "No Token Co" }] });
  assert.deepEqual(pages.map((p) => [p.name, p.canAdvertise]), [["Acme Fence", false], ["Zed Roofing", true]]);
  assert.deepEqual(parsePages(null), []);
});
t("Facebook's leads-access refusal is told apart from an ordinary one", () => {
  assert.equal(isLeadsAccessRefusal({ error: { code: 103, message: "CRM access has been revoked from Lead Access Manager" } }), true);
  assert.equal(isLeadsAccessRefusal({ error: { code: 200, message: "(#200) Requires leads_retrieval permission to read the lead" } }), true);
  assert.equal(isLeadsAccessRefusal({ error: { code: 100, message: "Unsupported get request." } }), false);
  assert.equal(isLeadsAccessRefusal(null), false);
});

console.log("datasets from the sign-in");
t("a business's own and shared datasets are one list by name, each once", () => {
  const owned = { data: [{ id: "2239432240308646", name: "Zed Roofing" }, { id: "1105339769000952", name: "Acme Fence" }] };
  const shared = { data: [{ id: "1105339769000952", name: "Acme Fence (shared)" }, { id: "3300000000000001" }] };
  assert.deepEqual(parseDatasets(owned, shared), [
    { id: "1105339769000952", name: "Acme Fence" },
    { id: "3300000000000001", name: "Dataset 3300000000000001" },
    { id: "2239432240308646", name: "Zed Roofing" },
  ]);
});
t("a personal sign-in's datasets come nested under its ad accounts", () => {
  const accounts = { data: [{ id: "act_1", adspixels: { data: [{ id: "1105339769000952", name: "Acme Fence" }] } }, { id: "act_2" }, { id: "act_3", adspixels: { data: [{ id: "1105339769000952", name: "Acme Fence" }] } }] };
  assert.deepEqual(parseDatasets(accounts), [{ id: "1105339769000952", name: "Acme Fence" }]);
});
t("TRAP: an unavailable dataset, a junk id and a refused list are left out", () => {
  assert.deepEqual(parseDatasets({ data: [{ id: "1105339769000952", name: "Gone", is_unavailable: true }, { id: "act_12", name: "Not a dataset" }, null] }, null, { error: { code: 200 } }), []);
});
t("a system-user sign-in names its business; a personal one does not", () => {
  assert.equal(parseClientBusinessId({ client_business_id: "998877665544332", id: "17841400000000" }), "998877665544332");
  assert.equal(parseClientBusinessId({ id: "17841400000000" }), null);
  assert.equal(parseClientBusinessId(null), null);
});

console.log(`\n${n} checks passed`);
