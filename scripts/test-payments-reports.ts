/**
 * Unit tests for the Payments page's Square tabs — the pure parts (2026-10-28):
 * period math in a company timezone, totals / breakdowns / CSV
 * (lib/payments-reports), the Square → WorkBench mappers, the WorkBench-vs-
 * outside classifier, the failure classifier and the missing-scopes check
 * (lib/square-seller-reports, lib/square-connection).
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/test-payments-reports.ts
 * (square-connection pulls in the Prisma client; never queried.)
 */
import assert from "node:assert/strict";

process.env.AUTH_SECRET ??= "test-secret-for-payments-reports";
process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-WORKBENCH";
process.env.SQUARE_APPLICATION_SECRET = "sandbox-sq0csb-TEST";
process.env.SQUARE_ENVIRONMENT = "sandbox";
process.env.NEXTAUTH_URL = "https://example.test";
delete process.env.SQUARE_EXTRA_SCOPES;

import {
  breakdownByJobType,
  breakdownByTech,
  buildPaymentsReport,
  groupByPeriod,
  jobTypeOf,
  lastPeriods,
  nextPeriodStart,
  periodKey,
  periodLabel,
  periodStart,
  reportCsv,
  reportCsvFilename,
  summarize,
  type ReportRow,
} from "../lib/payments-reports";
import {
  isWorkBenchPayment,
  mapDisputeEvidence,
  mapPayoutEntry,
  mapSellerDispute,
  mapSellerPayment,
  mapSellerPayout,
  OPEN_DISPUTE_STATES,
  sellerFailure,
  sellerFailureStatus,
  SQUARE_EVIDENCE_MAX_BYTES,
  sumMoney,
  UNRESOLVED_DISPUTE_STATES,
} from "../lib/square-seller-reports";
import { scopesMissingFrom, SquareNotConnectedError } from "../lib/square-connection";
import { SquareError, SQUARE_SCOPES } from "../lib/square";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const TZ = "America/Chicago";
// 2026-10-28 09:00 Chicago (CDT, UTC-5) = 14:00Z
const NOW = new Date("2026-10-28T14:00:00Z");

const row = (over: Partial<ReportRow> & { paidAt: Date }): ReportRow => ({
  id: Math.random().toString(36).slice(2),
  amountCents: 10_000,
  refundedCents: 0,
  feeCents: 0,
  method: "CARD",
  source: "workbench",
  techs: [],
  jobType: null,
  ...over,
});

// ─── Periods ────────────────────────────────────────────────────────────────

test("periodStart: day / week (Sunday) / month in the company zone", () => {
  // 2026-10-28 is a Wednesday; week starts Sunday 2026-10-25
  assert.equal(periodStart(TZ, NOW, "day").toISOString(), "2026-10-28T05:00:00.000Z");
  assert.equal(periodStart(TZ, NOW, "week").toISOString(), "2026-10-25T05:00:00.000Z");
  assert.equal(periodStart(TZ, NOW, "month").toISOString(), "2026-10-01T05:00:00.000Z");
  // 23:30 Chicago on the 27th is still the 27th there, though the 28th in UTC
  const late = new Date("2026-10-28T04:30:00Z");
  assert.equal(periodKey(TZ, periodStart(TZ, late, "day"), "day"), "2026-10-27");
});

test("nextPeriodStart crosses DST and the year end", () => {
  // The Sunday 2026-11-01 week contains the DST fall-back; the next week still starts at local midnight
  const wk = periodStart(TZ, new Date("2026-11-03T12:00:00Z"), "week");
  assert.equal(periodKey(TZ, wk, "week"), "2026-11-01");
  assert.equal(nextPeriodStart(TZ, wk, "week").toISOString(), "2026-11-08T06:00:00.000Z"); // CST now, UTC-6
  const dec = periodStart(TZ, new Date("2026-12-15T12:00:00Z"), "month");
  assert.equal(periodKey(TZ, nextPeriodStart(TZ, dec, "month"), "month"), "2027-01");
});

test("lastPeriods: 12 periods, oldest first, ending with the one containing now", () => {
  const months = lastPeriods(TZ, "month", 12, NOW);
  assert.equal(months.length, 12);
  assert.equal(months[0].key, "2025-11");
  assert.equal(months[11].key, "2026-10");
  assert.equal(months[11].end.toISOString(), "2026-11-01T05:00:00.000Z");
  const days = lastPeriods(TZ, "day", 3, NOW).map((p) => p.key);
  assert.deepEqual(days, ["2026-10-26", "2026-10-27", "2026-10-28"]);
  const weeks = lastPeriods(TZ, "week", 2, NOW).map((p) => p.key);
  assert.deepEqual(weeks, ["2026-10-18", "2026-10-25"]);
});

