import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getServiceOnboarding, isOnboardingComplete, OnboardingResponses } from "@/lib/onboarding";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const onboardings = await prisma.onboarding.findMany({
    where: { clientId: session.user.id },
  });
  return NextResponse.json(onboardings);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { serviceKey, responses } = await req.json();
  if (!serviceKey) return NextResponse.json({ error: "serviceKey required" }, { status: 400 });

  const service = getServiceOnboarding(serviceKey);
  const completedAt = service && isOnboardingComplete(service, responses as OnboardingResponses)
    ? new Date()
    : null;

  const onboarding = await prisma.onboarding.upsert({
    where: { clientId_serviceKey: { clientId: session.user.id, serviceKey } },
    update: { responses, completedAt, updatedAt: new Date() },
    create: { clientId: session.user.id, serviceKey, responses, completedAt },
  });

  return NextResponse.json(onboarding);
}
