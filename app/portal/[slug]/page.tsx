import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { slugWhere } from "@/lib/company-slug";
import { companyMeta } from "@/lib/client-meta";
import { loadBookingPage } from "@/lib/booking-public";
import { publicEmail } from "@/lib/public-email";
import ForceLightTheme from "@/components/ForceLightTheme";
import { loadClientTheme } from "@/lib/client-theme-load";
import PortalLogin from "./PortalLogin";

/**
 * Company-branded client-portal sign-in — the one link an owner puts behind
 * a "Client login" button on their website. Magic-link style: the client
 * enters their email and we mail them their personal hub link (the link IS
 * the login).
 *
 * Never says whether an email is on file (anyone could test a neighbor's
 * address). New customers get their path a different way: "Request service"
 * to the booking page sits beside the sign-in card.
 *
 * Layout ("brand band", picked 2026-11-14): a solid band of the company's
 * color with its name and "Client login", and white cards that overlap the
 * band's bottom edge, like a bank or utility login. Deliberately plain: no
 * gradient, no icon perk list, no "Welcome back". Since 2026-11-20 in the
 * heavy look on the portal home's band (PortalLogin.tsx, lib/client-band.ts).
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await prisma.company.findFirst({
    where: slugWhere(slug),
    select: { name: true, logoUrl: true },
  });
  return companyMeta(company, "Client login");
}

export default async function PortalLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await prisma.company.findFirst({
    where: slugWhere(slug),
    select: {
      id: true, name: true, slug: true, logoUrl: true, phone: true, email: true, hideEmail: true,
      brandColor: true, documentColor: true, brandColorSecondary: true,
    },
  });
  if (!found) notFound();
  // From here on `company.email` is what clients may see (null when hidden)
  const company = { ...found, email: publicEmail(found) };

  // Booking page reachable with something on it → new customers can ask for work
  const booking = await loadBookingPage(company.slug).catch(() => null);
  const requestHref = booking && booking.menu.length > 0 ? `/book/${company.slug}` : null;
  // The page-designer theme (Pro): default look otherwise
  const theme = await loadClientTheme(found.id);

  return (
    <>
      <ForceLightTheme />
      <PortalLogin company={company} requestHref={requestHref} theme={theme} />
    </>
  );
}
