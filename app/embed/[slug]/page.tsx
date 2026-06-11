import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BookingForm from "@/app/book/[slug]/BookingForm";
import EmbedAutoResize from "./EmbedAutoResize";
import { brandAccent } from "@/lib/branding";
import { sanitizeBookingForm } from "@/lib/booking-form";

/**
 * Chrome-less booking form for embedding in a company's own website via
 * <iframe>. Same form + API as /book/[slug], minus header and page styling.
 *
 * Query params so it blends into the host site:
 *   ?theme=dark         dark inputs/labels (default light)
 *   ?transparent=1      no card background — sits directly on the host page
 *   ?accent=2563eb      hex accent override (defaults to the brand color)
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

  const dark = theme === "dark";
  const isTransparent = transparent === "1";

  const accentHex = /^#?[0-9a-fA-F]{6}$/.test(accent ?? "")
    ? `#${(accent as string).replace("#", "")}`
    : brandAccent(company);

  // Google Font name: letters/digits/spaces only — anything else is ignored
  const fontName = /^[a-zA-Z0-9 ]{2,40}$/.test(font ?? "") ? (font as string).trim() : null;
  const fontHref = fontName
    ? `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`
    : null;

  return (
    <div
      className="app-ui p-4"
      style={{
        backgroundColor: isTransparent ? "transparent" : dark ? "#0C0F0C" : "#ffffff",
        ...(fontName ? { fontFamily: `"${fontName}", sans-serif` } : {}),
      }}
    >
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
        config={sanitizeBookingForm(company.bookingForm)}
        initialService={typeof service === "string" ? service.slice(0, 120) : ""}
      />
    </div>
  );
}
