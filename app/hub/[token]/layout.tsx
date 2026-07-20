import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { brandHeader, shade, textOn } from "@/lib/branding";
import { companyMeta } from "@/lib/client-meta";
import ForceLightTheme from "@/components/ForceLightTheme";
import HubNav from "./HubNav";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: { company: { select: { name: true, logoUrl: true } } },
  });
  return companyMeta(contact?.company, "Client Hub");
}

export default async function HubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: {
      company: { select: { name: true, logoUrl: true, brandColor: true, brandColorSecondary: true } },
    },
  });
  if (!contact) notFound();

  const base = `/hub/${token}`;
  const headerBg = brandHeader(contact.company);
  const headerText = textOn(headerBg);

  return (
    <div className="app-ui min-h-screen bg-paper">
      {/* Client-facing: always light, never the operator's dark theme */}
      <ForceLightTheme />
      {/* Company-branded hero: gradient + subtle grain, greeting, underline tabs */}
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
        <div className="relative max-w-3xl mx-auto px-4 pt-6">
          <div className="anim-portal flex items-center gap-3">
            {contact.company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.company.logoUrl}
                alt={`${contact.company.name} logo`}
                className="h-14 w-auto max-w-[200px] rounded-md bg-white object-contain p-1 shrink-0"
              />
            ) : null}
            <p className="text-sm font-semibold" style={{ color: headerText, opacity: 0.85 }}>
              {contact.company.name}
            </p>
          </div>
          <div className="anim-portal anim-delay-1 mt-5">
            <h1
              className="numeral-ledger text-2xl sm:text-3xl font-semibold"
              style={{ color: headerText }}
            >
              Hi {contact.firstName}
            </h1>
            <p className="mt-1 text-sm" style={{ color: headerText, opacity: 0.6 }}>
              Welcome to your client hub
            </p>
          </div>
          <div className="anim-portal anim-delay-2 mt-6">
            <HubNav base={base} color={headerText} />
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