test("periodLabel reads like a person wrote it", () => {
  assert.equal(periodLabel(TZ, periodStart(TZ, NOW, "day"), "day", NOW), "Oct 28");
  assert.equal(periodLabel(TZ, periodStart(TZ, NOW, "week"), "week", NOW), "Oct 25 – 31");
  // Saturday the 31st is still the Oct 25 week; Sunday Nov 1 starts the next
  assert.equal(periodLabel(TZ, periodStart(TZ, new Date("2026-10-31T12:00:00Z"), "week"), "week", NOW), "Oct 25 – 31");
  assert.equal(periodLabel(TZ, periodStart(TZ, new Date("2026-11-01T12:00:00Z"), "week"), "week", NOW), "Nov 1 – 7");
  const spanning = periodStart(TZ, new Date("2026-11-04T12:00:00Z"), "week"); // Nov 1 – 7
  assert.equal(periodLabel(TZ, spanning, "week", NOW), "Nov 1 – 7");
  assert.equal(periodLabel(TZ, periodStart(TZ, NOW, "month"), "month", NOW), "October 2026");
  assert.equal(periodLabel(TZ, new Date("2025-12-15T12:00:00Z"), "day", NOW), "Dec 15, 2025");
});

// ─── Totals ─────────────────────────────────────────────────────────────────

test("summarize: collected = amount + refunds; net = collected − refunds − fees", () => {
  const t = summarize([
    row({ paidAt: NOW, amountCents: 8_000, refundedCents: 2_000, feeCents: 325 }),
    row({ paidAt: NOW, amountCents: 5_000, feeCents: 0, method: "OTHER" }),
  ]);
  assert.equal(t.count, 2);
  assert.equal(t.collectedCents, 15_000);
  assert.equal(t.refundsCents, 2_000);
  assert.equal(t.feesCents, 325);
  assert.equal(t.netCents, 15_000 - 2_000 - 325);
});

test("groupByPeriod buckets by the company's calendar and drops rows outside", () => {
  const periods = lastPeriods(TZ, "day", 3, NOW);
  const totals = groupByPeriod(
    [
      row({ paidAt: new Date("2026-10-28T04:30:00Z"), amountCents: 100 }), // Oct 27 23:30 Chicago
      row({ paidAt: new Date("2026-10-28T05:00:00Z"), amountCents: 200 }), // Oct 28 00:00 Chicago
      row({ paidAt: new Date("2026-10-20T12:00:00Z"), amountCents: 900 }), // outside
    ],
    periods
  );
  assert.deepEqual(
    totals.map((t) => [t.key, t.collectedCents]),
    [
      ["2026-10-26", 0],
      ["2026-10-27", 100],
      ["2026-10-28", 200],
    ]
  );
  assert.equal(totals[2].label, "Oct 28");
});

test("breakdownByTech splits a shared job evenly and adds up to the total", () => {
  const rows = [
    row({ paidAt: NOW, amountCents: 10_000, feeCents: 300, techs: ["Ana", "Ben"] }),
    row({ paidAt: NOW, amountCents: 4_000, techs: ["Ana"] }),
    row({ paidAt: NOW, amountCents: 1_000, techs: [] }),
    row({ paidAt: NOW, amountCents: 2_000, techs: ["Ben", "Ben"] }), // duplicate assignee counted once
  ];
  const by = breakdownByTech(rows);
  assert.deepEqual(
    by.map((b) => [b.name, b.collectedCents, b.feesCents]),
    [
      ["Ana", 9_000, 150],
      ["Ben", 7_000, 150],
      ["Unassigned", 1_000, 0],
    ]
  );
  const sum = by.reduce((s, b) => s + b.collectedCents, 0);
  assert.equal(sum, summarize(rows).collectedCents);
  assert.equal(by[0].count, 1.5);
});

test("breakdownByJobType names 'No job' and sorts by collected", () => {
  const by = breakdownByJobType([
    row({ paidAt: NOW, amountCents: 100, jobType: "Mow" }),
    row({ paidAt: NOW, amountCents: 900, jobType: null }),
    row({ paidAt: NOW, amountCents: 500, jobType: "Mow" }),
    row({ paidAt: NOW, amountCents: 50, jobType: "  " }),
  ]);
  assert.deepEqual(
    by.map((b) => [b.name, b.collectedCents, b.count]),
    [
      ["No job", 950, 2],
      ["Mow", 600, 2],
    ]
  );
});

