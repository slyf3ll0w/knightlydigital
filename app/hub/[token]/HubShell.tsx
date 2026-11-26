import "./hub-heavy.css";
import "@/app/client-theme.css";
import { hubBrandVars } from "@/lib/hub-brand";
import { clientBand, portalBand } from "@/lib/client-band";
import type { ResolvedClientTheme } from "@/lib/client-theme-spec";
import { themeRoot, themedBand } from "@/lib/client-theme-style";
import HubNav from "./HubNav";

export type HubShellCompany = {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  documentColor?: string | null;
};

/**
 * The client portal's frame in the app's new look (2026-11-25): a band made
 * from the company's color like the app's Home band — deep at the top, the
 * company color at the foot, a 4px stripe in the accent — holding the logo,
 * the name and (desktop) the tabs. Home continues the band with the greeting
 * and the one thing to do (HubHome's hero); every other page opens on its
 * own large title. Phones: Apple's grouped look with the bottom tab bar;
 * desktop: white open pages. Pure (no data loading) so /client-preview
 * renders the very same shell on the fake Brightwire Electric.
 */
export default function HubShell({
  company,
  base,
  unreadMessages,
  currentPath,
  theme = null,
  children,
}: {
  company: HubShellCompany;
  /** Kept for callers; the greeting lives in HubHome now. */
  firstName?: string;
  base: string;
  unreadMessages: number;
  /** Review frames only (see HubNav). */
  currentPath?: string;
  /** The company's published page-designer theme (lib/client-theme-load.ts); null = today's look. */
  theme?: ResolvedClientTheme | null;
  children: React.ReactNode;
}) {
  const b = themedBand(clientBand(company), theme);
  const pb = portalBand(b);
  const root = themeRoot(theme, b);
  const center = theme?.logo.placement === "band-center";
  const vars = {
    ...hubBrandVars(company),
    "--hh-band": b.band,
    "--hh-on-band": "#FFFFFF",
    "--hh-on-band-quiet": "rgba(255,255,255,0.78)",
    "--hh-band-deep": pb.deep,
    "--hh-band-mid": pb.mid,
    "--hh-band-fill": pb.fill,
    "--hh-band-accent": pb.accent,
    "--hh-on-band-accent": pb.onAccent,
    "--hh-tint": pb.tint,
    "--hh-accent": b.accent,
    "--hh-on-accent": b.onAccent,
    "--hh-accent-strong": b.accentStrong,
    ...root.vars,
  } as React.CSSProperties;

  return (
    <div className="app-ui hub-heavy min-h-screen" style={vars} {...root.attrs}>
      {root.fontHref && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={root.fontHref} />
      )}
      <header className={`hh-band${center ? " is-center" : ""}`}>
        <div className="hh-band-in">
          <div className="hh-brand">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt={`${company.name} logo`} className="hh-logo shrink-0" />
            ) : null}
            <p className="hh-company truncate">{company.name}</p>
          </div>
          <div className="hh-tabs hidden lg:block">
            <HubNav
              base={base}
              variant="top"
              color="#FFFFFF"
              badgeTextColor={pb.deep}
              unreadMessages={unreadMessages}
              currentPath={currentPath}
            />
          </div>
        </div>
      </header>
      {/* Bottom padding clears the fixed phone tab bar (+ home indicator). */}
      <main className="hh-main">{children}</main>
      <HubNav
        base={base}
        variant="bottom"
        color="#FFFFFF"
        badgeTextColor={pb.deep}
        unreadMessages={unreadMessages}
        currentPath={currentPath}
      />
    </div>
  );
}
