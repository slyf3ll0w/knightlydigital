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
  home = false,
  children,
}: {
  company: FrameCompany;
  appearance: ScheduleAppearance;
  title?: string;
  subtitle?: string | null;
  wide?: boolean;
  /** "full" on the business's home page (details block when on), "about" on /about (always), "slim" on forms and legal pages. */
  footer?: "full" | "slim" | "about";
  /** The business's booking page itself (menu, or its single item): wears the theme's hero, heading and line. */
  home?: boolean;
  children: React.ReactNode;
}) {
  return (
    <BookingFrame
      company={company}
      appearance={appearance}
      title={title}
      subtitle={subtitle}
      wide={wide}
      home={home}
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
  home = false,
  footer,
  children,
}: {
  company: FrameCompany;
  appearance: Pick<ScheduleAppearance, "dark" | "fontName" | "fontHref" | "zoom" | "theme">;
  title?: string;
  subtitle?: string | null;
  wide?: boolean;
  /** See ScheduleFrame. */
  home?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const width = wide ? "wide" : "narrow";
  // The page-designer theme (Pro): band style everywhere, the hero + words on the home page only
  const theme = appearance.theme ?? null;
  const hero = home && theme ? theme.booking.hero : "plain";
  const heading = (home && theme?.booking.heading) || title;
  const line = (home && theme?.booking.line) || subtitle;
  return (
    <ClientPage
      brand={company}
      dark={appearance.dark}
      fontName={appearance.fontName}
      fontHref={appearance.fontHref}
      zoom={appearance.zoom}
      width={width}
      footer={footer}
      theme={theme}
      bandStyle={hero === "photo-behind" ? "photo" : undefined}
      band={
        <ClientBandHeader
          name={company.name}
          logoUrl={company.logoUrl}
          title={heading ?? company.name}
          subtitle={line}
          width={width}
          center={theme?.logo.placement === "band-center"}
          heroPhoto={hero === "photo-left" ? theme?.band.imageUrl : null}
        />
      }
    >
      {children}
    </ClientPage>
  );
}