test("jobTypeOf: price-book services first, then the title", () => {
  assert.equal(jobTypeOf(null), null);
  assert.equal(jobTypeOf({ title: "Service visit", lineItems: [] }), "Service visit");
  assert.equal(
    jobTypeOf({
      title: "Smith backyard",
      lineItems: [
        { name: "Mow", workItemId: "w1" },
        { name: "Edge", workItemId: "w2" },
        { name: "Mow", workItemId: "w1" },
        { name: "Tip", workItemId: null },
      ],
    }),
    "Mow + Edge"
  );
  assert.equal(jobTypeOf({ title: "   ", lineItems: [] }), null);
});

test("buildPaymentsReport covers exactly the 12-period range", () => {
  const rows = [
    row({ paidAt: new Date("2026-10-15T12:00:00Z"), amountCents: 1_000, techs: ["Ana"], jobType: "Mow" }),
    row({ paidAt: new Date("2025-11-15T12:00:00Z"), amountCents: 2_000 }), // oldest month, in
    row({ paidAt: new Date("2025-10-15T12:00:00Z"), amountCents: 4_000 }), // 13 months back, out
    row({ paidAt: new Date("2026-10-20T12:00:00Z"), amountCents: 3_000, refundedCents: 500, feeCents: 90, source: "square" }),
  ];
  const r = buildPaymentsReport(rows, { tz: TZ, period: "month", anchor: NOW });
  assert.equal(r.periods.length, 12);
  assert.equal(r.from.toISOString(), "2025-11-01T05:00:00.000Z");
  assert.equal(r.to.toISOString(), "2026-11-01T05:00:00.000Z");
  assert.equal(r.totals.collectedCents, 1_000 + 2_000 + 3_500);
  assert.equal(r.periods[11].collectedCents, 4_500);
  assert.equal(r.periods[0].collectedCents, 2_000);
  assert.deepEqual(
    r.byTech.map((b) => b.name),
    ["Unassigned", "Ana"]
  );
  assert.deepEqual(
    r.byJobType.map((b) => b.name),
    ["No job", "Mow"]
  );
});

test("reportCsv: three blocks, quoted text, formula-safe names, dollars with cents", () => {
  const r = buildPaymentsReport(
    [row({ paidAt: NOW, amountCents: 123_456, feeCents: 3_610, techs: ['=HYPERLINK("x")'], jobType: 'Mow "deluxe"' })],
    { tz: TZ, period: "week", anchor: NOW, count: 2 }
  );
  const csv = reportCsv(r);
  const lines = csv.split("\n");
  assert.equal(lines[0], '"Week of","Payments","Collected","Refunds","Fees","Net"');
  assert.equal(lines[1], '"Oct 18 – 24",0,0.00,0.00,0.00,0.00');
  assert.equal(lines[2], '"Oct 25 – 31",1,1234.56,0.00,36.10,1198.46');
  assert.equal(lines[3], '"Total",1,1234.56,0.00,36.10,1198.46');
  assert.equal(lines[4], "");
  assert.equal(lines[5], '"Tech","Payments","Collected","Refunds","Fees","Net"');
  assert.ok(lines[6].startsWith('"\'=HYPERLINK(""x"")"'), lines[6]);
  assert.equal(lines[8], '"Job type","Payments","Collected","Refunds","Fees","Net"');
  assert.equal(lines[9], '"Mow ""deluxe""",1,1234.56,0.00,36.10,1198.46');
  assert.equal(reportCsvFilename(r), "payments-report-week-2026-10-18.csv");
});

// ─── Square mappers ─────────────────────────────────────────────────────────

