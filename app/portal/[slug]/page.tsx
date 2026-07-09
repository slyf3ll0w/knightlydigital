import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { brandHeader, shade, textOn } from "@/lib/branding";
import { companyMeta } from "@/lib/client-meta";
import PortalLoginForm from "./PortalLoginForm";

/**
 * Company-branded client-portal sign-in. Magic-link style: the client enters
 * their email and we mail them their personal hub link — the link IS the
 * login. Companies can put /portal/[their-slug] on their website.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await prisma.company.findUnique({
    where: { slug },
    select: { name: true, logoUrl: true },
  });
  return companyMeta(company, "Client Portal");
}

export default async function PortalLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await prisma.company.findUnique({
    where: { slug },
    select: { name: true, logoUrl: true, brandColor: true, brandColorSecondary: true },
  });
  if (!company) notFound();

  const headerBg = brandHeader(company);
  const headerText = textOn(headerBg);

  return (
    <div className="app-ui min-h-screen bg-paper flex flex-col">
      {/* Same branded hero as the hub — this is the portal's front door */}
      <header
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${headerBg} 0%, ${shade(headerBg, 0.3)} 100%)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, ${headerText} 1px, transparent 0)`,
            backgroundSize: "18px 18px",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-4 py-7">
          <div className="anim-portal flex items-center gap-3">
            {company.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logoUrl}
                alt={`${company.name} logo`}
                className="h-14 w-auto max-w-[200px] rounded-md bg-white object-contain p-1 shrink-0"
              />
            )}
            <div>
              <h1 className="text-lg font-bold" style={{ color: headerText }}>
                {company.name}
              </h1>
              <p className="text-xs" style={{ color: headerText, opacity: 0.55 }}>
                Client portal
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-12 pb-16">
        <div className="w-full max-w-md">
          <div className="anim-portal anim-delay-1 card-ledger p-6 sm:p-8">
            <h2 className="numeral-ledger text-xl font-semibold text-gray-900 mb-1">
              Sign in to your portal
            </h2>
            <p className="text-sm text-gray-600 mb-5">
              Enter the email address {company.name} has on file and we&apos;ll send you your
              personal portal link — no password needed.
            </p>
            <PortalLoginForm slug={slug} />
          </div>
          <p className="anim-portal anim-delay-2 mt-4 text-center text-xs text-gray-400">
            Already have your portal link? Just open it — it signs you straight in.
          </p>
        </div>
      </main>
    </div>
  );
}
