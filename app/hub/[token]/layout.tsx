import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";

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
    include: { company: { select: { name: true } } },
  });
  if (!contact) notFound();

  const base = `/hub/${token}`;
  const nav = [
    { href: base, label: "Home" },
    { href: `${base}/quotes`, label: "Quotes" },
    { href: `${base}/invoices`, label: "Invoices" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Company-branded header */}
      <header className="bg-[#0C0F0C]">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <h1 className="text-lg font-bold text-white">{contact.company.name}</h1>
          <p className="text-xs text-white/50">
            Client hub for {contact.firstName} {contact.lastName}
          </p>
          <nav className="flex gap-1 mt-4 -mb-5">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-2 text-sm font-medium text-white/70 hover:text-white rounded-t bg-white/5 hover:bg-white/10 transition-colors"
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
