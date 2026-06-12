import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { brandHeader, textOn } from "@/lib/branding";
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
    select: { name: true, logoUrl: true, brandColor: true },
  });
  if (!company) notFound();

  const headerBg = brandHeader(company);
  const headerText = textOn(headerBg);

  return (
    <div className="app-ui min-h-screen bg-paper flex flex-col">
      <header style={{ backgroundColor: headerBg }}>
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt={`${company.name} logo`}
              className="h-10 w-auto max-w-[140px] object-contain shrink-0"
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
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-12 pb-16">
        <div className="w-full max-w-md">
          <div className="card-ledger p-6 sm:p-8">
            <h2 className="numeral-ledger text-xl font-semibold text-gray-900 mb-1">
              Sign in to your portal
            </h2>
            <p className="text-sm text-gray-600 mb-5">
              Enter the email address {company.name} has on file and we&apos;ll send you your
              personal portal link — no password needed.
            </p>
            <PortalLoginForm slug={slug} />
          </div>
          <p className="mt-4 text-center text-xs text-gray-400">
            Already have your portal link? Just open it — it signs you straight in.
          </p>
        </div>
      </main>
    </div>
  );
}
