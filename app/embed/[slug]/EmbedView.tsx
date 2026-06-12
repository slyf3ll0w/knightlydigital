import { notFound } from "next/navigation";
import BookingForm from "@/app/book/[slug]/BookingForm";
import EmbedAutoResize from "./EmbedAutoResize";
import { brandAccent } from "@/lib/branding";
import { bookingAccent, FONT_SIZE_ZOOM, GOOGLE_FONT_RE } from "@/lib/booking-form";
import { resolveWebForm } from "@/lib/web-forms";

type EmbedParams = {
  theme?: string;
  transparent?: string;
  accent?: string;
  font?: string;
  service?: string;
};

/**
 * Chrome-less form for embedding via <iframe>, shared by /embed/[slug] and
 * /embed/[slug]/[form]. Saved appearance is the default; query params
 * override per embed (?theme/?transparent/?accent/?font/?service).
 * Posts its height to the parent (legacy "jobflow:height" message type).
 */
export default async function EmbedView({
  companySlug,
  formSlug,
  searchParams,
}: {
  companySlug: string;
  formSlug?: string;
  searchParams: EmbedParams;
}) {
  const { theme, transparent, accent, font, service } = searchParams;

  const resolved = await resolveWebForm(companySlug, formSlug);
  if (!resolved) notFound();
  const { company, form } = resolved;
  const config = form.config;

  const effectiveTheme =
    transparent === "1"
      ? "transparent"
      : theme === "dark" || theme === "light"
        ? theme
        : config.appearance.theme;
  const dark = effectiveTheme === "dark";
  const isTransparent = effectiveTheme === "transparent";

  const accentHex = /^#?[0-9a-fA-F]{6}$/.test(accent ?? "")
    ? `#${(accent as string).replace("#", "")}`
    : bookingAccent(config, brandAccent(company));

  const fontName = GOOGLE_FONT_RE.test(font ?? "")
    ? (font as string).trim()
    : (config.appearance.font ?? null);
  const fontHref = fontName
    ? `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`
    : null;

  const pageBg = isTransparent ? "transparent" : dark ? "#0C0F0C" : "#ffffff";
  // resize messages key on this so multiple embeds on one page don't clash
  const resizeKey = formSlug ? `${companySlug}/${formSlug}` : companySlug;

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
      <EmbedAutoResize slug={resizeKey} />
      <BookingForm
        companySlug={companySlug}
        formSlug={form.isDefault ? "" : form.slug}
        formType={form.type}
        theme={dark ? "dark" : "light"}
        accent={accentHex}
        transparent={isTransparent}
        config={config}
        initialService={typeof service === "string" ? service.slice(0, 120) : ""}
        showHeader
      />
    </div>
  );
}
