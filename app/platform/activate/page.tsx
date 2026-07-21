import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { finixEnvironment } from "@/lib/finix";
import { syncFromFinix } from "@/lib/finix-status";
import { paymentsGateStatus } from "@/lib/payments-gate";
import ActivateClient from "./ActivateClient";

export const dynamic = "force-dynamic";

/**
 * The payment-verification gate. New companies land here after signup and
 * stay until they complete the hosted Finix onboarding form (KYC/KYB).
 * Completing the form (merchant PROVISIONING) unlocks the app in a limited
 * "pending" mode; REJECTED locks the account. The platform layout renders
 * this page standalone and redirects gated companies here from everywhere
 * else — see lib/payments-gate.ts for the state machine.
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ payments?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) redirect(session ? "/app/dashboard" : "/app/login");
  const { payments } = await searchParams;

  const companyId = session.user.companyId;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      finixOnboardingFormId: true,
      finixOnboardingState: true,
      paymentsWaived: true,
    },
  });
  if (!company) redirect("/app/dashboard");

  // Pull fresh state from Finix whenever it could have moved — especially the
  // bounce back from the hosted form (?payments=submitted).
  let state = company.finixOnboardingState;
  if (company.finixOnboardingFormId && state !== "APPROVED") {
    const synced = await syncFromFinix(companyId);
    if (synced) state = synced.state;
  }

  const gate = paymentsGateStatus({ paymentsWaived: company.paymentsWaived, finixOnboardingState: state });
  if (gate === "off" || gate === "approved") redirect("/app/dashboard");

  return (
    <ActivateClient
      status={gate}
      state={state}
      started={Boolean(company.finixOnboardingFormId)}
      justSubmitted={payments === "submitted"}
      isOwner={session.user.role === "OWNER"}
      sandbox={finixEnvironment() === "sandbox"}
      companyName={company.name}
    />
  );
}
