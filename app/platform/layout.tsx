import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: {
    absolute: "Streamflaire Hub",
    template: "%s · Streamflaire Hub",
  },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // No session: render without AppShell (login/register pages render standalone)
  // Middleware + individual pages handle auth redirects for protected routes.
  if (!session) return <>{children}</>;

  // Fresh from DB (not JWT) so logo/brand and role changes apply without re-login
  const [company, user] = await Promise.all([
    session.user.companyId
      ? prisma.company.findUnique({
          where: { id: session.user.companyId },
          select: { name: true, logoUrl: true, brandColor: true, assistantName: true },
        })
      : null,
    session.user.id
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: { role: true, name: true, tourCompletedAt: true },
        })
      : null,
  ]);

  return (
    <AppShell
      userName={user?.name ?? session.user.name}
      userEmail={session.user.email}
      role={user?.role ?? session.user.role}
      companyName={company?.name ?? session.user.companyName}
      companyLogoUrl={company?.logoUrl}
      brandColor={company?.brandColor}
      needsTour={!!user && !user.tourCompletedAt}
      aiEnabled={Boolean(process.env.GEMINI_API_KEY)}
      assistantName={company?.assistantName}
    >
      {children}
    </AppShell>
  );
}
