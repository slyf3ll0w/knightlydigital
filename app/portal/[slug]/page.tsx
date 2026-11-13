import { notFound } from "next/navigation";
import { CalendarDays, CreditCard, FileCheck2, MessageSquare, Phone, Mail } from "lucide-react";
import { prisma } from "@/lib/db";
import { slugWhere } from "@/lib/company-slug";
import { resolveAccent, shade, textOn } from "@/lib/branding";
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
 * to the booking page sits on the page and on the after-submit screen.
 *
 * Brand: ONE color carries the page — the first of primary / accent /
 * document color that holds white text (4.5:1), else console navy. The
 * document color alone is often white, which made the old header a
 * white→gray fade with no brand in it.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await prisma.company.findFirst({
    where: slugWhere(slug),
    select: { name: true, logoUrl: true },
  });
  return companyMeta(company, "Client login");
}

const PERKS = [
  { icon: CalendarDays, text: "See your upcoming visits" },
  { icon: FileCheck2, text: "Approve quotes and sign agreements" },
  { icon: CreditCard, text: "Pay invoices and save a card" },
  { icon: MessageSquare, text: "Message us and request more work" },
];

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
  const brandDeep = shade(brand, 0.22);

  const contact = (
    <div className="space-y-1.5 text-[13px]">
      {company.phone && (
        <a href={`tel:${company.phone}`} className="flex items-center gap-2 hover:underline">
          <Phone size={14} className="shrink-0 opacity-70" />
          {fmtPhone(company.phone)}
        </a>
      )}
      {company.email && (
        <a href={`mailto:${company.email}`} className="flex items-center gap-2 break-all hover:underline">
          <Mail size={14} className="shrink-0 opacity-70" />
          {company.email}
        </a>
      )}
    </div>
  );

  return (
    <div className="app-ui flex min-h-screen flex-col bg-[#f6f6f4]" style={hubBrandVars(company)}>
      <ForceLightTheme />
      <main className="flex flex-1 items-start justify-center px-4 pt-4 pb-6 sm:items-center sm:py-12">
        <div className="anim-portal w-full max-w-[880px] overflow-hidden rounded-[22px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_24px_48px_-24px_rgba(16,24,40,0.22)] md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* ── Brand side ─────────────────────────────────────────────── */}
          <section
            className="relative flex flex-col gap-7 px-6 py-6 md:min-h-[540px] md:px-9 md:py-10"
            style={{ background: `linear-gradient(160deg, ${brand} 0%, ${brandDeep} 100%)`, color: onBrand }}
          >
            <div className="flex items-center gap-3.5">
              {company.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logoUrl}
                  alt={`${company.name} logo`}
                  className="h-14 w-auto max-w-[150px] shrink-0 rounded-xl bg-white object-contain p-1.5"
                />
              )}
              <div className="min-w-0">
                <p className="text-[17px] font-semibold leading-snug">{company.name}</p>
                <p className="text-[13px] opacity-75">Client portal</p>
              </div>
            </div>

            <ul className="hidden space-y-3.5 md:block">
              {PERKS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[15px]">
                  <Icon size={18} className="shrink-0 opacity-80" />
                  {text}
                </li>
              ))}
            </ul>

            {(company.phone || company.email) && (
              <div className="mt-auto hidden md:block">
                <p className="mb-2 text-[13px] opacity-75">Questions? Reach us</p>
                {contact}
              </div>
            )}
          </section>

          {/* ── Sign-in side ───────────────────────────────────────────── */}
          <section className="flex flex-col justify-center px-6 py-8 md:px-12 md:py-12">
            <PortalLoginForm
              slug={company.slug}
              companyName={company.name}
              brand={brand}
              onBrand={onBrand}
              requestHref={requestHref}
            />
          </section>
        </div>
      </main>

      {/* Phones: perks + contact under the card (the brand side shows them on desktop) */}
      <div className="anim-portal anim-delay-2 mx-auto w-full max-w-[880px] px-6 pb-8 md:hidden">
        <ul className="space-y-3 text-[14px] text-gray-700">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <Icon size={17} className="shrink-0" style={{ color: brand }} />
              {text}
            </li>
          ))}
        </ul>
        {(company.phone || company.email) && (
          <div className="mt-6 text-gray-600">
            <p className="mb-2 text-[13px] text-gray-500">Questions? Reach us</p>
            {contact}
          </div>
        )}
      </div>

      <p className="pb-6 text-center text-[11px] text-gray-400">Secure sign-in by WorkBench</p>
    </div>
  );
}
