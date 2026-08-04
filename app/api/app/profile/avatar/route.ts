import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { accountUserIdsFor } from "@/lib/account";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // client resizes to a small square first

/** POST — set your profile picture (multipart "file"). DELETE — remove it. */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach an image file." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large." }, { status: 400 });
  }

  // Account-level identity: the photo follows the person to every company
  // they're a member of (each row keeps a copy so /api/avatars/[userId]
  // serving stays a single-row read).
  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.user.updateMany({
    where: { id: { in: await accountUserIdsFor(actor.id) } },
    data: { avatarData: bytes, avatarMime: file.type, avatarUpdatedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.updateMany({
    where: { id: { in: await accountUserIdsFor(actor.id) } },
    data: { avatarData: null, avatarMime: null, avatarUpdatedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
