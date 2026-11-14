import { notFound } from "next/navigation";
import { ChevronRight, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { slugWhere } from "@/lib/company-slug";
import { resolveAccent, textOn } from "@/lib/branding";
import { hubBrandVars } from "@/lib/hub-brand";
import { companyMeta } from "@/lib/client-meta";
import { loadBookingPage } from "@/lib/booking-public";
import { fmtPhone } from "@/lib/format";
import { publicEmail } from "@/lib/public-email";
import ForceLightTheme from "@/components/ForceLightTheme";
import PortalLoginForm from "./PortalLoginForm";

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
 * gradient, no icon perk list, no "Welcome back".
 *
 * Brand: ONE color carries the band — the first of primary / accent /
 * document color that holds white text (4.5:1), else console navy.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await prisma.company.findFirst({
    where: slugWhere(slug),
    select: { name: true, logoUrl: true },
  });
  return companyMeta(company, "Client login");
}

const CARD =
  "rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_12px_32px_-16px_rgba(16,24,40,0.2)]";

export default async function PortalLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await prisma.company.findFirst({
    where: slugWhere(slug),
    select: {
      name: true, slug: true, logoUrl: true, phone: true, email: true, hideEmail: true,
      brandColor: true, documentColor: true, brandColorSecondary: true,
    },
  });
  if (!found) notFound();
  // From here on `company.email` is what clients may see (null when hidden)
  const company = { ...found, email: publicEmail(found) };

  // Booking page reachable with something on it → new customers can ask for work
  const booking = await loadBookingPage(company.slug).catch(() => null);
  const requestHref = booking && booking.menu.length > 0 ? `/book/${company.slug}` : null;

  const brand = resolveAccent([company.brandColor, company.brandColorSecondary, company.documentColor], "#ffffff", "#0A1428", 4.5);
  const onBrand = textOn(brand);
  const phone = company.phone ? fmtPhone(company.phone) : null;
  const hasContact = Boolean(phone || company.email);
  // Desktop second card: new customers first, else just how to reach the company
  const sideCard = Boolean(requestHref || hasContact);

  const contactLines = hasContact && (
    <div className="flex flex-col gap-1 text-[13px] text-gray-600">
      {phone && (
        <a href={`tel:${company.phone}`} className="hover:underline">
          Questions? {phone}
        </a>
      )}
      {company.email && (
        <a href={`mailto:${company.email}`} className="break-all hover:underline">
          {company.email}
        </a>
      )}
    </div>
  );

  return (
    <div className="app-ui flex min-h-screen flex-col bg-[#f3f3f0] text-gray-900" style={hubBrandVars(company)}>
      <ForceLightTheme />

      {/* ── Brand band ─────────────────────────────────────────────────── */}
      <header className="pb-[72px] md:pb-[112px]" style={{ background: brand, color: onBrand }}>
        <div className="mx-auto flex max-w-[1040px] items-center gap-3 px-5 pt-6 md:gap-3.5 md:px-10 md:pt-8">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt={`${company.name} logo`}
              className="h-10 w-auto max-w-[120px] shrink-0 rounded-[10px] bg-white object-contain p-1 md:h-11 md:max-w-[150px]"
            />
          )}
          <p className="min-w-0 truncate text-[16px] font-semibold md:text-[18px]">{company.name}</p>
          <nav className="ml-auto hidden shrink-0 items-center gap-6 text-[14px] md:flex">
            {phone && (
              <a href={`tel:${company.phone}`} className="hover:underline">
                {phone}
              </a>
            )}
            {requestHref && (
              <a href={requestHref} className="font-semibold hover:underline">
                Request service
              </a>
            )}
          </nav>
        </div>
        <div className="mx-auto max-w-[1040px] px-5 pt-9 md:px-10 md:pt-[72px]">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] md:text-[40px]">Client login</h1>
        </div>
      </header>

      {/* ── Cards over the band's bottom edge ──────────────────────────── */}
      <main
        className={`anim-portal mx-auto -mt-12 grid w-full gap-3.5 px-4 md:-mt-[88px] md:gap-6 md:px-10 ${
          sideCard ? "max-w-[1040px] md:grid-cols-2" : "max-w-[600px]"
        }`}
      >
        <section className={`${CARD} px-5 py-6 md:p-9`}>
          <PortalLoginForm slug={company.slug} companyName={company.name} brand={brand} onBrand={onBrand} />
        </section>

        {/* Phones: one tappable row (the band's links are desktop-only) */}
        {requestHref && (
          <a
            href={requestHref}
            className={`${CARD} flex items-center justify-between gap-3 px-5 py-4 md:hidden`}
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">New customer?</span>
              <span className="mt-0.5 block text-[13px] text-gray-600">Request service</span>
            </span>
            <ChevronRight size={18} className="shrink-0" style={{ color: brand }} />
          </a>
        )}

        {/* Desktop: new customers / contact card beside the sign-in card */}
        {sideCard && (
          <section className={`${CARD} hidden flex-col p-9 md:flex`}>
            {requestHref ? (
              <>
                <h2 className="text-[18px] font-semibold">New customer?</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-600">
                  Tell us about the job and we&apos;ll get you on the schedule. Your account is set up with your first
                  visit.
                </p>
                <a
                  href={requestHref}
                  className="mt-6 flex h-12 items-center justify-center rounded-xl border border-gray-300 text-[15px] font-semibold transition-colors hover:bg-gray-50"
                  style={{ color: brand }}
                >
                  Request service
                </a>
                {hasContact && <div className="mt-auto border-t border-gray-100 pt-6">{contactLines}</div>}
              </>
            ) : (
              <>
                <h2 className="text-[18px] font-semibold">Need a hand?</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-600">
                  If you can&apos;t find your link or your email has changed, reach {company.name} directly.
                </p>
                <div className="mt-6">{contactLines}</div>
              </>
            )}
          </section>
        )}
      </main>

      <footer className="mt-auto flex flex-col items-center gap-1.5 px-4 pt-10 pb-7 text-[12px] text-gray-500">
        {phone && (
          <a
            href={`tel:${company.phone}`}
            className="flex items-center gap-1.5 py-1.5 text-[13px] font-medium text-gray-700 md:hidden"
          >
            <Phone size={14} className="opacity-70" />
            Call {phone}
          </a>
        )}
        <span>Secure sign-in by WorkBench</span>
      </footer>
    </div>
  );
}