test("mapSellerPayment reads money, fee, card and the Square product", () => {
  const p = mapSellerPayment({
    id: "PAY1",
    status: "COMPLETED",
    amount_money: { amount: 8800, currency: "USD" },
    tip_money: { amount: 200, currency: "USD" },
    total_money: { amount: 9000, currency: "USD" },
    processing_fee: [{ amount_money: { amount: 290, currency: "USD" }, type: "INITIAL" }],
    refunded_money: { amount: 1000, currency: "USD" },
    source_type: "CARD",
    card_details: { card: { card_brand: "VISA", last_4: "4242" } },
    application_details: { square_product: "SQUARE_POS", application_id: "sq0idp-POS" },
    reference_id: "INV-12",
    receipt_url: "https://squareup.com/receipt/preview/x",
    created_at: "2026-10-27T15:00:00Z",
  });
  assert.equal(p.amountCents, 8800);
  assert.equal(p.tipCents, 200);
  assert.equal(p.totalCents, 9000);
  assert.equal(p.feeCents, 290);
  assert.equal(p.refundedCents, 1000);
  assert.equal(p.cardBrand, "VISA");
  assert.equal(p.last4, "4242");
  assert.equal(p.squareProduct, "SQUARE_POS");
  assert.equal(p.referenceId, "INV-12");
  // no total_money → amount + tip
  const q = mapSellerPayment({ id: "PAY2", status: "PENDING", amount_money: { amount: 100, currency: "USD" }, tip_money: { amount: 5, currency: "USD" } });
  assert.equal(q.totalCents, 105);
  assert.equal(q.feeCents, 0);
  assert.equal(q.squareProduct, null);
  assert.equal(sumMoney(undefined), 0);
});

test("isWorkBenchPayment: our application id or a recorded processorRef; everything else is outside", () => {
  const recorded = new Set(["PAY_TAP"]);
  assert.equal(isWorkBenchPayment({ id: "PAY_WB", applicationId: "sandbox-sq0idb-WORKBENCH" }, recorded), true);
  assert.equal(isWorkBenchPayment({ id: "PAY_TAP", applicationId: null }, recorded), true);
  assert.equal(isWorkBenchPayment({ id: "PAY_POS", applicationId: "sq0idp-POS" }, recorded), false);
  assert.equal(isWorkBenchPayment({ id: "PAY_X", applicationId: null }, recorded), false);
  // An unset application id never matches a null application_details
  assert.equal(isWorkBenchPayment({ id: "PAY_X", applicationId: null }, recorded, ""), false);
});

test("mapSellerPayout: fees summed, bank last 4 from the account map", () => {
  const p = mapSellerPayout(
    {
      id: "PO1",
      status: "SENT",
      created_at: "2026-10-27T20:00:00Z",
      arrival_date: "2026-10-28",
      amount_money: { amount: 51_200, currency: "USD" },
      destination: { type: "BANK_ACCOUNT", id: "BA1" },
      type: "BATCH",
      payout_fee: [{ amount_money: { amount: 100, currency: "USD" }, type: "TRANSFER_FEE" }, { amount_money: { amount: 50, currency: "USD" } }],
    },
    new Map([["BA1", "6789"]])
  );
  assert.equal(p.amountCents, 51_200);
  assert.equal(p.feeCents, 150);
  assert.equal(p.destinationLast4, "6789");
  assert.equal(p.arrivalDate, "2026-10-28");
  const card = mapSellerPayout({ id: "PO2", destination: { type: "CARD", id: "C1" } });
  assert.equal(card.destinationLast4, null);
  assert.equal(card.status, "SENT");
});

test("mapPayoutEntry names the payment / refund / dispute behind a line", () => {
  const charge = mapPayoutEntry(
    { id: "E1", type: "CHARGE", gross_amount_money: { amount: 1000, currency: "USD" }, fee_amount_money: { amount: 59, currency: "USD" }, net_amount_money: { amount: 941, currency: "USD" }, type_charge_details: { payment_id: "PAY1" } },
    "PO1"
  );
  assert.deepEqual([charge.payoutId, charge.grossCents, charge.feeCents, charge.netCents, charge.paymentId], ["PO1", 1000, 59, 941, "PAY1"]);
  const refund = mapPayoutEntry({ id: "E2", type: "REFUND", net_amount_money: { amount: -500, currency: "USD" }, type_refund_details: { payment_id: "PAY1", refund_id: "RF1" } }, "PO1");
  assert.equal(refund.refundId, "RF1");
  assert.equal(refund.netCents, -500);
  const dispute = mapPayoutEntry({ id: "E3", type: "OPEN_DISPUTE", type_open_dispute_details: { payment_id: "PAY9", dispute_id: "DS1" } }, "PO1");
  assert.equal(dispute.disputeId, "DS1");
  assert.equal(dispute.paymentId, "PAY9");
});

