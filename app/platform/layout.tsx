import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { paymentsGateStatus } from "@/lib/payments-gate";
import { atlasAccess, ATLAS_ACCESS_SELECT, ATLAS_TRIAL_TOKENS } from "@/lib/assistant-access";
import AppShell from "@/components/AppShell";
import NativeShell from "@/components/NativeShell";
import AppLock from "@/components/AppLock";
import OfflineSupport from "@/components/OfflineSupport";
import ForegroundRefresh from "@/components/ForegroundRefresh";
import TeamLocationReporter from "@/components/TeamLocationReporter";
import ArrivalNudge from "@/components/ArrivalNudge";
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
        <AppLock />
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
            sidebarLogoSize: true,
            brandColor: true,
            brandColorSecondary: true,
            brandFont: true,
            sectionColors: true,
            assistantName: true,
            ...ATLAS_ACCESS_SELECT,
            finixOnboardingState: true,
            paymentsWaived: true,
            suspendedAt: true,
            accessPendingAt: true,
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
        <AppLock />
        {children}
      </>
    );
  }
  // Underwriting completion is the door: until the hosted Finix form is done
  // (gate "activate"), the account is held at /app/activate — no in-app
  // access. Completing it (PROVISIONING) opens the app in pending mode;
  // going fully live needs BOTH the application approved (accessPendingAt
  // cleared) and underwriting APPROVED. REJECTED locks the account.
  if (gate === "rejected" || gate === "activate") {
    redirect("/app/activate");
  }
  // Atlas paywall state (lib/assistant-access.ts) — the drawer shows the
  // trial/upsell for "locked", chat for "trial"/"full", nothing for "off".
  const atlas = company ? atlasAccess(company) : null;

  // ── The one status banner ──────────────────────────────────────────────────
  // Accounts are fully usable from day one; the banner's job is to keep the
  // onboarding moving. Never stack notices (it reads as clutter): the most
  // actionable thing wins — an underwriter request, then finishing payment
  // setup, then the pending-approval warning, then "under review" FYI.
  const pendingApproval = Boolean(company?.accessPendingAt && !company.suspendedAt);
  const updateRequested =
    gate === "pending" && company?.finixOnboardingState === "UPDATE_REQUESTED";

  return (
    <>
      <NativeShell />
      <AppLock offerSetup />
      <OfflineSupport />
      <ForegroundRefresh />
      <TeamLocationReporter />
      <ArrivalNudge />
      <AppShell
        userName={user?.name ?? session.user.name}
        userEmail={session.user.email}
        role={user?.role ?? session.user.role}
        companyName={company?.name ?? session.user.companyName}
        companyLogoUrl={company?.logoUrl}
        wallpaper={resolveWallpaper(company?.wallpaper, company?.logoWallpaper ?? false)}
        sidebarTheme={company?.sidebarTheme}
        sidebarLogoColor={company?.sidebarLogoColor}
        sidebarLogoSize={company?.sidebarLogoSize}
        brandColor={company?.brandColor}
        brandColorSecondary={company?.brandColorSecondary}
        brandFont={company?.brandFont}
        sectionColors={company?.sectionColors}
        teamCount={teamCount}
        needsTour={!!user && !user.tourCompletedAt}
        aiEnabled={Boolean(process.env.GEMINI_API_KEY) && !!atlas && atlas.level !== "off"}
        atlas={atlas ?? undefined}
        atlasTrialTokens={ATLAS_TRIAL_TOKENS}
        assistantName={company?.assistantName}
        userId={session.user.id}
      >
        {updateRequested ? (
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">Action needed on payment verification:</span>
            <span>the underwriter needs more information to approve your business.</span>
            <Link href="/app/activate" className="font-bold underline">
              Finish verification
            </Link>
          </div>
        ) : pendingApproval ? (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">Account pending approval</span> — a person is
            reviewing your application, usually within a business day. You can use WorkBench
            normally in the meantime, but if the application isn&apos;t approved you&apos;ll
            lose access to this account.
          </div>
        ) : gate === "pending" ? (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <span className="font-semibold">Payment verification under review</span> — card
            &amp; bank payments switch on the moment the underwriter approves you, usually
            within a business day.
          </div>
        ) : null}
        {children}
      </AppShell>
    </>
  );
}
