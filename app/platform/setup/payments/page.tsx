import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { PAYMENTS_SETUP_SELECT, paymentsSetupGateEnabled, paymentsSetupRequired } from "@/lib/payments-gate";
import { squareEnvironment, squareSignupUrl } from "@/lib/square";
import { squareStatusForCompany } from "@/lib/square-connection";
import SetupPaymentsClient from "./SetupPaymentsClient";

export const metadata: Metadata = { title: "Set up payments" };
export const dynamic = "force-dynamic";

/**
 * The payment-setup step — the last part of signing up (2026-11-03). A
 * self-serve company lands here from the sign-up form and the platform
 * layout brings it back until Square is connected
 * (lib/payments-gate.ts paymentsSetupRequired). Two parts on one screen:
 * who pays the card fee (the Service fee switch, explained with both
 * options side by side), then Connect Square — with Square's sign-up link
 * for the chosen model for anyone who has no Square account yet.
 *
 * Also the "Set up online payments" door on the Home checklist for
 * companies from before the step existed: same screen, nothing held.
 */
export default async function SetupPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ square?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) redirect(session ? "/app/dashboard" : "/app/login");
  if (!paymentsSetupGateEnabled()) redirect("/app/dashboard");
  const { square: outcome } = await searchParams;

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { name: true, surchargeEnabled: true, suspendedAt: true, ...PAYMENTS_SETUP_SELECT },
  });
  if (!company || company.suspendedAt) redirect("/app/dashboard");

  const connected = Boolean(company.squareMerchantId) && company.squareConnectedAt != null;
  const status = connected ? await squareStatusForCompany(session.user.companyId) : null;

  return (
    <SetupPaymentsClient
      companyName={company.name}
      email={session.user.email ?? ""}
      isOwner={session.user.role === "OWNER"}
      required={paymentsSetupRequired(company)}
      connected={connected}
      businessName={status?.connected ? status.businessName : null}
      payout={status?.connected ? status.payout : null}
      serviceFeeOn={company.surchargeEnabled}
      // A company from before this step exists already runs on its switch's
      // value — show it chosen. A brand-new company's switch is only the
      // schema default: nobody has picked yet, so neither card is lit.
      preselect={company.paymentsRequiredAt == null}
      signupUrls={{ serviceFee: squareSignupUrl("serviceFee"), companyPaid: squareSignupUrl("companyPaid") }}
      sandbox={squareEnvironment() === "sandbox"}
      outcome={outcome ?? null}
    />
  );
}
