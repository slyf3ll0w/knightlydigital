/**
 * Render-tests the quote/invoice PDF builders with fabricated data — no
 * database needed. Verifies @react-pdf/renderer produces valid PDFs from the
 * real component tree (styles, fonts, table, totals, footer).
 *
 *   npx tsx scripts/test-pdf-render.mts [outDir]
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { buildQuoteDocument, buildInvoiceDocument, buildJobReportDocument, type ReportImages } from "../lib/pdf";
import type { JobReport } from "../lib/job-report";
import type { PhotoView } from "../lib/photos-shared";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Under the unit-test runner the PDFs go to the temp dir, not the repo root
const outDir = process.argv[2] ?? join(tmpdir(), "wb-pdf-render-test");
mkdirSync(outDir, { recursive: true });

const company = {
  name: "Berkey's Plumbing & Air",
  phone: "(817) 555-0142",
  email: "office@berkeys.example",
  address: "412 Commerce St",
  city: "Fort Worth",
  state: "TX",
  zip: "76102",
  logoData: null,
  logoMime: null,
  logoUrl: null,
  brandColor: "#0B57D8",
  brandColorSecondary: "#F86A0A",
  documentColor: null,
};

const contact = {
  firstName: "Lynne",
  lastName: "Carver",
  email: "lynne@example.com",
  phone: "(214) 555-0177",
  address: "98 Bluebonnet Trail",
  city: "Arlington",
  state: "TX",
  zip: "76010",
};

const lines = [
  { id: "1", name: "Water heater replacement", description: "50-gal gas unit, haul-away included", quantity: 1, unitPrice: 1850, total: 1850, isOptional: false, optedOut: false },
  { id: "2", name: "Expansion tank", description: "", quantity: 1, unitPrice: 240, total: 240, isOptional: true, optedOut: false },
  { id: "3", name: "Annual maintenance plan", description: "Two visits per year", quantity: 1, unitPrice: 199, total: 199, isOptional: true, optedOut: true },
];

async function main() {
  const quoteBuf = await renderToBuffer(
    buildQuoteDocument(
      {
        quoteNumber: 1042,
        title: "Water heater replacement",
        status: "AWAITING_RESPONSE",
        discountType: "PERCENT",
        discountValue: 10,
        taxRate: 0.0825,
        depositType: "PERCENT",
        depositValue: 25,
        clientMessage: "Thanks for having us out — here's everything we discussed on Tuesday.",
        disclaimer: "Quote assumes accessible attic installation. Code-required permits billed at cost.",
        validUntil: new Date("2026-09-10"),
        sentAt: new Date("2026-08-10"),
        approvedAt: null,
        signatureName: null,
        createdAt: new Date("2026-08-09"),
        contact,
        company,
        lineItems: lines,
      },
      null
    )
  );
  const invoiceBuf = await renderToBuffer(
    buildInvoiceDocument(
      {
        invoiceNumber: 2087,
        subject: "Water heater replacement",
        status: "AWAITING_PAYMENT",
        kind: "STANDARD",
        subtotal: 2090,
        discount: 209,
        taxRate: 0.0825,
        tax: 155.18,
        surcharge: null,
        depositApplied: 470,
        total: 1566.18,
        notes: "Warranty registration submitted to manufacturer.",
        clientMessage: "Thanks for choosing us — it was a pleasure working on your home.",
        issuedAt: new Date("2026-08-10"),
        dueDate: new Date("2026-08-24"),
        createdAt: new Date("2026-08-10"),
        contact,
        company,
        lineItems: lines.slice(0, 2).map(({ isOptional, optedOut, ...li }) => li),
        payments: [
          { id: "p1", amount: 470, method: "CARD", referenceNumber: null, paidAt: new Date("2026-08-05") },
        ],
      },
      null
    )
  );

  // Stamped variants: approved quote + paid invoice exercise the Stamp path
  const approvedQuoteBuf = await renderToBuffer(
    buildQuoteDocument(
      {
        quoteNumber: 1042,
        title: "Water heater replacement",
        status: "APPROVED",
        discountType: "PERCENT",
        discountValue: 10,
        taxRate: 0.0825,
        depositType: "PERCENT",
        depositValue: 25,
        clientMessage: "Thanks for having us out — here's everything we discussed on Tuesday.",
        disclaimer: "Quote assumes accessible attic installation.",
        validUntil: new Date("2026-09-10"),
        sentAt: new Date("2026-08-10"),
        approvedAt: new Date("2026-08-11"),
        signatureName: "Lynne Carver",
        createdAt: new Date("2026-08-09"),
        contact,
        company,
        lineItems: lines,
      },
      null
    )
  );
  const paidInvoiceBuf = await renderToBuffer(
    buildInvoiceDocument(
      {
        invoiceNumber: 2087,
        subject: "Water heater replacement",
        status: "PAID",
        kind: "STANDARD",
        subtotal: 2090,
        discount: 209,
        taxRate: 0.0825,
        tax: 155.18,
        surcharge: null,
        depositApplied: 470,
        total: 1566.18,
        notes: null,
        clientMessage: null,
        issuedAt: new Date("2026-08-10"),
        dueDate: new Date("2026-08-24"),
        createdAt: new Date("2026-08-10"),
        contact,
        company,
        lineItems: lines.slice(0, 2).map(({ isOptional, optedOut, ...li }) => li),
        payments: [
          { id: "p1", amount: 470, method: "CARD", referenceNumber: null, paidAt: new Date("2026-08-05") },
          { id: "p2", amount: 1566.18, method: "CARD", referenceNumber: null, paidAt: new Date("2026-08-11") },
        ],
      },
      null
    )
  );

  // Work completed report (Gallery plan): pairs, singles, note, checklist,
  // sign-off, with a 1×1 PNG standing in for the photos.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const photo = (id: string, stage: PhotoView["stage"], caption: string | null, pairId: string | null): PhotoView => ({
    id, stage, caption, takenAt: "2026-10-30T15:00:00.000Z", createdAt: "2026-10-30T15:00:00.000Z", by: "Marco Reyes",
    lat: null, lng: null, clientVisible: true, siteUse: false, alt: null, hasThumb: false, jobId: "job1", quoteId: null, pairId,
  });
  const report: JobReport = {
    job: {
      id: "job1", jobNumber: 412, title: "Water heater replacement", description: null, status: "REQUIRES_INVOICING",
      address: "98 Bluebonnet Trail, Arlington, TX 76010", scheduledAt: new Date("2026-10-29T14:00:00Z"),
      completedAt: new Date("2026-10-29T17:40:00Z"), closedAt: null,
      completionSignatureName: "Lynne Carver", completionSignedAt: new Date("2026-10-29T17:45:00Z"),
      reportNote: "New 50-gallon unit in, expansion tank added, pressure tested to 80 psi. Call us if the pilot ever drops out.",
      reportSentAt: null, companyId: "c1", contactId: "k1",
      company: { ...company, legalName: null, showLegalNameOnDocs: false, timezone: "America/Chicago" },
      contact: { ...contact, hubToken: "tok", smsOptOut: false, smsDisabled: false },
    },
    crew: ["Marco Reyes"],
    checklist: [
      { id: "c1", label: "Shut off gas and water", done: true, skipReason: null },
      { id: "c2", label: "Install expansion tank", done: true, skipReason: null },
      { id: "c3", label: "Haul away old unit", done: false, skipReason: "Customer kept it for scrap" },
    ],
    photos: [],
    pairs: [
      { id: "p1", before: photo("b1", "BEFORE", "Old unit, corroded fittings", "p1"), after: photo("a1", "AFTER", "New unit and expansion tank", "p1") },
    ],
    singles: [photo("s1", "AFTER", "Pressure test", null), photo("s2", "DURING", null, null), photo("s3", "GENERAL", "Shut-off valve", null)],
    path: "/hub/tok/work/job1",
  };
  report.photos = [...report.pairs.flatMap((p) => [p.before, p.after]), ...report.singles];
  const images: ReportImages = new Map(report.photos.map((p) => [p.id, { data: png, format: "png" as const }]));
  const reportBuf = await renderToBuffer(buildJobReportDocument(report, null, images));

  for (const [name, buf] of [
    ["test-quote.pdf", quoteBuf],
    ["test-invoice.pdf", invoiceBuf],
    ["test-quote-approved.pdf", approvedQuoteBuf],
    ["test-invoice-paid.pdf", paidInvoiceBuf],
    ["test-work-report.pdf", reportBuf],
  ] as const) {
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${name}: not a PDF`);
    if (buf.length < 2000) throw new Error(`${name}: suspiciously small (${buf.length}B)`);
    writeFileSync(join(outDir, name), buf);
    console.log(`OK ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
}

main().then(
  () => console.log("PDF render test passed"),
  (e) => {
    console.error("PDF render test FAILED:", e);
    process.exit(1);
  }
);
