/**
 * Render-tests the quote/invoice PDF builders with fabricated data — no
 * database needed. Verifies @react-pdf/renderer produces valid PDFs from the
 * real component tree (styles, fonts, table, totals, footer).
 *
 *   npx tsx scripts/test-pdf-render.mts [outDir]
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { buildQuoteDocument, buildInvoiceDocument } from "../lib/pdf";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? ".";
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

  for (const [name, buf] of [["test-quote.pdf", quoteBuf], ["test-invoice.pdf", invoiceBuf]] as const) {
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
