import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getServiceOnboarding, isOnboardingComplete, OnboardingResponses } from "@/lib/onboarding";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["ADMIN", "STAFF"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const onboardings = await prisma.onboarding.findMany({ where: { clientId } });
  return NextResponse.json(onboardings);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["ADMIN", "STAFF"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, serviceKey, responses } = await req.json();
  if (!clientId || !serviceKey) {
    return NextResponse.json({ error: "clientId and serviceKey required" }, { status: 400 });
  }

  const service = getServiceOnboarding(serviceKey);
  const completedAt = service && isOnboardingComplete(service, responses as OnboardingResponses)
    ? new Date()
    : null;

  const onboarding = await prisma.onboarding.upsert({
    where: { clientId_serviceKey: { clientId, serviceKey } },
    update: { responses, completedAt, updatedAt: new Date() },
    create: { clientId, serviceKey, responses, completedAt },
  });

  return NextResponse.json(onboarding);
}
