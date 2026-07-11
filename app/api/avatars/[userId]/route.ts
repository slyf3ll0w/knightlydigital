import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * Serve a teammate's profile picture. Same-company only; 404 when the user
 * has no photo (the Avatar component falls back to initials). ETag'd on the
 * upload timestamp so polling UIs revalidate cheaply.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const actor = await getActor();
  if (!actor) return new NextResponse(null, { status: 401 });

  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId: actor.companyId },
    select: { avatarData: true, avatarMime: true, avatarUpdatedAt: true },
  });
  if (!user?.avatarData || !user.avatarMime) return new NextResponse(null, { status: 404 });

  const etag = `"av-${user.avatarUpdatedAt?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  return new NextResponse(Buffer.from(user.avatarData), {
    headers: {
      "Content-Type": user.avatarMime,
      "Cache-Control": "private, max-age=300",
      ETag: etag,
    },
  });
}
