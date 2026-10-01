import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { notifyClientOfReply, portalThreadContactInclude } from "@/lib/portal-messages";
import { autoAdvance } from "@/lib/pipeline";
import { fireAutomations } from "@/lib/automations-server";
import { MMS_MAX_BYTES, MMS_TYPES, storeMessageMedia, threadMedia } from "@/lib/message-media";

/**
 * POST multipart — a picture (or clip) from the team, with optional words:
 * one thread message carrying the attachment. Fans out like a text reply
 * (lib/portal-messages.ts): push to the hub, an MMS from the business line
 * when the thread is a text conversation, email otherwise. Field names:
 * `file` (required), `body` (optional).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { contactId } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: actor.companyId, ...contactScope(actor) },
    include: portalThreadContactInclude,
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pick a photo or video to send." }, { status: 400 });
  const contentType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!MMS_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Photos (JPEG, PNG, GIF) and short videos (MP4) can be sent." }, { status: 415 });
  }
  if (file.size > MMS_MAX_BYTES) {
    return NextResponse.json({ error: "That file is too big to text — keep it under 1 MB." }, { status: 413 });
  }
  const bodyRaw = form?.get("body");
  const body = typeof bodyRaw === "string" ? bodyRaw.trim().slice(0, 5000) : "";
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });

  const message = await prisma.portalMessage.create({
    data: {
      companyId: actor.companyId,
      contactId: contact.id,
      direction: "OUTBOUND",
      senderId: actor.id,
      body,
      via: "portal",
    },
    include: { sender: { select: { name: true } } },
  });
  let media;
  try {
    media = await storeMessageMedia({ companyId: actor.companyId, messageId: message.id, bytes, contentType });
  } catch (err) {
    reportError("[messages] media store failed:", err);
    await prisma.portalMessage.delete({ where: { id: message.id } }).catch(() => {});
    return NextResponse.json({ error: "Couldn't save the photo. Try again." }, { status: 500 });
  }

  after(async () => {
    await notifyClientOfReply(contact, message.id, body, [media]).catch((err) =>
      reportError("[messages] client notify failed:", err)
    );
    fireAutomations(actor.companyId, "lead.contact_made", contact.id);
    await autoAdvance(prisma, actor.companyId, contact.id, "CONTACT_MADE").catch((err) =>
      reportError("[messages] lead auto-advance failed:", err)
    );
  });

  return NextResponse.json(
    {
      message: {
        id: message.id,
        direction: message.direction,
        body: message.body,
        via: message.via,
        createdAt: message.createdAt.toISOString(),
        senderName: message.sender?.name ?? null,
        media: threadMedia([media], "team"),
      },
    },
    { status: 201 }
  );
}
