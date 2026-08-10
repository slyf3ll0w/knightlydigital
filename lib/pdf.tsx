/**
 * Branded PDF documents for quotes and invoices, rendered server-side with
 * @react-pdf/renderer (no headless browser — Railway-safe). One shared layout
 * so both documents read as the same paper trail: company header, bill-to,
 * line-item table, totals ledger, then document-specific blocks (approval /
 * payments). Money math mirrors the public pages: quotes recompute over the
 * items the client kept (lib/quote-totals), invoices trust their stored
 * columns and net recorded payments.
 *
 * Served from four routes — /api/app/{quotes,invoices}/[id]/pdf (staff, actor
 * scoped) and /{quote,pay}/[token]/pdf (client, token is the credential) — so
 * emails can link the client PDF without auth.
 */
import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { brandAccent } from "@/lib/branding";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { money, shortDate, quoteDepositAmount, paymentMethodLabel } from "@/lib/statuses";

// ─── Shared bits ──────────────────────────────────────────────────────────────

const INK = "#111827";
const MUTED = "#6B7280";
const FAINT = "#E5E7EB";

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48, fontSize: 9.5, fontFamily: "Helvetica", color: INK },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { maxHeight: 42, maxWidth: 150, objectFit: "contain", marginBottom: 6 },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  companyMeta: { color: MUTED, marginTop: 2, lineHeight: 1.4 },
  docType: { fontSize: 9, letterSpacing: 2, color: MUTED, textAlign: "right" },
  docNumber: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 2 },
  docMeta: { color: MUTED, textAlign: "right", marginTop: 4, lineHeight: 1.4 },
  rule: { height: 2.5, marginTop: 14, marginBottom: 16 },
  sectionLabel: { fontSize: 8, letterSpacing: 1.5, color: MUTED, marginBottom: 4 },
  billToName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  bodyText: { lineHeight: 1.45 },
  // Line-item table
  table: { marginTop: 18 },
  th: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 5 },
  thText: { fontSize: 8, letterSpacing: 1, color: MUTED },
  tr: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: FAINT, paddingVertical: 7 },
  colItem: { flex: 1, paddingRight: 10 },
  colQty: { width: 50, textAlign: "right" },
  colUnit: { width: 75, textAlign: "right" },
  colTotal: { width: 80, textAlign: "right" },
  itemName: { fontFamily: "Helvetica-Bold" },
  itemDesc: { color: MUTED, marginTop: 1.5, lineHeight: 1.35 },
  optionalTag: { color: MUTED, fontSize: 8 },
  // Totals ledger
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { color: MUTED },
  grandRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, marginTop: 4, paddingTop: 6 },
  grandText: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  note: { marginTop: 18 },
  disclaimer: { marginTop: 18, color: MUTED, fontSize: 8, lineHeight: 1.4 },
  footer: {
    position: "absolute", bottom: 26, left: 48, right: 48,
    flexDirection: "row", justifyContent: "space-between",
    color: MUTED, fontSize: 8, borderTopWidth: 0.75, borderTopColor: FAINT, paddingTop: 8,
  },
  paidStamp: {
    alignSelf: "flex-end", marginTop: 8, borderWidth: 1.5, borderRadius: 3,
    paddingVertical: 3, paddingHorizontal: 10, fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 2,
  },
});

export type LogoSrc = { data: Buffer; format: "png" | "jpg" } | null;

type CompanyForPdf = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  logoData: Uint8Array | null;
  logoMime: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  brandColorSecondary: string | null;
  documentColor: string | null;
};

type ContactForPdf = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} | null;

const companySelect = {
  name: true, phone: true, email: true, address: true, city: true, state: true, zip: true,
  logoData: true, logoMime: true, logoUrl: true,
  brandColor: true, brandColorSecondary: true, documentColor: true,
} as const;

const contactSelect = {
  firstName: true, lastName: true, email: true, phone: true,
  address: true, city: true, state: true, zip: true,
} as const;

/** react-pdf renders png/jpeg only. Prefer the uploaded bytes; fall back to
 *  fetching an absolute logoUrl (setup-wizard branding); skip anything else. */
