import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { paymentsGateStatus } from "@/lib/payments-gate";
import AppShell from "@/components/AppShell";
import NativeShell from "@/components/NativeShell";
import OfflineSupport from "@/components/OfflineSupport";
import TeamLocationReporter from "@/components/TeamLocationReporter";
import { resolveWallpaper } from "@/lib/wallpapers";

export const metadata: Metadata = {
  title: {
    absolute: "WorkBench",
    template: "%s · WorkBench",
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
            wallpaper: true,
            sidebarTheme: true,
            sidebarLogoColor: true,
            brandColor: true,
            brandColorSecondary: true,
            sectionColors: true,
            assistantName: true,
            finixOnboardingState: true,
            paymentsWaived: true,
            suspendedAt: true,
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

  // ── Payment-verification gate ──────────────────────────────────────────────
  // Every company must pass Finix underwriting before using the app (unless
  // waived from the superadmin console). Not-started/rejected companies are
  // held at /app/activate; PROVISIONING companies get in with a banner —
  // charging is impossible until APPROVED, so no money can move early.
  // Suspension outranks the gate — a suspended company should see the
  // contact-support screen (via requireActorPage), not the verification form.
  const path = (await headers()).get("x-wb-path") ?? "";
  const gate = company && !company.suspendedAt ? paymentsGateStatus(company) : "off";
  if (path === "/app/activate") {
    // The gate page renders standalone — no sidebar to navigate away with.
    return (
      <>
        <NativeShell />
        {children}
      </>
    );
  }
  if (gate === "activate" || gate === "rejected") {
    redirect("/app/activate");
  }

  return (
    <>
      <NativeShell />
      <OfflineSupport />
      <TeamLocationReporter />
      <AppShell
        userName={user?.name ?? session.user.name}
        userEmail={session.user.email}
        role={user?.role ?? session.user.role}
        companyName={company?.name ?? session.user.companyName}
        companyLogoUrl={company?.logoUrl}
        wallpaper={resolveWallpaper(company?.wallpaper, company?.logoWallpaper ?? false)}
        sidebarTheme={company?.sidebarTheme}
        sidebarLogoColor={company?.sidebarLogoColor}
        brandColor={company?.brandColor}
        brandColorSecondary={company?.brandColorSecondary}
        sectionColors={company?.sectionColors}
        teamCount={teamCount}
        needsTour={!!user && !user.tourCompletedAt}
        aiEnabled={Boolean(process.env.GEMINI_API_KEY)}
        assistantName={company?.assistantName}
        userId={session.user.id}
      >
        {gate === "pending" &&
          (company?.finixOnboardingState === "UPDATE_REQUESTED" ? (
            <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">Action needed on payment verification:</span>
              <span>the underwriter needs more information to approve your business.</span>
              <Link href="/app/activate" className="font-bold underline">
                Finish verification
              </Link>
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <span className="font-semibold">Payment verification under review</span> — usually
              done within a business day. Set up your account in the meantime; card and bank
              payments switch on the moment you&apos;re approved.
            </div>
          ))}
        {children}
      </AppShell>
    </>
  );
}
