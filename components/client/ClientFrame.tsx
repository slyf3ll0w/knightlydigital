import "@/app/client-heavy.css";
import { clientBand, clientBandVars, type ClientBand } from "@/lib/client-band";

/**
 * The heavy look's building blocks for client-facing pages (booking page,
 * its forms, the portal login), as named pieces with props so the coming AI
 * page designer (docs/plans/ai-portal-designer-2026-11-20.md) can pick a
 * band style, width and copy instead of editing markup. Colors always come
 * from lib/client-band.ts, the same resolver the portal home uses.
 * Pure (no data loading): /client-preview renders them on Brightwire.
 */

export type ClientBrandInput = {
  name: string;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  documentColor?: string | null;
};

/** Content widths: a one-column form, the stepper with its rail, the login's two cards. */
export type ClientWidth = "narrow" | "wide" | "login";
const WIDTH: Record<ClientWidth, string> = {
  narrow: "max-w-2xl",
  wide: "max-w-5xl",
  login: "max-w-[1040px]",
};

/**
 * The page: tinted ground, the band on top, content below, footer last.
 * `overlap` pulls the first cards up over the band's bottom edge (the login's
 * "brand band", picked 2026-11-14).
 */
export function ClientPage({
  brand,
  band,
  dark = false,
  fontName = null,
  fontHref = null,
  zoom = 1,
  width = "narrow",
  overlap = false,
  footer,
  children,
}: {
  brand: ClientBrandInput | ClientBand;
  band: React.ReactNode;
  /** The booking look's dark theme: dark ground under the same band. */
  dark?: boolean;
  /** The company's own Google Font (booking look); null = Lexend. */
  fontName?: string | null;
  fontHref?: string | null;
  zoom?: number;
  width?: ClientWidth;
  overlap?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const b = "band" in brand && "onBand" in brand ? (brand as ClientBand) : clientBand(brand as ClientBrandInput);
  const style = {
    ...clientBandVars(b),
    ...(fontName ? { "--ch-font": `"${fontName}", sans-serif` } : {}),
    zoom,
  } as React.CSSProperties;
  return (
    <div className={`app-ui ch-page ch-font flex min-h-screen flex-col ${dark ? "is-dark" : ""}`} style={style}>
      {fontHref && (
        <>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={fontHref} />
        </>
      )}
      {band}
      <main className={`mx-auto w-full ${WIDTH[width]} px-4 ${overlap ? "-mt-12 md:-mt-[88px]" : "pt-5 lg:pt-8"} pb-10`}>{children}</main>
      {footer ? <div className={`mx-auto mt-auto w-full ${WIDTH[width]} px-4 pb-8`}>{footer}</div> : null}
    </div>
  );
}

/**
 * The one strong band: logo on a white tile (or just the name), the big
 * title, an optional line under it. `links` sit at the band's right on
 * desktop (the login's phone + Request service). `tall` leaves room for
 * overlapping cards.
 */
export function ClientBandHeader({
  name,
  logoUrl,
  title,
  subtitle,
  links,
  width = "narrow",
  tall = false,
}: {
  name: string;
  logoUrl?: string | null;
  /** Big Lexend 800 title; omitted = the company name is the title. */
  title?: string | null;
  subtitle?: string | null;
  links?: React.ReactNode;
  width?: ClientWidth;
  tall?: boolean;
}) {
  const heading = title || name;
  // The name line only repeats when the title is something else
  const showName = Boolean(title && title !== name) || Boolean(logoUrl);
  return (
    <header className="ch-band">
      <div className={`mx-auto ${WIDTH[width]} px-4 pt-6 lg:pt-8 ${tall ? "pb-[72px] md:pb-[112px]" : "pb-7 lg:pb-9"}`}>
        {(showName || links) && (
          <div className="anim-portal flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`${name} logo`} className="ch-logo shrink-0" />
            ) : null}
            {showName ? <p className="ch-company min-w-0 truncate">{name}</p> : null}
            {links ? <nav className="ml-auto hidden shrink-0 items-center gap-6 md:flex">{links}</nav> : null}
          </div>
        )}
        <h1 className={`anim-portal anim-delay-1 ch-title ${showName || links ? "mt-5 lg:mt-7" : ""}`}>{heading}</h1>
        {subtitle ? <p className="anim-portal anim-delay-1 ch-sub mt-2.5 max-w-xl">{subtitle}</p> : null}
      </div>
    </header>
  );
}

/** Solid white card (ring + deep soft shadow). */
export function ClientCard({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: { as?: "div" | "section" | "aside" | "form"; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`ch-card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** A section heading on the ground ("Instant estimates"), never an eyebrow label. */
export function ClientSectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`ch-section ${className}`}>{children}</h2>;
}
