import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BookingForm from "@/app/book/[slug]/BookingForm";
import EmbedAutoResize from "./EmbedAutoResize";
import { brandAccent } from "@/lib/branding";
import {
  bookingAccent,
  sanitizeBookingForm,
  FONT_SIZE_ZOOM,
  GOOGLE_FONT_RE,
} from "@/lib/booking-form";

/**
 * Chrome-less booking form for embedding in a company's own website via
 * <iframe>. Same form + API as /book/[slug], minus header and page styling.
 *
 * Appearance (theme/font/size) comes from the company's saved form config;
 * query params override per embed:
 *   ?theme=dark         dark inputs/labels
 *   ?theme=light        force light
 *   ?transparent=1      no card background — sits directly on the host page
 *   ?accent=2563eb      hex accent override (defaults to button/brand color)
 *   ?font=Oxanium       Google Font to match the host site's typography
 *   ?service=Lawn+care  prefill the service field
 *
 * The page also postMessages its height to the parent (EmbedAutoResize) so
 * the snippet's iframe can hug the content.
 */
export default async function EmbedBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    theme?: string;
    transparent?: string;
    accent?: string;
    font?: string;
    service?: string;
  }>;
}) {
  const { slug } = await params;
  const { theme, transparent, accent, font, service } = await searchParams;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) notFound();

  const config = sanitizeBookingForm(company.bookingForm);

  // Saved appearance is the default; explicit URL params win per embed
  const effectiveTheme =
    transparent === "1"
      ? "transparent"
      : theme === "dark" || theme === "light"
        ? theme
        : config.appearance.theme;
  const dark = effectiveTheme === "dark";
  const isTransparent = effectiveTheme === "transparent";

  // Accent precedence: explicit ?accent= > configured button color > brand
  const accentHex = /^#?[0-9a-fA-F]{6}$/.test(accent ?? "")
    ? `#${(accent as string).replace("#", "")}`
    : bookingAccent(config, brandAccent(company));

  const fontName = GOOGLE_FONT_RE.test(font ?? "")
    ? (font as string).trim()
    : (config.appearance.font ?? null);
  const fontHref = fontName
    ? `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`
    : null;

  // globals.css paints <body> white (--background); the wrapper div being
  // transparent isn't enough — the body behind it must go transparent too,
  // or the embed shows as a white box on dark host sites.
  const pageBg = isTransparent ? "transparent" : dark ? "#0C0F0C" : "#ffffff";

  return (
    <div
      className="app-ui p-4"
      style={{
        backgroundColor: pageBg,
        zoom: FONT_SIZE_ZOOM[config.appearance.fontSize],
        ...(fontName ? { fontFamily: `"${fontName}", sans-serif` } : {}),
      }}
    >
      <style>{`html,body{background:${pageBg} !important}`}</style>
      {fontHref && (
        <>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={fontHref} />
        </>
      )}
      <EmbedAutoResize slug={slug} />
      <BookingForm
        companySlug={slug}
        theme={dark ? "dark" : "light"}
        accent={accentHex}
        transparent={isTransparent}
        config={config}
        initialService={typeof service === "string" ? service.slice(0, 120) : ""}
      />
    </div>
  );
}
