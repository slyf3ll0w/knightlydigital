import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BookingForm from "@/app/book/[slug]/BookingForm";
import { brandAccent } from "@/lib/branding";

/**
 * Chrome-less booking form for embedding in a company's own website via
 * <iframe>. Same form + API as /book/[slug], minus header and page styling.
 *
 * Query params so it blends into the host site:
 *   ?theme=dark         dark inputs/labels (default light)
 *   ?transparent=1      no card background — sits directly on the host page
 * The button automatically uses the company's brand color.
 */
export default async function EmbedBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ theme?: string; transparent?: string }>;
}) {
  const { slug } = await params;
  const { theme, transparent } = await searchParams;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) notFound();

  const dark = theme === "dark";
  const isTransparent = transparent === "1";

  return (
    <div
      className="app-ui p-4 min-h-screen"
      style={{
        backgroundColor: isTransparent ? "transparent" : dark ? "#0C0F0C" : "#ffffff",
      }}
    >
      <BookingForm
        companySlug={slug}
        theme={dark ? "dark" : "light"}
        accent={brandAccent(company)}
        transparent={isTransparent}
      />
    </div>
  );
}
