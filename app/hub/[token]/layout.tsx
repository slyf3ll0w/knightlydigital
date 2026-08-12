import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { brandHeader, shade, textOn } from "@/lib/branding";
import { hubBrandVars } from "@/lib/hub-brand";
import { companyMeta } from "@/lib/client-meta";
import ForceLightTheme from "@/components/ForceLightTheme";
import ViewBeacon from "@/components/ViewBeacon";
import HubPwa from "@/components/HubPwa";
import HubNav from "./HubNav";

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

  const base = `/hub/${token}`;
  const headerBg = brandHeader(contact.company);
  const headerText = textOn(headerBg);

  return (
    // Brand vars on the root: the whole design system — paper grid, ledger
    // cards, the green→accent bridge, stamps, tab inks — runs in the
    // tenant's colors, exactly like AppShell does for the operator app.
    <div className="app-ui min-h-screen bg-paper" style={hubBrandVars(contact.company)}>
      {/* Client-facing: always light, never the operator's dark theme */}
      <ForceLightTheme />
      <ViewBeacon kind="hub" token={token} />
      <HubPwa />
      {/* Company-branded hero: clean gradient, dashboard-style greeting;
          desktop tabs live on the hero, phones get the app's bottom tab
          bar (rendered by HubNav). */}
      <header
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${headerBg} 0%, ${shade(headerBg, 0.3)} 100%)`,
        }}
      >
        <div className="relative max-w-3xl mx-auto px-4 pt-6 pb-6 lg:pb-0">
          <div className="anim-portal flex items-center gap-3">
            {contact.company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.company.logoUrl}
                alt={`${contact.company.name} logo`}
                className="h-12 w-auto max-w-[180px] rounded-[10px] bg-white object-contain p-1 shrink-0 shadow-sm"
              />
            ) : null}
            <p className="text-sm font-semibold" style={{ color: headerText, opacity: 0.85 }}>
              {contact.company.name}
            </p>
          </div>
          <div className="anim-portal anim-delay-1 mt-5">
            <p className="text-[13px] font-medium" style={{ color: headerText, opacity: 0.6 }}>
              Your client portal
            </p>
            <h1
              className="font-display mt-0.5 text-[27px] sm:text-3xl font-bold tracking-tight"
              style={{ color: headerText }}
            >
              Hi {contact.firstName}
            </h1>
          </div>
          <div className="anim-portal anim-delay-2 mt-6 hidden lg:block">
            <HubNav
              base={base}
              variant="top"
              color={headerText}
              badgeTextColor={headerBg}
              unreadMessages={unreadMessages}
            />
          </div>
        </div>
        {/* Ledger margin rule — the app frame's signature: primary running
            into accent along the header's bottom edge. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.5px]"
          style={{ background: "linear-gradient(90deg, var(--wb-primary, #0A1428), var(--wb-accent, #0B57D8))" }}
        />
      </header>
      {/* Bottom padding clears the fixed phone tab bar (+ home indicator). */}
      <main className="max-w-3xl mx-auto px-4 py-6 lg:py-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        {children}
      </main>
      {/* Phone chrome: the app's bottom tab bar */}
      <HubNav
        base={base}
        variant="bottom"
        color={headerText}
        badgeTextColor={headerBg}
        unreadMessages={unreadMessages}
      />
    </div>
  );
}
