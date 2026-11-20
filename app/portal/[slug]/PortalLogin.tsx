import { ChevronRight, Phone } from "lucide-react";
import { fmtPhone } from "@/lib/format";
import { clientBand } from "@/lib/client-band";
import { hubBrandVars } from "@/lib/hub-brand";
import { ClientBandHeader, ClientCard, ClientPage } from "@/components/client/ClientFrame";
import type { ResolvedClientTheme } from "@/lib/client-theme-spec";
import { photoBackground, themedBand } from "@/lib/client-theme-style";
import PortalLoginForm from "./PortalLoginForm";

export type PortalLoginCompany = {
  name: string;
  slug: string;
  logoUrl: string | null;
  phone: string | null;
  /** What clients may see (null when hidden). */
  email: string | null;
  brandColor: string | null;
  brandColorSecondary: string | null;
  documentColor: string | null;
};

/**
 * The client-portal sign-in in the heavy look, pure (page.tsx loads the
 * company; /client-preview feeds Brightwire). Layout is still the "brand
 * band" David picked 2026-11-14 — a solid band of the company's color with
 * the name and a big "Client login", white cards over its bottom edge — now
 * on the portal home's band (lib/client-band.ts): same color, same logo
 * tile, same Lexend 800 title, same button color as the portal it opens.
 */
export default function PortalLogin({
  company,
  requestHref,
  theme = null,
}: {
  company: PortalLoginCompany;
  requestHref: string | null;
  /** The company's published page-designer theme (lib/client-theme-load.ts); null = today's look. */
  theme?: ResolvedClientTheme | null;
}) {
  const b = themedBand(clientBand(company), theme);
  const phone = company.phone ? fmtPhone(company.phone) : null;
  const hasContact = Boolean(phone || company.email);
  // Desktop second card: new customers first, else just how to reach the company
  const sideCard = Boolean(requestHref || hasContact);

  const contactLines = hasContact && (
    <div className="flex flex-col gap-1 text-[14px] text-gray-600">
      {phone && (
        <a href={`tel:${company.phone}`} className="hover:underline">
          Questions? {phone}
        </a>
      )}
      {company.email && (
        <a href={`mailto:${company.email}`} className="break-all hover:underline">
          {company.email}
        </a>
      )}
    </div>
  );

  const links = (phone || requestHref) && (
    <>
      {phone && (
        <a href={`tel:${company.phone}`} className="ch-band-link">
          {phone}
        </a>
      )}
      {requestHref && (
        <a href={requestHref} className="ch-band-link">
          Request service
        </a>
      )}
    </>
  );

  // The page-designer theme (Pro): layout, heading and photo. The sign-in card's own words never change.
  const layout = theme?.login.layout ?? "band-top";
  const loginPhoto = photoBackground(theme?.login.imageUrl);
  const heading = theme?.login.heading || "Client login";
  const center = theme?.logo.placement === "band-center";

  const signIn = (
    <ClientCard as="section" className="px-5 py-6 md:p-9">
      <PortalLoginForm slug={company.slug} companyName={company.name} brand={b.accent} onBrand={b.onAccent} />
    </ClientCard>
  );

  // Phones: one tappable row (the band's links are desktop-only)
  const phoneRow = requestHref && (
    // the wrapper hides it: .ch-row sets display itself, so md:hidden can't sit on the row
    <div className="md:hidden">
    <a href={requestHref} className="ch-card ch-row">
      <span className="min-w-0 flex-1">
        <span className="ch-h3 block text-gray-900">New customer?</span>
        <span className="mt-0.5 block text-[14px] text-gray-600">Request service</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-gray-400" />
    </a>
    </div>
  );

  // Desktop: new customers / contact card beside the sign-in card
  const desktopCard = sideCard && (
    <ClientCard as="section" className="hidden flex-col p-9 md:flex">
      {requestHref ? (
        <>
          <h2 className="ch-h2 text-gray-900">New customer?</h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-gray-600">
            Tell us about the job and we&apos;ll get you on the schedule. Your account is set up with your first visit.
          </p>
          <a href={requestHref} className="ch-btn-2 mt-6">
            Request service
          </a>
          {hasContact && <div className="mt-auto border-t border-gray-100 pt-6">{contactLines}</div>}
        </>
      ) : (
        <>
          <h2 className="ch-h2 text-gray-900">Need a hand?</h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-gray-600">
            If you can&apos;t find your link or your email has changed, reach {company.name} directly.
          </p>
          <div className="mt-6">{contactLines}</div>
        </>
      )}
    </ClientCard>
  );

  const phoneCall = phone && (
    <a href={`tel:${company.phone}`} className="flex items-center gap-1.5 py-1.5 text-[14px] font-semibold text-gray-700 md:hidden">
      <Phone size={14} className="opacity-70" />
      Call {phone}
    </a>
  );

  // Split: the photo fills the left half on desktop; the band, the sign-in card and the
  // new-customer card stack on the right. Phones get the photo as a strip under the band.
  if (layout === "split" && loginPhoto) {
    return (
      <div style={hubBrandVars(company)} className="md:grid md:min-h-screen md:grid-cols-2">
        <div className="ch-login-photo hidden md:block" style={loginPhoto} role="img" aria-label={`${company.name} photo`} />
        <ClientPage
          brand={b}
          theme={theme}
          band={<ClientBandHeader name={company.name} logoUrl={company.logoUrl} title={heading} links={links || null} center={center} />}
          footer={<footer className="flex flex-col items-center gap-1.5 pt-6 text-[12px] text-gray-500">{phoneCall}</footer>}
        >
          <div className="anim-portal grid gap-3.5 md:gap-6">
            <div className="ch-hero-photo md:hidden" style={loginPhoto} role="img" aria-label={`${company.name} photo`} />
            {signIn}
            {phoneRow}
            {desktopCard}
          </div>
        </ClientPage>
      </div>
    );
  }

  // Band-top (today's "brand band", 2026-11-14) or photo-full (the same cards over the photo)
  const photoFull = layout === "photo-full" && loginPhoto ? { ...loginPhoto, backgroundAttachment: "fixed" as const } : null;
  return (
    <div style={hubBrandVars(company)}>
      <ClientPage
        brand={b}
        width="login"
        overlap
        theme={theme}
        ground={photoFull}
        band={<ClientBandHeader name={company.name} logoUrl={company.logoUrl} title={heading} links={links || null} width="login" tall center={center} />}
        footer={
          <footer className="flex flex-col items-center gap-1.5 pt-6 text-[12px] text-gray-500">
            {photoFull && phoneCall ? <div className="ch-card px-4 md:hidden">{phoneCall}</div> : phoneCall}
          </footer>
        }
      >
        <div className={`anim-portal grid gap-3.5 md:gap-6 ${sideCard ? "md:grid-cols-2" : "mx-auto max-w-[600px]"}`}>
          {signIn}
          {phoneRow}
          {desktopCard}
        </div>
      </ClientPage>
    </div>
  );
}
