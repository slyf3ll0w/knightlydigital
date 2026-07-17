import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import NativeShell from "@/components/NativeShell";
import OfflineSupport from "@/components/OfflineSupport";

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
  if (!session)
    return (
      <>
        <NativeShell />
        {children}
      </>
    );

  // Fresh from DB (not JWT) so logo/brand and role changes apply without re-login
  const [company, user, teamCount] = await Promise.all([
    session.user.companyId
      ? prisma.company.findUnique({
          where: { id: session.user.companyId },
          select: {
            name: true,
            logoUrl: true,
            logoWallpaper: true,
            sidebarTheme: true,
            sidebarLogoColor: true,
            brandColor: true,
            brandColorSecondary: true,
            assistantName: true,
          },
        })
      : null,
    session.user.id
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: { role: true, name: true, tourCompletedAt: true },
        })
      : null,
    // Team chat only makes sense with someone to talk to (>1 active member)
    session.user.companyId
      ? prisma.user.count({ where: { companyId: session.user.companyId, isActive: true } })
      : 0,
  ]);

  return (
    <>
      <NativeShell />
      <OfflineSupport />
      <AppShell
        userName={user?.name ?? session.user.name}
        userEmail={session.user.email}
        role={user?.role ?? session.user.role}
        companyName={company?.name ?? session.user.companyName}
        companyLogoUrl={company?.logoUrl}
        logoWallpaper={company?.logoWallpaper ?? false}
        sidebarTheme={company?.sidebarTheme}
        sidebarLogoColor={company?.sidebarLogoColor}
        brandColor={company?.brandColor}
        brandColorSecondary={company?.brandColorSecondary}
        teamCount={teamCount}
        needsTour={!!user && !user.tourCompletedAt}
        aiEnabled={Boolean(process.env.GEMINI_API_KEY)}
        assistantName={company?.assistantName}
        userId={session.user.id}
      >
        {children}
      </AppShell>
    </>
  );
}
