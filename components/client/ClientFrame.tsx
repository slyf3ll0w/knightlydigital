import "@/app/client-heavy.css";
import "@/app/client-theme.css";
import { clientBand, clientBandVars, type ClientBand } from "@/lib/client-band";
import type { ResolvedClientTheme } from "@/lib/client-theme-spec";
import { photoBackground, themeRoot, themedBand } from "@/lib/client-theme-style";

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
  theme = null,
  bandStyle,
  ground,
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
  /** The company's published page-designer theme (lib/client-theme-load.ts); null / default = today's look. */
  theme?: ResolvedClientTheme | null;
  /** This page's band style instead of the theme's (the booking hero's photo-behind). */
  bandStyle?: ResolvedClientTheme["band"]["style"];
  /** A photo behind the content instead of the tinted ground (the login's photo-full layout). */
  ground?: React.CSSProperties | null;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const base = "band" in brand && "onBand" in brand ? (brand as ClientBand) : clientBand(brand as ClientBrandInput);
  const b = themedBand(base, theme);
  const root = themeRoot(theme, b, { dark, bandStyle });
  const style = {
    ...clientBandVars(b),
    ...root.vars,
    ...(fontName ? { "--ch-font": `"${fontName}", sans-serif` } : {}),
    ...(ground ?? {}),
    zoom,
  } as React.CSSProperties;
  return (
    <div className={`app-ui ch-page ch-font flex min-h-screen flex-col ${dark ? "is-dark" : ""}`} style={style} {...root.attrs}>
      {fontHref && (
        <>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={fontHref} />
        </>
      )}
      {root.fontHref && (
        <>
          {!fontHref && (
            // eslint-disable-next-line @next/next/no-page-custom-font
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          )}
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={root.fontHref} />
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
 * overlapping cards. `center` = the theme's logo.placement band-center;
 * `heroPhoto` = the booking hero's photo-left (the band photo beside the
 * title on desktop, under it on phones).
 */
export function ClientBandHeader({
  name,
  logoUrl,
  title,
  subtitle,
  links,
  width = "narrow",
  tall = false,
  center = false,
  heroPhoto = null,
}: {
  name: string;
  logoUrl?: string | null;
  /** Big Lexend 800 title; omitted = the company name is the title. */
  title?: string | null;
  subtitle?: string | null;
  links?: React.ReactNode;
  width?: ClientWidth;
  tall?: boolean;
  center?: boolean;
  heroPhoto?: string | null;
}) {
  const heading = title || name;
  // The name line only repeats when the title is something else
  const showName = Boolean(title && title !== name) || Boolean(logoUrl);
  const hasTop = showName || Boolean(links && !center);
  const photo = photoBackground(heroPhoto);
  const titleBlock = (
    <>
      <h1 className={`anim-portal anim-delay-1 ch-title ${hasTop && !photo ? "mt-5 lg:mt-7" : ""}`}>{heading}</h1>
      {subtitle ? <p className={`anim-portal anim-delay-1 ch-sub mt-2.5 max-w-xl${center ? " mx-auto" : ""}`}>{subtitle}</p> : null}
    </>
  );
  return (
    <header className={`ch-band${center ? " ch-band-center" : ""}`}>
      <div className={`mx-auto ${WIDTH[width]} px-4 pt-6 lg:pt-8 ${tall ? "pb-[72px] md:pb-[112px]" : "pb-7 lg:pb-9"}`}>
        {hasTop && (
          <div className={`anim-portal flex items-center gap-3${center ? " justify-center" : ""}`}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`${name} logo`} className="ch-logo shrink-0" />
            ) : null}
            {showName ? <p className="ch-company min-w-0 truncate">{name}</p> : null}
            {links && !center ? <nav className="ml-auto hidden shrink-0 items-center gap-6 md:flex">{links}</nav> : null}
          </div>
        )}
        {photo ? (
          <div className={`anim-portal anim-delay-1 flex flex-col gap-5 md:flex-row md:items-center md:gap-8 ${hasTop ? "mt-5 lg:mt-7" : ""}`}>
            <div className="ch-hero-photo order-last md:order-first" style={photo} role="img" aria-label={`${name} photo`} />
            <div className="min-w-0">{titleBlock}</div>
          </div>
        ) : (
          titleBlock
        )}
        {links && center ? <nav className="mt-5 hidden items-center justify-center gap-6 md:flex">{links}</nav> : null}
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