test("mapSellerDispute + states", () => {
  const d = mapSellerDispute({
    id: "DS1",
    amount_money: { amount: 8803, currency: "USD" },
    reason: "DUPLICATE",
    state: "EVIDENCE_REQUIRED",
    due_at: "2026-11-10T00:00:00Z",
    disputed_payment: { payment_id: "PAY1" },
    card_brand: "VISA",
    reported_date: "2026-10-27",
  });
  assert.equal(d.amountCents, 8803);
  assert.equal(d.paymentId, "PAY1");
  assert.equal(d.reportedDate, "2026-10-27");
  assert.ok(OPEN_DISPUTE_STATES.has(d.state));
  assert.ok(UNRESOLVED_DISPUTE_STATES.has("PROCESSING"));
  assert.ok(!OPEN_DISPUTE_STATES.has("PROCESSING"));
  assert.ok(!UNRESOLVED_DISPUTE_STATES.has("WON"));
  assert.ok(!UNRESOLVED_DISPUTE_STATES.has("ACCEPTED"));
  // Older payloads name it dispute_id
  assert.equal(mapSellerDispute({ dispute_id: "DS2" }).id, "DS2");
});

test("mapDisputeEvidence: files and text", () => {
  const f = mapDisputeEvidence({ id: "EV1", evidence_type: "RECEIPT", evidence_file: { filename: "invoice.pdf", filetype: "application/pdf" }, uploaded_at: "2026-10-28T00:00:00Z" }, "DS1");
  assert.deepEqual([f.disputeId, f.fileName, f.fileType, f.text], ["DS1", "invoice.pdf", "application/pdf", null]);
  const t = mapDisputeEvidence({ evidence_id: "EV2", evidence_text: "Work done 10/20, signed off." }, "DS1");
  assert.equal(t.id, "EV2");
  assert.equal(t.text, "Work done 10/20, signed off.");
  assert.equal(SQUARE_EVIDENCE_MAX_BYTES, 5 * 1024 * 1024);
});

// ─── Failures ───────────────────────────────────────────────────────────────

test("sellerFailure classifies missing scopes, outages, no connection, refusals", () => {
  const scopes = sellerFailure(new SquareError(403, [{ code: "INSUFFICIENT_SCOPES", detail: "needs PAYOUTS_READ" }], "x"));
  assert.equal(scopes.missingScopes, true);
  assert.equal(scopes.transient, false);
  assert.deepEqual(sellerFailureStatus(scopes), { status: 409, body: { error: scopes.message, code: "MISSING_SCOPES" } });

  const down = sellerFailure(new SquareError(503, [], "x"));
  assert.equal(down.transient, true);
  assert.equal(sellerFailureStatus(down).status, 424);
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  assert.equal(sellerFailure(timeout).transient, true);
  assert.equal(sellerFailure(new SquareError(429, [{ code: "RATE_LIMITED" }], "x")).transient, true);

  const none = sellerFailure(new SquareNotConnectedError());
  assert.equal(none.notConnected, true);
  assert.equal(sellerFailureStatus(none).status, 400);

  const refused = sellerFailure(new SquareError(404, [{ code: "NOT_FOUND", detail: "Dispute not found" }], "x"));
  assert.equal(refused.missingScopes, false);
  assert.equal(refused.transient, false);
  assert.equal(refused.message, "Dispute not found");
  assert.equal(sellerFailureStatus(refused).status, 424);
});

test("scopesMissingFrom: what a stored grant lacks against today's SQUARE_SCOPES", () => {
  const old = "MERCHANT_PROFILE_READ PAYMENTS_WRITE PAYMENTS_READ CUSTOMERS_READ CUSTOMERS_WRITE";
  const missing = scopesMissingFrom(old);
  assert.ok(missing.includes("PAYOUTS_READ"));
  assert.ok(missing.includes("DISPUTES_READ"));
  assert.ok(missing.includes("DISPUTES_WRITE"));
  assert.ok(missing.includes("PAYMENTS_WRITE_IN_PERSON"));
  assert.ok(!missing.includes("PAYMENTS_READ"));
  assert.deepEqual(scopesMissingFrom(SQUARE_SCOPES.join(" ")), []);
  assert.deepEqual(scopesMissingFrom(SQUARE_SCOPES.join(",")), []);
  assert.deepEqual(scopesMissingFrom(null, ["A", "B"]), ["A", "B"]);
  assert.deepEqual(scopesMissingFrom("A", ["A", "B"]), ["B"]);
});

console.log(`payments-reports: ${passed} tests passed`);
