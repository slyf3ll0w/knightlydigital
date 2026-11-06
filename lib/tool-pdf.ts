import { renderToBuffer } from "@react-pdf/renderer";
import { buildInvoiceDocument, buildQuoteDocument } from "@/lib/pdf";
import { docTotals, splitName, type ToolDoc } from "@/lib/tool-doc";

/**
 * The free generator's document → a PDF, with the same @react-pdf builders
 * the app uses for real invoices and quotes, so the free PDF is exactly
 * what a WorkBench document looks like. Shared by the generator's download
 * (POST /api/public/tools/pdf) and the hosted copy of an emailed document
 * (GET /t/<token>/pdf). Server only.
 */

export type ToolLogo = { data: Buffer; format: "png" | "jpg" } | null;

export function toolPdfFilename(doc: ToolDoc): string {
  return `${doc.kind === "estimate" ? "Estimate" : "Invoice"}-${doc.number}.pdf`;
}

export async function renderToolDocPdf(doc: ToolDoc, logo: ToolLogo): Promise<Buffer> {
  const totals = docTotals(doc);
  const company = {
    name: doc.business.name,
    phone: doc.business.phone || null,
    email: doc.business.email || null,
    address: doc.business.address || null,
    city: doc.business.city || null,
    state: doc.business.state || null,
    zip: doc.business.zip || null,
    logoData: null,
    logoMime: null,
    logoUrl: null,
    brandColor: doc.accent,
    brandColorSecondary: null,
    documentColor: null,
  };
  const { firstName, lastName } = splitName(doc.client.name);
  const contact = doc.client.name.trim()
    ? {
        firstName: firstName || doc.client.name.trim(),
        lastName,
        email: doc.client.email || null,
        phone: doc.client.phone || null,
        address: doc.client.address || null,
        city: doc.client.city || null,
        state: doc.client.state || null,
        zip: doc.client.zip || null,
      }
    : null;
  const lines = doc.lines.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    total: Math.round(l.quantity * l.unitPrice * 100) / 100,
    isOptional: l.optional,
    optedOut: false,
  }));
  const issuedAt = new Date(doc.issuedAt + "T12:00:00Z");
  const dueAt = doc.dueAt ? new Date(doc.dueAt + "T12:00:00Z") : null;
  const taxRate = doc.taxRate > 0 ? doc.taxRate / 100 : null;

  const buffer =
    doc.kind === "estimate"
      ? await renderToBuffer(
          buildQuoteDocument(
            {
              quoteNumber: doc.number,
              title: doc.lines[0]?.name || null,
              status: "AWAITING_RESPONSE",
              discountType: doc.discountType,
              discountValue: doc.discountType === "NONE" ? null : doc.discountValue,
              taxRate,
              depositType: doc.depositType,
              depositValue: doc.depositType === "NONE" ? null : doc.depositValue,
              clientMessage: doc.clientMessage || null,
              disclaimer: null,
              validUntil: dueAt,
              sentAt: issuedAt,
              approvedAt: null,
              signatureName: null,
              createdAt: issuedAt,
              contact,
              company,
              lineItems: lines,
            },
            logo,
            { label: "Estimate" },
          ),
        )
      : await renderToBuffer(
          buildInvoiceDocument(
            {
              invoiceNumber: doc.number,
              subject: doc.lines[0]?.name || null,
              status: "AWAITING_PAYMENT",
              kind: "STANDARD",
              subtotal: totals.subtotal,
              discount: totals.discount || null,
              taxRate,
              tax: totals.tax,
              surcharge: null,
              depositApplied: null,
              total: totals.total,
              notes: null,
              clientMessage: doc.clientMessage || null,
              issuedAt,
              dueDate: dueAt,
              createdAt: issuedAt,
              contact,
              company,
              lineItems: lines.map(({ isOptional: _o, optedOut: _x, ...l }) => l),
              payments: [],
            },
            logo,
          ),
        );
  return Buffer.from(buffer);
}
