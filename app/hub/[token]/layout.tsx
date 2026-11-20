import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { companyMeta } from "@/lib/client-meta";
import ForceLightTheme from "@/components/ForceLightTheme";
import ViewBeacon from "@/components/ViewBeacon";
import HubPwa from "@/components/HubPwa";
import HubShell from "./HubShell";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: { company: { select: { name: true, logoUrl: true } } },
  });
  return {
    ...companyMeta(contact?.company, "Client Hub"),
    // Installable PWA: per-company manifest (company name + brand color,
    // scoped to this hub) + iOS standalone metadata
    manifest: `/hub/${token}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default" as const,
      title: contact?.company.name ?? "Client Portal",
    },
  };
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
      company: { select: { name: true, logoUrl: true, brandColor: true, documentColor: true, brandColorSecondary: true } },
    },
  });
  if (!contact) notFound();

  const unreadMessages = await prisma.portalMessage.count({
    where: { contactId: contact.id, direction: "OUTBOUND", readByClientAt: null },
  });

  // The heavy shell (HubShell): the company's color as one solid band with
  // the greeting and desktop tabs, white cards on a tinted ground, the
  // phone's bottom tab bar. Brand vars ride its root, so the other tabs'
  // existing pieces (tab inks, accents) keep running in the tenant's colors.
  return (
    <>
      {/* Client-facing: always light, never the operator's dark theme */}
      <ForceLightTheme />
      <ViewBeacon kind="hub" token={token} />
      <HubPwa />
      <HubShell company={contact.company} firstName={contact.firstName} base={`/hub/${token}`} unreadMessages={unreadMessages}>
        {children}
      </HubShell>
    </>
  );
}
