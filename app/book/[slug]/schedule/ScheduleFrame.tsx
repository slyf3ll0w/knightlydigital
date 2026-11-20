import type { ScheduleAppearance } from "./shell";
import BusinessFooter from "../BusinessFooter";
import { ClientBandHeader, ClientPage, type ClientBrandInput } from "@/components/client/ClientFrame";

export type FrameCompany = ClientBrandInput & { logoUrl: string | null; slug?: string };

/**
 * Page chrome shared by the hosted booking pages (menu, item, manage, about,
 * legal, shop) in the heavy look: ONE solid band in the company's color
 * (lib/client-band.ts, the same resolver as the portal home) with the logo
 * tile, the name and the big title, then the tinted ground with the page's
 * white cards. Font + zoom from the company's booking page look; its dark
 * theme keeps the band over a dark ground. Embeds render the same children
 * without this frame (see /embed/[slug]). The business footer (About,
 * contact, privacy + text terms) makes /book/<slug> stand as the business's
 * website on its texting registration.
 */
export default function ScheduleFrame({
  company,
  appearance,
  title,
  subtitle,
  wide = false,
  footer = "slim",
  children,
}: {
  company: FrameCompany;
  appearance: ScheduleAppearance;
  title?: string;
  subtitle?: string | null;
  wide?: boolean;
  /** "full" on the business's home page (details block when on), "about" on /about (always), "slim" on forms and legal pages. */
  footer?: "full" | "slim" | "about";
  children: React.ReactNode;
}) {
  return (
    <BookingFrame
      company={company}
      appearance={appearance}
      title={title}
      subtitle={subtitle}
      wide={wide}
      footer={company.slug ? <BusinessFooter slug={company.slug} dark={appearance.dark} variant={footer} /> : null}
    >
      {children}
    </BookingFrame>
  );
}

/** The frame itself, pure: the footer comes in as a node (/client-preview hands it a fixture one). */
export function BookingFrame({
  company,
  appearance,
  title,
  subtitle,
  wide = false,
  footer,
  children,
}: {
  company: FrameCompany;
  appearance: Pick<ScheduleAppearance, "dark" | "fontName" | "fontHref" | "zoom">;
  title?: string;
  subtitle?: string | null;
  wide?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const width = wide ? "wide" : "narrow";
  return (
    <ClientPage
      brand={company}
      dark={appearance.dark}
      fontName={appearance.fontName}
      fontHref={appearance.fontHref}
      zoom={appearance.zoom}
      width={width}
      footer={footer}
      band={<ClientBandHeader name={company.name} logoUrl={company.logoUrl} title={title ?? company.name} subtitle={subtitle} width={width} />}
    >
      {children}
    </ClientPage>
  );
}
