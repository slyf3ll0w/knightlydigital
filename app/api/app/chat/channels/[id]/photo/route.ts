import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";
import { canSetChatCover, chatCoverKey, chatCoverUrl, resolveChannel } from "@/lib/chat";
import {
  deleteObject,
  getObjectBytes,
  isBlobStorageConfigured,
  putObject,
  signedGetUrl,
  wantsBytes,
} from "@/lib/blob-storage";

/**
 * A group chat's cover photo (ticket #8g5ymm). One per group, in R2 under
 * companies/<companyId>/chat-covers/ — never expires (it is not a chat
 * attachment, so the 7-day media sweep never touches it).
 *
 * GET    — the picture, for members of the chat only (same gate as a chat
 *          attachment: lib/chat.ts resolveChannel). Redirects to a signed R2
 *          URL, or streams the bytes for a script's fetch() (Sec-Fetch-Mode:
 *          cors — lib/blob-storage.ts wantsBytes).
 * POST   — set or replace it (multipart `file`, JPEG/PNG/WebP; the app
 *          shrinks it first). Any member, same rule as renaming.
 * DELETE — remove it. The old object is deleted on replace and remove (and
 *          when the last member leaves: channels/[id] DELETE).
 */

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const channel = await resolveChannel(actor, id);
  if (!channel?.photoKey || !isBlobStorageConfigured()) return new NextResponse(null, { status: 404 });
  try {
    if (wantsBytes(req.headers)) {
      const bytes = await getObjectBytes(channel.photoKey);
      if (!bytes) return new NextResponse(null, { status: 404 });
      const ext = channel.photoKey.split(".").pop();
      const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": type,
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const url = await signedGetUrl(channel.photoKey, 600);
    // Never let a cache hand out an expired signed URL.
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    reportError("[chat] cover read failed", { channelId: id, error: err });
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await limit(`chat-cover:${actor.id}`, 10, 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Give it a few seconds and try again." }, { status: 429 });

  const { id } = await params;
  const channel = await resolveChannel(actor, id);
  if (!channel) return NextResponse.json({ error: "That chat isn't available." }, { status: 404 });
  if (!canSetChatCover(channel)) {
    return NextResponse.json({ error: "Only group chats can have a photo." }, { status: 400 });
  }
  if (!isBlobStorageConfigured()) {
    return NextResponse.json({ error: "Photo storage isn't set up on this server yet." }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pick a photo." }, { status: 400 });
  const contentType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!TYPES.has(contentType)) return NextResponse.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too big." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });

  const key = chatCoverKey(actor.companyId, channel.id, contentType);
  try {
    await putObject(key, bytes, contentType);
  } catch (err) {
    reportError("[chat] cover upload failed", { channelId: channel.id, error: err });
    return NextResponse.json({ error: "The photo didn't upload. Try again." }, { status: 424 });
  }

  // The group may have been deleted while the photo uploaded.
  const updated = await prisma.chatChannel.updateMany({
    where: { id: channel.id, companyId: actor.companyId },
    data: { photoKey: key },
  });
  if (updated.count === 0) {
    await deleteObject(key).catch(() => {});
    return NextResponse.json({ error: "That chat isn't available any more." }, { status: 410 });
  }
  if (channel.photoKey && channel.photoKey !== key) {
    await deleteObject(channel.photoKey).catch((err) => reportError("[chat] old cover delete failed", { key: channel.photoKey, error: err }));
  }
  return NextResponse.json({ photoUrl: chatCoverUrl(channel.id, key) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const channel = await resolveChannel(actor, id);
  if (!channel) return NextResponse.json({ error: "That chat isn't available." }, { status: 404 });
  if (channel.isEveryone) return NextResponse.json({ error: "Only group chats can have a photo." }, { status: 400 });
  if (!channel.photoKey) return NextResponse.json({ success: true });

  await prisma.chatChannel.updateMany({
    where: { id: channel.id, companyId: actor.companyId, photoKey: channel.photoKey },
    data: { photoKey: null },
  });
  if (isBlobStorageConfigured()) {
    await deleteObject(channel.photoKey).catch((err) => reportError("[chat] cover delete failed", { key: channel.photoKey, error: err }));
  }
  return NextResponse.json({ success: true });
}
