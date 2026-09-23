import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canSell, getSession, peekActor } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { hasAddon } from "@/lib/addon";
import { voiceConfigured } from "@/lib/telnyx";
import { SOFTPHONE_ROLES } from "@/lib/softphone";
import { isIosShellUserAgent } from "@/lib/sign-in-options";
import { prisma } from "@/lib/db";
import { paymentsGateStatus } from "@/lib/payments-gate";
import { atlasAccess, ATLAS_ACCESS_SELECT, ATLAS_PRICING } from "@/lib/assistant-access";
import AppShell from "@/components/AppShell";
import NativeShell from "@/components/NativeShell";
import AppLock from "@/components/AppLock";
import OfflineSupport from "@/components/OfflineSupport";
import ForegroundRefresh from "@/components/ForegroundRefresh";
import TeamLocationReporter from "@/components/TeamLocationReporter";
import ArrivalNudge from "@/components/ArrivalNudge";
import Softphone from "@/components/Softphone";
import { resolveWallpaper } from "@/lib/wallpapers";

export const metadata: Metadata = {
  title: {
    absolute: "WorkBench",
    template: "%s · WorkBench",
  },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Memoised per request (lib/permissions) — the page's requirePageActor
  // reuses this decode and the user lookup below instead of repeating them.
  const session = await getSession();

  // No session: render without AppShell (login/register pages render standalone)
  // Middleware + individual pages handle auth redirects for protected routes.
  //
  // No COMPANY yet (a Google sign-up that hasn't opened its business —
  // lib/social-login.ts): same thing. Middleware only ever lets such a
  // session reach the public onboarding pages, and wrapping those in the
  // sidebar shell showed a half-built app around the signup form.
  if (!session || !session.user.companyId)
    return (
      <>
        <NativeShell />
        <AppLock />
        {children}
      </>
    );

  // Fresh from DB (not JWT) so logo/brand and role changes apply without re-login
  const [company, { user, actor }, teamCount] = await Promise.all([
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
            addonActiveAt: true,
            lineVoiceAppAt: true,
          },
        })
      : null,
    peekActor(),
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
  // The gate page renders standalone — no sidebar to navigate away with. So
  // do the auth pages a signed-in person can still open (Forgot password,
  // the signup door): a reset form inside the app's sidebar reads as a
  // broken app page.
  const standalone = new Set(["/app/activate", "/app/forgot-password", "/app/get-started"]);
  if (standalone.has(path)) {
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
  // spent-meter notice for "locked", chat for "free"/"plan"/"full", nothing for "off".
  const atlas = company ? atlasAccess(company) : null;

  // ── The one status banner ──────────────────────────────────────────────────
  // Accounts are fully usable from day one; the banner's job is to keep the
  // onboarding moving. Never stack notices (it reads as clutter): the most
  // actionable thing wins — an underwriter request, then finishing payment
  // setup, then the pending-approval warning, then "under review" FYI.
  const pendingApproval = Boolean(company?.accessPendingAt && !company.suspendedAt);
  // Business-line calls in the browser (lib/softphone.ts): mounted only once
  // the number is on the voice app; the grant route re-checks everything else.
  const softphone = Boolean(company && user && voiceConfigured() && company.lineVoiceAppAt && hasAddon(company) && canSell(user.role as Role));
  // The iPhone rings for every company on the login (lib/voip.ts). Signed
  // into one without a line, the app must still hear the push and switch
  // over, so the softphone mounts (and stays "off") whenever another
  // membership of this login can take calls.
  const ringsForSibling =
    !softphone && user && voiceConfigured() && isIosShellUserAgent((await headers()).get("user-agent"))
      ? (await prisma.user.count({
          where: {
            id: { not: session.user.id },
            account: { users: { some: { id: session.user.id } } },
            isActive: true,
            softphoneEnabled: true,
            role: { in: [...SOFTPHONE_ROLES] },
            company: { lineVoiceAppAt: { not: null } },
          },
        })) > 0
      : false;
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
      {(softphone || ringsForSibling) && <Softphone />}
      <AppShell
        userName={user?.name ?? session.user.name}
        userEmail={session.user.email}
        role={user?.role ?? session.user.role}
        salesSeePayments={actor?.salesSeePayments ?? true}
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
        atlasPricing={ATLAS_PRICING}
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
