import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BookingForm from "./BookingForm";
import { brandAccent } from "@/lib/branding";
import { bookingAccent, sanitizeBookingForm, FONT_SIZE_ZOOM } from "@/lib/booking-form";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) notFound();

  const config = sanitizeBookingForm(company.bookingForm);
  // Transparent only makes sense inside an embed; the hosted page treats it
  // as light. Dark theme darkens the whole page.
  const dark = config.appearance.theme === "dark";
  const fontName = config.appearance.font;
  const fontHref = fontName
    ? `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`
    : null;

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
            {company.name}
          </h1>
          <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>
            Request a service appointment
          </p>
        </div>
        <BookingForm
          companySlug={slug}
          theme={dark ? "dark" : "light"}
          accent={bookingAccent(config, brandAccent(company))}
          config={config}
        />
      </div>
    </div>
  );
}
