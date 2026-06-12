import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { brandHeader, textOn } from "@/lib/branding";
import { companyMeta } from "@/lib/client-meta";

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
    include: { company: { select: { name: true, logoUrl: true, brandColor: true } } },
  });
  if (!contact) notFound();

  const base = `/hub/${token}`;
  const nav = [
    { href: base, label: "Home" },
    { href: `${base}/quotes`, label: "Quotes" },
    { href: `${base}/invoices`, label: "Invoices" },
  ];

  const headerBg = brandHeader(contact.company);
  const headerText = textOn(headerBg);

  return (
    <div className="app-ui min-h-screen bg-paper">
      {/* Company-branded header */}
      <header style={{ backgroundColor: headerBg }}>
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3">
            {contact.company.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.company.logoUrl}
                alt={`${contact.company.name} logo`}
                className="h-10 w-auto max-w-[140px] object-contain shrink-0"
              />
            )}
            <div>
              <h1 className="text-lg font-bold" style={{ color: headerText }}>
                {contact.company.name}
              </h1>
              <p className="text-xs" style={{ color: headerText, opacity: 0.55 }}>
                Client hub for {contact.firstName} {contact.lastName}
              </p>
            </div>
          </div>
          <nav className="flex gap-1 mt-4 -mb-5">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-2 text-sm font-medium rounded-t transition-opacity hover:opacity-100"
                style={{
                  color: headerText,
                  opacity: 0.75,
                  backgroundColor:
                    headerText === "#ffffff" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
