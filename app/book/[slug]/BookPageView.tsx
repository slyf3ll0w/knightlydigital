import { notFound } from "next/navigation";
import BookingForm from "./BookingForm";
import { brandAccent } from "@/lib/branding";
import { bookingAccent, FONT_SIZE_ZOOM } from "@/lib/booking-form";
import { resolveWebForm } from "@/lib/web-forms";

/** Hosted form page shared by /book/[slug] and /book/[slug]/[form]. */
export default async function BookPageView({
  companySlug,
  formSlug,
}: {
  companySlug: string;
  formSlug?: string;
}) {
  const resolved = await resolveWebForm(companySlug, formSlug);
  if (!resolved) notFound();
  const { company, form } = resolved;
  const config = form.config;

  const dark = config.appearance.theme === "dark";
  const fontName = config.appearance.font;
  const fontHref = fontName
    ? `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`
    : null;

  const defaultDescription =
    form.type === "SERVICE_REQUEST"
      ? "Order a service"
      : form.type === "INQUIRY"
        ? "Get in touch"
        : "Request a service appointment";

  return (
    <div
      className={`app-ui min-h-screen py-10 px-4 ${dark ? "bg-[#0C0F0C]" : "bg-gray-50"}`}
      style={{
        zoom: FONT_SIZE_ZOOM[config.appearance.fontSize],
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
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt={`${company.name} logo`}
              className="h-12 w-auto max-w-[180px] object-contain mx-auto mb-3"
            />
          )}
          <h1 className={`text-2xl font-bold ${dark ? "text-white" : "text-gray-900"}`}>
            {config.header.title || company.name}
          </h1>
          <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>
            {config.header.description || defaultDescription}
          </p>
        </div>
        <BookingForm
          companySlug={companySlug}
          formSlug={form.isDefault ? "" : form.slug}
          formType={form.type}
          theme={dark ? "dark" : "light"}
          accent={bookingAccent(config, brandAccent(company))}
          config={config}
        />
      </div>
    </div>
  );
}
