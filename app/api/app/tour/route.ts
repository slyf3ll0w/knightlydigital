import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/** Mark the first-visit tour as seen (finished or skipped — either counts). */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: actor.id },
    data: { tourCompletedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
