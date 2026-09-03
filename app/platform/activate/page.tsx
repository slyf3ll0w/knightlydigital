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
 * The payment-setup step. New companies land here straight from /apply and
 * complete the hosted Finix onboarding form (KYC/KYB) — but the account is
 * fully usable either way ("look around first" door + layout banner nudges
 * them back until the form is done). REJECTED locks the account. See
 * lib/payments-gate.ts for the state machine.
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
      email={session.user.email ?? ""}
    />
  );
}
