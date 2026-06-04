import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { OnboardingClient } from "./OnboardingClient";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");

  const onboardings = await prisma.onboarding.findMany({
    where: { clientId: session.user.id },
  });

  return (
    <OnboardingClient
      userName={session.user.name ?? ""}
      initialOnboardings={Object.fromEntries(
        onboardings.map((o) => [
          o.serviceKey,
          {
            responses: o.responses as Record<string, string | string[]>,
            completedAt: o.completedAt?.toISOString() ?? null,
          },
        ])
      )}
    />
  );
}
