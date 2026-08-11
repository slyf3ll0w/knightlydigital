import { brandAccent, type CompanyBrand } from "@/lib/branding";

/**
 * The client-facing "paper document" look — the web twin of lib/pdf.tsx.
 * The public quote and pay pages compose these pieces so what a client sees
 * in the browser is the same letterhead they download as a PDF: company
 * block + logo left, color-coded doc tag and big number right, brand-accent
 * rule, PREPARED FOR block, ruled item table, right-aligned totals ledger.
 *
 * The doc-type hues are FIXED (not tenant brand colors) and match the PDFs:
 * green = quote (a decision to make), sky = invoice (money to pay). That's
 * the one glance that tells the two apart.
 */

export const DOC_KIND = {
  quote: {
    label: "Quote",
    ink: "#15803D", // green-700 — matches the PDF doc-type ink
  },
  invoice: {
    label: "Invoice",
    ink: "#0369A1", // sky-700
  },
} as const;

export type DocKind = keyof typeof DOC_KIND;

export type PaperCompany = CompanyBrand & {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type PaperContact = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null;

export function cityLine(x: {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const cs = [x.city, x.state].filter(Boolean).join(", ");
  return [cs, x.zip].filter(Boolean).join(" ");
}

/** The paper itself. Deliberately NO card chrome (border/shadow/background
 *  swap) — the page behind it is white, so the browser tab IS the sheet,
 *  the same way a PDF viewer shows the page. Padding mirrors the PDF's
 *  48pt margins. */
export function PaperSheet({ children }: { children: React.ReactNode }) {
  return <div className="bg-white px-1 py-4 sm:px-7 sm:py-6">{children}</div>;
}

/** Small-caps section label ("PREPARED FOR", "PAYMENTS", "TERMS"). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
      {children}
    </p>
  );
}

/**
 * Color-coded document type — the at-a-glance quote/invoice differentiator.
 * Deliberately NOT a chip/badge: the PDF sets it as quiet letterspaced small
 * caps over the number, and quiet type is the whole look. Only the ink color
 * (green quote / sky invoice) carries the distinction.
 */
export function DocTypeTag({ kind }: { kind: DocKind }) {
  const meta = DOC_KIND[kind];
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-[0.24em]"
      style={{ color: meta.ink }}
    >
      {meta.label}
    </span>
  );
}

/**
 * Letterhead: logo + company block left, doc tag + big number + meta right,
 * then the brand-accent rule — the same top band as the PDF.
 */
export function PaperHeader({
  company,
  kind,
  docNumber,
  metaLines,
}: {
  company: PaperCompany;
  kind: DocKind;
  docNumber: number;
  metaLines: (string | null | undefined)[];
}) {
  const accent = brandAccent(company);
  const contactBits = [company.phone, company.email].filter(Boolean).join("  ·  ");
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-[60%]">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt={`${company.name} logo`}
              className="mb-2 h-12 w-auto max-w-[200px] object-contain object-left"
            />
          )}
          <p className="text-[15px] font-bold text-gray-900">{company.name}</p>
          <div className="mt-0.5 text-xs leading-relaxed text-gray-500">
            {company.address && <p>{company.address}</p>}
            {cityLine(company) && <p>{cityLine(company)}</p>}
            {contactBits && <p>{contactBits}</p>}
          </div>
        </div>
        <div className="text-right">
          <DocTypeTag kind={kind} />
          {/* Plain bold ink like the PDF's Helvetica — the app's ledger
              numerals would break the "same paper" illusion here */}
          <p className="mt-0.5 text-[26px] font-bold leading-none tracking-tight text-gray-900">
            #{docNumber}
          </p>
          <div className="mt-1.5 text-xs leading-relaxed text-gray-500">
            {metaLines.filter(Boolean).map((l) => (
              <p key={l as string}>{l}</p>
            ))}
          </div>
        </div>
      </div>
      {/* Square-edged accent rule, exactly like the PDF's */}
      <div className="mt-4 h-[3px]" style={{ backgroundColor: accent }} />
    </>
  );
}

/** The PREPARED FOR block — client name bold, address/contact muted. */
export function PreparedFor({ contact }: { contact: PaperContact }) {
  if (!contact) return null;
  const contactBits = [contact.phone, contact.email].filter(Boolean).join("  ·  ");
  return (
    <div className="mt-5">
      <SectionLabel>Prepared for</SectionLabel>
      <p className="mt-1 text-sm font-bold text-gray-900">
        {contact.firstName} {contact.lastName}
      </p>
      <div className="text-xs leading-relaxed text-gray-500">
        {contact.address && <p>{contact.address}</p>}
        {cityLine(contact) && <p>{cityLine(contact)}</p>}
        {contactBits && <p>{contactBits}</p>}
      </div>
    </div>
  );
}

/** Column header for the item table — ≥sm only (phones read stacked rows). */
export function ItemsTableHead() {
  return (
    <div className="hidden border-b-2 border-gray-900 pb-1.5 sm:grid sm:grid-cols-[1fr_54px_90px_96px] sm:gap-3">
      <SectionLabel>Item</SectionLabel>
      <SectionLabel>
        <span className="block text-right">Qty</span>
      </SectionLabel>
      <SectionLabel>
        <span className="block text-right">Unit</span>
      </SectionLabel>
      <SectionLabel>
        <span className="block text-right">Amount</span>
      </SectionLabel>
    </div>
  );
}

/** Muted footer strip with the doc identity + PDF link — mirrors the PDF footer. */
export function PaperFooter({
  kind,
  docNumber,
  companyName,
  pdfHref,
}: {
  kind: DocKind;
  docNumber: number;
  companyName: string;
  pdfHref: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
      <span>
        {DOC_KIND[kind].label} #{docNumber} · {companyName}
      </span>
      <a
        href={pdfHref}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-gray-600"
      >
        Download PDF
      </a>
    </div>
  );
}
