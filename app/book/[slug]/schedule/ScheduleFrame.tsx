import type { ScheduleAppearance } from "./shell";

/**
 * Page chrome shared by the hosted scheduling pages (menu, booking, manage):
 * company logo + name on top, themed ground, Google Font + zoom from the
 * default form's appearance. Embeds render the same children without this
 * frame (see /embed/[slug]/schedule).
 */
export default function ScheduleFrame({
  company,
  appearance,
  title,
  subtitle,
  wide = false,
  children,
}: {
  company: { name: string; logoUrl: string | null };
  appearance: ScheduleAppearance;
  title?: string;
  subtitle?: string | null;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const { dark, fontName, fontHref, zoom } = appearance;
  return (
    <div
      className={`app-ui min-h-screen px-4 py-8 lg:py-12 ${dark ? "bg-[#0C0F0C]" : "bg-gray-50"}`}
      style={{ zoom, ...(fontName ? { fontFamily: `"${fontName}", sans-serif` } : {}) }}
    >
      {fontHref && (
        <>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={fontHref} />
        </>
      )}
      <div className={`mx-auto ${wide ? "max-w-4xl" : "max-w-lg"}`}>
        <div className="mb-6 text-center">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt={`${company.name} logo`} className="mx-auto mb-3 h-14 w-auto max-w-[220px] object-contain" />
          )}
          <h1 className={`text-2xl font-bold ${dark ? "text-white" : "text-gray-900"}`}>{title ?? company.name}</h1>
          {subtitle && <p className={`mt-1 text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
