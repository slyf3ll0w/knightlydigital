import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: {
    absolute: "JobFlow",
    template: "%s · JobFlow",
  },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // No session: render without AppShell (login/register pages render standalone)
  // Middleware + individual pages handle auth redirects for protected routes.
  if (!session) return <>{children}</>;

  // Fresh from DB (not JWT) so logo/brand changes apply without re-login
  const company = session.user.companyId
    ? await prisma.company.findUnique({
        where: { id: session.user.companyId },
        select: { name: true, logoUrl: true, brandColor: true },
      })
    : null;

  return (
    <AppShell
      userName={session.user.name}
      userEmail={session.user.email}
      companyName={company?.name ?? session.user.companyName}
      companyLogoUrl={company?.logoUrl}
      brandColor={company?.brandColor}
    >
      {children}
    </AppShell>
  );
}