async function loadLogo(company: CompanyForPdf): Promise<LogoSrc> {
  const fmt = (mime: string | null | undefined): "png" | "jpg" | null =>
    mime === "image/png" ? "png" : mime === "image/jpeg" || mime === "image/jpg" ? "jpg" : null;
  if (company.logoData && company.logoData.length > 0) {
    const format = fmt(company.logoMime);
    if (format) return { data: Buffer.from(company.logoData), format };
  }
  if (company.logoUrl && /^https?:\/\//i.test(company.logoUrl)) {
    try {
      const res = await fetch(company.logoUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const format = fmt(res.headers.get("content-type")?.split(";")[0].trim());
      if (!format) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) return null;
      return { data: bytes, format };
    } catch {
      return null;
    }
  }
  return null;
}

function cityLine(x: { city: string | null; state: string | null; zip: string | null }): string {
  const cs = [x.city, x.state].filter(Boolean).join(", ");
  return [cs, x.zip].filter(Boolean).join(" ");
}

function Header({
  company, logo, docType, docNumber, metaLines, accent,
}: {
  company: CompanyForPdf; logo: LogoSrc; docType: string; docNumber: number;
  metaLines: string[]; accent: string;
}) {
  return (
    <>
      <View style={styles.headerRow}>
        <View style={{ maxWidth: 280 }}>
          {logo ? <Image style={styles.logo} src={logo} /> : null}
          <Text style={styles.companyName}>{company.name}</Text>
          <Text style={styles.companyMeta}>
            {[company.address, cityLine(company)].filter(Boolean).join("\n")}
            {(company.address || cityLine(company)) && (company.phone || company.email) ? "\n" : ""}
            {[company.phone, company.email].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <View>
          <Text style={styles.docType}>{docType.toUpperCase()}</Text>
          {/* docNumber 0 = un-numbered document (statements) */}
          {docNumber > 0 ? <Text style={styles.docNumber}>#{docNumber}</Text> : null}
          {metaLines.map((l) => (
            <Text key={l} style={styles.docMeta}>{l}</Text>
          ))}
        </View>
      </View>
      <View style={[styles.rule, { backgroundColor: accent }]} />
    </>
  );
}

function BillTo({ contact }: { contact: ContactForPdf }) {
  if (!contact) return null;
  const lines = [contact.address, cityLine(contact), [contact.phone, contact.email].filter(Boolean).join("  ·  ")]
    .filter((l) => l && l.length > 0);
  return (
    <View style={{ maxWidth: 280 }}>
      <Text style={styles.sectionLabel}>PREPARED FOR</Text>
      <Text style={styles.billToName}>{contact.firstName} {contact.lastName}</Text>
      {lines.map((l) => (
        <Text key={l as string} style={[styles.bodyText, { color: MUTED }]}>{l}</Text>
      ))}
    </View>
  );
}

type LineForPdf = {
  id: string; name: string; description: string;
  quantity: number; unitPrice: number; total: number;
  isOptional?: boolean; optedOut?: boolean;
};

function ItemsTable({ items }: { items: LineForPdf[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.th}>
        <Text style={[styles.colItem, styles.thText]}>ITEM</Text>
        <Text style={[styles.colQty, styles.thText]}>QTY</Text>
        <Text style={[styles.colUnit, styles.thText]}>UNIT</Text>
        <Text style={[styles.colTotal, styles.thText]}>AMOUNT</Text>
      </View>
      {items.map((li) => {
        const declined = li.isOptional && li.optedOut;
        return (
          <View key={li.id} style={styles.tr} wrap={false}>
            <View style={styles.colItem}>
              <Text style={[styles.itemName, declined ? { color: MUTED } : {}]}>
                {li.name || li.description || "Service"}
                {li.isOptional ? (
                  <Text style={styles.optionalTag}>{declined ? "   (optional — not included)" : "   (optional)"}</Text>
                ) : null}
              </Text>
              {li.name && li.description ? <Text style={styles.itemDesc}>{li.description}</Text> : null}
            </View>
            <Text style={[styles.colQty, declined ? { color: MUTED } : {}]}>{String(Number(li.quantity))}</Text>
            <Text style={[styles.colUnit, declined ? { color: MUTED } : {}]}>{money(li.unitPrice)}</Text>
            <Text style={[styles.colTotal, declined ? { color: MUTED } : {}]}>
              {declined ? "—" : money(li.total)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function TotalRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      {/* ASCII hyphen — U+2212 isn't in the PDF's WinAnsi charset and drops */}
      <Text>{negative ? `-${value}` : value}</Text>
    </View>
  );
}

function Footer({ text }: { text: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{text}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// ─── Quote PDF ────────────────────────────────────────────────────────────────

const quoteInclude = {
  contact: { select: contactSelect },
  company: { select: companySelect },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
};

const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_RESPONSE: "Awaiting response",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  CONVERTED: "Approved", // converted to a job — the client-facing state is still "approved"
  ARCHIVED: "Archived",
};

export async function quotePdf(
  where: import("@prisma/client").Prisma.QuoteWhereInput
): Promise<{ buffer: Buffer; filename: string } | null> {
  const quote = await prisma.quote.findFirst({ where, include: quoteInclude });
  if (!quote) return null;
  const logo = await loadLogo(quote.company);
  return {
    buffer: await renderToBuffer(buildQuoteDocument(quote, logo)),
    filename: `Quote-${quote.quoteNumber}.pdf`,
  };
}

/** Data shape buildQuoteDocument needs — matches the quotePdf Prisma include.
 *  Numeric fields accept Prisma Decimals or plain numbers (test fixtures). */
export type QuoteForPdf = {
  quoteNumber: number;
  title: string | null;
  status: string;
  discountType: string;
  discountValue: { toString(): string } | number | null;
  taxRate: { toString(): string } | number | null;
  depositType: string;
  depositValue: { toString(): string } | number | null;
  clientMessage: string | null;
  disclaimer: string | null;
  validUntil: Date | null;
  sentAt: Date | null;
  approvedAt: Date | null;
  signatureName: string | null;
  createdAt: Date;
  contact: ContactForPdf;
  company: CompanyForPdf;
  lineItems: {
    id: string; name: string; description: string;
    quantity: { toString(): string } | number;
    unitPrice: { toString(): string } | number;
    total: { toString(): string } | number;
    isOptional: boolean; optedOut: boolean;
  }[];
};

/** Exported for scripts/test-pdf-render.mts — routes go through quotePdf. */
export function buildQuoteDocument(quote: QuoteForPdf, logo: LogoSrc) {
  const accent = brandAccent(quote.company);

  // Mirror the acceptance page: totals over the items the client kept.
  const included = quote.lineItems.filter((li) => !(li.isOptional && li.optedOut));
  const subtotal = included.reduce((s, li) => s + Number(li.total), 0);
  const { discount, tax, total } = computeQuoteTotals({
    subtotal,
    discountType: quote.discountType,
    discountValue: quote.discountValue == null ? null : Number(quote.discountValue),
    taxRate: quote.taxRate == null ? null : Number(quote.taxRate),
  });
  const deposit = quoteDepositAmount({
    total,
    depositType: quote.depositType,
    depositValue: quote.depositValue == null ? null : Number(quote.depositValue),
  });

  const metaLines = [
    `Date: ${shortDate(quote.sentAt ?? quote.createdAt)}`,
    ...(quote.validUntil ? [`Valid until: ${shortDate(quote.validUntil)}`] : []),
    ...(quote.status !== "AWAITING_RESPONSE" ? [QUOTE_STATUS_LABEL[quote.status] ?? quote.status] : []),
  ];

  return (
    <Document title={`Quote #${quote.quoteNumber} — ${quote.company.name}`} producer="WorkBench" creator="WorkBench">
      <Page size="LETTER" style={styles.page}>
        <Header company={quote.company} logo={logo} docType="Quote" docNumber={quote.quoteNumber} metaLines={metaLines} accent={accent} />
        <BillTo contact={quote.contact} />
        {quote.title ? (
          <Text style={[styles.billToName, { marginTop: 14 }]}>{quote.title}</Text>
        ) : null}
        {quote.clientMessage ? (
          <Text style={[styles.bodyText, styles.note]}>{quote.clientMessage}</Text>
        ) : null}
        <ItemsTable
          items={quote.lineItems.map((li) => ({
            id: li.id, name: li.name, description: li.description,
            quantity: Number(li.quantity), unitPrice: Number(li.unitPrice), total: Number(li.total),
            isOptional: li.isOptional, optedOut: li.optedOut,
          }))}
        />
        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <TotalRow label="Subtotal" value={money(subtotal)} />
            {discount > 0 ? <TotalRow label="Discount" value={money(discount)} negative /> : null}
            {tax != null && tax > 0 ? (
              <TotalRow label={`Tax (${(Number(quote.taxRate) * 100).toFixed(2).replace(/\.?0+$/, "")}%)`} value={money(tax)} />
            ) : null}
            <View style={[styles.grandRow, { borderTopColor: accent }]}>
              <Text style={styles.grandText}>Total</Text>
              <Text style={styles.grandText}>{money(total)}</Text>
            </View>
            {deposit > 0 && quote.status !== "APPROVED" ? (
              <TotalRow label="Deposit due on approval" value={money(deposit)} />
            ) : null}
          </View>
        </View>
        {quote.status === "APPROVED" && quote.signatureName ? (
          <View style={styles.note}>
            <Text style={styles.sectionLabel}>APPROVED</Text>
            <Text style={styles.bodyText}>
              Signed by {quote.signatureName}
              {quote.approvedAt ? ` on ${shortDate(quote.approvedAt)}` : ""}
            </Text>
          </View>
        ) : null}
        {quote.disclaimer ? <Text style={styles.disclaimer}>{quote.disclaimer}</Text> : null}
        <Footer text={`Quote #${quote.quoteNumber}  ·  ${quote.company.name}`} />
      </Page>
    </Document>
  );
}

// ─── Invoice PDF ──────────────────────────────────────────────────────────────

const invoiceInclude = {
  contact: { select: contactSelect },
  company: { select: companySelect },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  payments: { orderBy: { paidAt: "asc" as const } },
};

export async function invoicePdf(
  where: import("@prisma/client").Prisma.InvoiceWhereInput
): Promise<{ buffer: Buffer; filename: string } | null> {
  const invoice = await prisma.invoice.findFirst({ where, include: invoiceInclude });
  if (!invoice) return null;
  const logo = await loadLogo(invoice.company);
  return {
    buffer: await renderToBuffer(buildInvoiceDocument(invoice, logo)),
    filename: `Invoice-${invoice.invoiceNumber}.pdf`,
  };
}

/** Data shape buildInvoiceDocument needs — matches the invoicePdf Prisma include. */
export type InvoiceForPdf = {
  invoiceNumber: number;
  subject: string | null;
  status: string;
  kind: string;
  subtotal: { toString(): string } | number;
  discount: { toString(): string } | number | null;
  taxRate: { toString(): string } | number | null;
  tax: { toString(): string } | number | null;
  surcharge: { toString(): string } | number | null;
  depositApplied: { toString(): string } | number | null;
  total: { toString(): string } | number;
  notes: string | null;
  clientMessage: string | null;
  issuedAt: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  contact: ContactForPdf;
  company: CompanyForPdf;
  lineItems: {
    id: string; name: string; description: string;
    quantity: { toString(): string } | number;
    unitPrice: { toString(): string } | number;
    total: { toString(): string } | number;
  }[];
  payments: {
    id: string;
    amount: { toString(): string } | number;
    method: string;
    referenceNumber: string | null;
    paidAt: Date;
  }[];
};

/** Exported for scripts/test-pdf-render.mts — routes go through invoicePdf. */
export function buildInvoiceDocument(invoice: InvoiceForPdf, logo: LogoSrc) {
  const accent = brandAccent(invoice.company);

  const surcharge = invoice.surcharge == null ? 0 : Number(invoice.surcharge);
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  // Payments carry any card surcharge on top of the invoice total, so the
  // amount owed reconciles against total + surcharge (mirrors the pay page).
  const balance = Math.max(0, Math.round((Number(invoice.total) + surcharge - paid) * 100) / 100);
  const isPaid = invoice.status === "PAID";

  const metaLines = [
    `Date: ${shortDate(invoice.issuedAt ?? invoice.createdAt)}`,
    ...(invoice.dueDate ? [`Due: ${shortDate(invoice.dueDate)}`] : []),
  ];

  return (
    <Document title={`Invoice #${invoice.invoiceNumber} — ${invoice.company.name}`} producer="WorkBench" creator="WorkBench">
      <Page size="LETTER" style={styles.page}>
        <Header company={invoice.company} logo={logo} docType={invoice.kind === "DEPOSIT" ? "Deposit invoice" : "Invoice"} docNumber={invoice.invoiceNumber} metaLines={metaLines} accent={accent} />
        <BillTo contact={invoice.contact} />
        {invoice.subject ? (
          <Text style={[styles.billToName, { marginTop: 14 }]}>{invoice.subject}</Text>
        ) : null}
        {invoice.clientMessage ? (
          <Text style={[styles.bodyText, styles.note]}>{invoice.clientMessage}</Text>
        ) : null}
        <ItemsTable
          items={invoice.lineItems.map((li) => ({
            id: li.id, name: li.name, description: li.description,
            quantity: Number(li.quantity), unitPrice: Number(li.unitPrice), total: Number(li.total),
          }))}
        />
        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <TotalRow label="Subtotal" value={money(invoice.subtotal)} />
            {invoice.discount != null && Number(invoice.discount) > 0 ? (
              <TotalRow label="Discount" value={money(invoice.discount)} negative />
            ) : null}
            {invoice.tax != null && Number(invoice.tax) > 0 ? (
              <TotalRow
                label={invoice.taxRate ? `Tax (${(Number(invoice.taxRate) * 100).toFixed(2).replace(/\.?0+$/, "")}%)` : "Tax"}
                value={money(invoice.tax)}
              />
            ) : null}
            {invoice.depositApplied != null && Number(invoice.depositApplied) > 0 ? (
              <TotalRow label="Deposit applied" value={money(invoice.depositApplied)} negative />
            ) : null}
            <View style={[styles.grandRow, { borderTopColor: accent }]}>
              <Text style={styles.grandText}>Total</Text>
              <Text style={styles.grandText}>{money(invoice.total)}</Text>
            </View>
            {surcharge > 0 ? <TotalRow label="Card surcharge" value={money(surcharge)} /> : null}
            {paid > 0 ? <TotalRow label="Paid to date" value={money(paid)} negative /> : null}
            {paid > 0 || surcharge > 0 ? (
              <View style={[styles.grandRow, { borderTopColor: FAINT }]}>
                <Text style={styles.grandText}>Balance due</Text>
                <Text style={styles.grandText}>{money(balance)}</Text>
              </View>
            ) : null}
            {isPaid ? (
              <Text style={[styles.paidStamp, { color: accent, borderColor: accent }]}>PAID</Text>
            ) : null}
          </View>
        </View>
        {invoice.payments.length > 0 ? (
          <View style={styles.note}>
            <Text style={styles.sectionLabel}>PAYMENTS</Text>
            {invoice.payments.map((p) => (
              <View key={p.id} style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  {shortDate(p.paidAt)}  ·  {paymentMethodLabel[p.method] ?? p.method}
                  {p.referenceNumber ? `  ·  Ref ${p.referenceNumber}` : ""}
                </Text>
                <Text>{money(p.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {invoice.notes ? (
          <View style={styles.note}>
            <Text style={styles.sectionLabel}>NOTES</Text>
            <Text style={styles.bodyText}>{invoice.notes}</Text>
          </View>
        ) : null}
        <Footer text={`Invoice #${invoice.invoiceNumber}  ·  ${invoice.company.name}`} />
      </Page>
    </Document>
  );
}

// ─── Client statement PDF ─────────────────────────────────────────────────────

/**
 * One page per client: every open invoice with its balance, aged buckets, and
 * the total due — the "send the bookkeeper a statement" document. Paid
 * invoices from the last 90 days show below for context.
 */
export async function statementPdf(
  contactId: string,
  companyId: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId },
    select: {
      ...contactSelect,
      company: { select: companySelect },
      invoices: {
        where: { status: { in: ["AWAITING_PAYMENT", "PAST_DUE", "PAID"] } },
        orderBy: { invoiceNumber: "asc" },
        select: {
          id: true,
          invoiceNumber: true,
          subject: true,
          status: true,
          issuedAt: true,
          dueDate: true,
          paidAt: true,
          createdAt: true,
          total: true,
          payments: { select: { amount: true } },
        },
      },
    },
  });
  if (!contact) return null;
  const { company, invoices, ...contactBits } = contact;
  const logo = await loadLogo(company);
  const accent = brandAccent(company);
  const now = new Date();

  const rows = invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Math.max(0, Math.round((Number(inv.total) - paid) * 100) / 100);
    return { ...inv, paid, balance };
  });
  const open = rows.filter((r) => r.status !== "PAID" && r.balance > 0);
  const recentPaid = rows.filter(
    (r) => r.status === "PAID" && r.paidAt && now.getTime() - r.paidAt.getTime() < 90 * 86400_000
  );
  const totalDue = open.reduce((s, r) => s + r.balance, 0);

  const table = (list: typeof rows, showBalance: boolean) => (
    <View style={styles.table}>
      <View style={styles.th}>
        <Text style={[styles.colItem, styles.thText]}>INVOICE</Text>
        <Text style={[styles.colUnit, styles.thText]}>DUE</Text>
        <Text style={[styles.colUnit, styles.thText]}>TOTAL</Text>
        <Text style={[styles.colTotal, styles.thText]}>{showBalance ? "BALANCE" : "PAID"}</Text>
      </View>
      {list.map((r) => (
        <View key={r.id} style={styles.tr} wrap={false}>
          <View style={styles.colItem}>
            <Text style={styles.itemName}>#{r.invoiceNumber}{r.subject ? `  ${r.subject}` : ""}</Text>
            <Text style={styles.itemDesc}>Issued {shortDate(r.issuedAt ?? r.createdAt)}</Text>
          </View>
          <Text style={styles.colUnit}>{r.dueDate ? shortDate(r.dueDate) : "—"}</Text>
          <Text style={styles.colUnit}>{money(r.total)}</Text>
          <Text style={[styles.colTotal, styles.itemName]}>
            {money(showBalance ? r.balance : r.paid)}
          </Text>
        </View>
      ))}
    </View>
  );

  const doc = (
    <Document title={`Statement — ${contactBits.firstName} ${contactBits.lastName} — ${company.name}`} producer="WorkBench" creator="WorkBench">
      <Page size="LETTER" style={styles.page}>
        <Header
          company={company}
          logo={logo}
          docType="Statement"
          docNumber={0}
          metaLines={[`As of ${shortDate(now)}`]}
          accent={accent}
        />
        <BillTo contact={contactBits} />
        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <View style={[styles.grandRow, { borderTopColor: accent }]}>
              <Text style={styles.grandText}>Total due</Text>
              <Text style={styles.grandText}>{money(totalDue)}</Text>
            </View>
          </View>
        </View>
        {open.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>OPEN INVOICES</Text>
            {table(open, true)}
          </>
        ) : (
          <Text style={[styles.bodyText, styles.note]}>No open invoices — thank you!</Text>
        )}
        {recentPaid.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>PAID (LAST 90 DAYS)</Text>
            {table(recentPaid, false)}
          </>
        ) : null}
        <Footer text={`Statement  ·  ${company.name}`} />
      </Page>
    </Document>
  );

  const who = `${contactBits.firstName}-${contactBits.lastName}`.replace(/[^\w-]/g, "");
  return { buffer: await renderToBuffer(doc), filename: `Statement-${who}.pdf` };
}

/** Standard response wrapper for the four PDF routes. */
export function pdfResponse(pdf: { buffer: Buffer; filename: string }): Response {
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
