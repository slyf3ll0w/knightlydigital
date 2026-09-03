import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Railway's deploy healthcheck (and any uptime monitor) hits this. It must
// prove the app can actually serve tenants — process up AND database
// reachable — so a deploy whose `prisma db push` left the DB broken, or a
// container that lost its connection, never replaces a working deployment.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
