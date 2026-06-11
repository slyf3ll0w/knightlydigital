import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BookingForm from "./BookingForm";
import { brandAccent } from "@/lib/branding";
import { sanitizeBookingForm } from "@/lib/booking-form";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) notFound();

  return (
    <div className="app-ui min-h-screen bg-gray-50 py-10 px-4">
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
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          <p className="text-gray-500 text-sm mt-1">Request a service appointment</p>
        </div>
        <BookingForm
          companySlug={slug}
          accent={brandAccent(company)}
          config={sanitizeBookingForm(company.bookingForm)}
        />
      </div>
    </div>
  );
}
