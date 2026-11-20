import "./hub-heavy.css";
import { hubBrandVars } from "@/lib/hub-brand";
import { clientBand } from "@/lib/client-band";
import HubNav from "./HubNav";

export type HubShellCompany = {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  documentColor?: string | null;
};

/**
 * The client portal's frame in the heavy look: ONE solid band in the
 * company's color (logo, name, the greeting, desktop tabs), the tinted
 * ground with the page's white cards, and the phone's bottom tab bar.
 * Pure (no data loading) so the review frame at /client-preview renders
 * the very same shell on the fake Brightwire Electric.
 */
export default function HubShell({
  company,
  firstName,
  base,
  unreadMessages,
  currentPath,
  children,
}: {
  company: HubShellCompany;
  firstName: string;
  base: string;
  unreadMessages: number;
  /** Review frames only (see HubNav). */
  currentPath?: string;
  children: React.ReactNode;
}) {
  const b = clientBand(company);
  const vars = {
    ...hubBrandVars(company),
    "--hh-band": b.band,
    "--hh-on-band": b.onBand,
    "--hh-on-band-quiet": b.onBandQuiet,
    "--hh-accent": b.accent,
    "--hh-on-accent": b.onAccent,
    "--hh-accent-strong": b.accentStrong,
  } as React.CSSProperties;

  return (
    <div className="app-ui hub-heavy min-h-screen" style={vars}>
      <header className="hh-band">
        <div className="max-w-3xl mx-auto px-4 pt-6 pb-7 lg:pb-0 lg:pt-8">
          <div className="anim-portal flex items-center gap-3">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt={`${company.name} logo`} className="hh-logo shrink-0" />
            ) : null}
            <p className="hh-company truncate">{company.name}</p>
          </div>
          <h1 className="anim-portal anim-delay-1 hh-hello mt-5 lg:mt-6">Hi {firstName}</h1>
          <div className="anim-portal anim-delay-2 mt-7 hidden lg:block">
            <HubNav
              base={base}
              variant="top"
              color={b.onBand}
              badgeTextColor={b.band}
              unreadMessages={unreadMessages}
              currentPath={currentPath}
            />
          </div>
        </div>
      </header>
      {/* Bottom padding clears the fixed phone tab bar (+ home indicator). */}
      <main className="max-w-3xl mx-auto px-4 pt-5 lg:pt-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12">
        {children}
      </main>
      <HubNav
        base={base}
        variant="bottom"
        color={b.onBand}
        badgeTextColor={b.band}
        unreadMessages={unreadMessages}
        currentPath={currentPath}
      />
    </div>
  );
}
