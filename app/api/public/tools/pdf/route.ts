import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildInvoiceDocument, buildQuoteDocument, pdfResponse } from "@/lib/pdf";
import { clientIp, limit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";
import { docReady, docTotals, sanitizeToolDoc, splitName } from "@/lib/tool-doc";
import { parseLogoDataUrl } from "@/lib/tool-drafts";

export const runtime = "nodejs";

/**
 * POST /api/public/tools/pdf — the free invoice / estimate generator's
 * download. Renders the visitor's document with the same @react-pdf
 * builders the app uses for real invoices and quotes, so the free PDF is
 * exactly what a WorkBench document looks like. No account, no record:
 * nothing is stored. Rate-limited per IP here and in middleware ("tools").
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (ip !== "unknown" && !(await limit(`tools-pdf:${ip}`, 60, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "That's a lot of PDFs. Try again in a bit." }, { status: 429 });
  }
  let body: { doc?: unknown; logo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const doc = sanitizeToolDoc(body.doc);
  if (!doc) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const ready = docReady(doc);
  if (!ready.ok) return NextResponse.json({ error: ready.reason }, { status: 400 });
  const logo = parseLogoDataUrl(body.logo);
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
  const logoSrc = logo ? { data: logo.data, format: logo.format } : null;

  try {
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
              logoSrc,
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
              logoSrc,
            ),
          );
    const word = doc.kind === "estimate" ? "Estimate" : "Invoice";
    return pdfResponse({ buffer: Buffer.from(buffer), filename: `${word}-${doc.number}.pdf` });
  } catch (e) {
    reportError("[tools] pdf render failed", e);
    return NextResponse.json({ error: "The PDF didn't render. Try again." }, { status: 500 });
  }
}
