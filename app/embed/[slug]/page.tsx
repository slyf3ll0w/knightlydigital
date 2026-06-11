import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BookingForm from "@/app/book/[slug]/BookingForm";

/**
 * Chrome-less booking form for embedding in a company's own website via
 * <iframe>. Same form + API as /book/[slug], minus header and page styling.
 */
export default async function EmbedBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) notFound();

  return (
    <div className="app-ui bg-white p-4">
      <BookingForm companySlug={slug} />
    </div>
  );
}
