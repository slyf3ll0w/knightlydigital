import type { CSSProperties, ReactNode } from "react";
import { clientBrandVars, type ClientBrand } from "@/lib/client-theme";

/**
 * The Client Kit — the pieces every client-facing page is built from
 * (phase 1: quote accept + pay; emails, booking and the hub follow). Styles
 * live in app/client.css under `.client`; tokens come from
 * lib/client-theme.ts. Rules: docs/design-system.md → "Client pages".
 *
 * Plain functions, no hooks, so the same pieces render in server
 * components, client components and the /app/design/client gallery.
 */

export type ClientCompany = ClientBrand & {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type ClientPerson = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null;

export function cityLine(x: { city?: string | null; state?: string | null; zip?: string | null }): string {
  const cs = [x.city, x.state].filter(Boolean).join(", ");
  return [cs, x.zip].filter(Boolean).join(" ");
}

export function money(n: number | string): string {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The page: brand tokens + the light, paper-colored ground. Wrap a whole route in it. */
export function ClientRoot({ brand, children, className = "" }: { brand: ClientBrand; children: ReactNode; className?: string }) {
  return (
    <div className={`client app-ui ${className}`} style={clientBrandVars(brand) as CSSProperties}>
      {children}
      <p className="c-powered">
        Sent with <a href="https://workbenchfsm.com" target="_blank" rel="noopener noreferrer">WorkBench</a>
      </p>
    </div>
  );
}

/** The sheet of paper. */
export function Sheet({ children }: { children: ReactNode }) {
  return <div className="c-sheet">{children}</div>;
}

/** Letterhead: logo + business left, document type + number + dates right, then the brand rule. */
export function Letterhead({
  company,
  docType,
  docNumber,
  meta,
}: {
  company: ClientCompany;
  docType: string;
  docNumber: number | string;
  meta: (string | null | undefined)[];
}) {
  const contactBits = [company.phone, company.email].filter(Boolean).join("  ·  ");
  return (
    <>
      <div className="c-letterhead">
        <div className="min-w-0">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt={`${company.name} logo`} className="c-logo" />
          )}
          <p className="c-company">{company.name}</p>
          <div className="c-meta">
            {company.address && <p>{company.address}</p>}
            {cityLine(company) && <p>{cityLine(company)}</p>}
            {contactBits && <p>{contactBits}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="c-doctype">{docType}</p>
          <p className="c-docnum">#{docNumber}</p>
          <div className="c-meta">
            {meta.filter(Boolean).map((l) => (
              <p key={l as string}>{l}</p>
            ))}
          </div>
        </div>
      </div>
      <div className="c-rule-accent" />
    </>
  );
}

/** The inked mark pressed onto the sheet. `slam` plays the drop (the moment it just happened). */
export function Stamp({ text, tone = "accent", slam = false }: { text: string; tone?: "accent" | "muted" | "good"; slam?: boolean }) {
  return (
    <span className={`c-stamp ${tone === "muted" ? "is-muted" : tone === "good" ? "is-good" : ""} ${slam ? "is-slam" : ""}`} aria-label={text}>
      {text}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="c-label">{children}</p>;
}

export function PreparedFor({ person, label = "Prepared for" }: { person: ClientPerson; label?: string }) {
  if (!person) return null;
  const contactBits = [person.phone, person.email].filter(Boolean).join("  ·  ");
  return (
    <div>
      <Label>{label}</Label>
      <p className="c-name">
        {person.firstName} {person.lastName}
      </p>
      <div className="c-small">
        {person.address && <p>{person.address}</p>}
        {cityLine(person) && <p>{cityLine(person)}</p>}
        {contactBits && <p>{contactBits}</p>}
      </div>
    </div>
  );
}

export function ItemsHead() {
  return (
    <div className="c-items-head">
      <Label>Item</Label>
      <Label>Qty</Label>
      <Label>Unit</Label>
      <Label>Amount</Label>
    </div>
  );
}

export function ItemRow({
  name,
  description,
  qty,
  unit,
  amount,
  off = false,
  tag,
  leading,
}: {
  name: string;
  description?: string | null;
  qty: number;
  unit: number;
  amount: number;
  /** Excluded (an optional item the client left out). */
  off?: boolean;
  /** Quiet word after the name: "optional", "billed monthly". */
  tag?: string | null;
  /** A control before the name (the optional-item checkbox). */
  leading?: ReactNode;
}) {
  return (
    <div className={`c-item ${off ? "is-off" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0">
          <p className="c-item-name">
            {name}
            {tag && <span className="ml-1.5 font-normal text-[12.5px]" style={{ color: "var(--c-faint)" }}>{tag}</span>}
          </p>
          {description && <p className="c-item-desc">{description}</p>}
          <p className="c-item-qty c-num">
            {qty} × {money(unit)}
          </p>
        </div>
      </div>
      <p className="c-cell-r c-num">{qty}</p>
      <p className="c-cell-r c-num">{money(unit)}</p>
      <p className="c-item-amt c-num">{off ? money(amount) : money(amount)}</p>
    </div>
  );
}

export function Totals({ children }: { children: ReactNode }) {
  return <div className="c-totals">{children}</div>;
}

export function TRow({ label, value, kind }: { label: ReactNode; value: ReactNode; kind?: "total" | "due" | "warn" }) {
  return (
    <div className={`c-trow ${kind === "total" ? "is-total" : kind === "due" ? "is-due" : kind === "warn" ? "is-warn" : ""}`}>
      <span>{label}</span>
      <span className="c-num">{value}</span>
    </div>
  );
}

/** The block at the foot of the sheet where the client acts: sign-off, remittance. */
export function Stub({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="c-stub">
      {title && <p className="c-stub-title mb-3">{title}</p>}
      {children}
    </div>
  );
}

/** What happened to this document, kept on the document. */
export function Receipt({ children }: { children: ReactNode }) {
  return <div className="c-receipt">{children}</div>;
}

export function Button({
  variant = "primary",
  block = false,
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "quiet"; block?: boolean }) {
  return (
    <button
      type="button"
      className={`c-btn ${variant === "outline" ? "is-outline" : variant === "quiet" ? "is-quiet" : ""} ${block ? "is-block" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Choices({ children }: { children: ReactNode }) {
  return <div className="c-choices">{children}</div>;
}

export function Choice({ on, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button type="button" className={`c-choice ${on ? "is-on" : ""}`} aria-pressed={on} {...rest}>
      {children}
    </button>
  );
}

export function Notice({ tone = "plain", children }: { tone?: "plain" | "warn" | "bad"; children: ReactNode }) {
  return <div className={`c-note ${tone === "warn" ? "is-warn" : tone === "bad" ? "is-bad" : ""}`}>{children}</div>;
}

/** Phone: the next action rides the bottom edge; desk: a plain row under the stub. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="c-actionbar">{children}</div>;
}

export function Foot({ docType, docNumber, companyName, pdfHref }: { docType: string; docNumber: number | string; companyName: string; pdfHref: string }) {
  return (
    <div className="c-foot">
      <span>
        {docType} #{docNumber} · {companyName}
      </span>
      <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="c-link">
        Download PDF
      </a>
    </div>
  );
}
