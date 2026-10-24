import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { sendEmail, newFeedbackEmail } from "@/lib/email";
import { isBlobStorageConfigured, putObject } from "@/lib/blob-storage";
import { reportError } from "@/lib/report-error";
import {
  CHANGE_REQUEST_TAG,
  DETAILS_SEPARATOR,
  changeRequestDetails,
  changeRequestTitle,
  pathOf,
  sanitizeCapture,
  shortTicketId,
} from "@/lib/change-request";

/**
 * "Suggest a change" (components/SuggestChange.tsx, 2026-10-23): the note,
 * the capture (element, page, device, recent errors) and the picture of the
 * screen land as one SUGGESTION FeedbackTicket tagged pageUrl
 * "change-request". The picture goes to R2 under feedback/<company>/…; the
 * raw capture is kept as JSON next to the rendered text so
 * scripts/ticket.mts can hand Claude both. Test accounts only for now
 * (Company.isTest) — the entry points are hidden for everyone else, and
 * this route refuses them too.
 */
const FEEDBACK_INBOX = process.env.APPLICATION_INBOX ?? "info@streamflaire.com";
const MAX_SHOT_BYTES = 5_000_000;
const DAILY_LIMIT = 60;

function decodeDataUrl(s: unknown): { bytes: Buffer; contentType: string; ext: string } | null {
  if (typeof s !== "string" || s.length > MAX_SHOT_BYTES * 1.4) return null;
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) return null;
  const bytes = Buffer.from(m[3], "base64");
  if (!bytes.length || bytes.length > MAX_SHOT_BYTES) return null;
  return { bytes, contentType: m[1], ext: m[2] === "jpeg" ? "jpg" : m[2] };
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { isTest: true, name: true },
  });
  if (!company?.isTest) {
    return NextResponse.json({ error: "Change requests are on for test accounts only right now." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { note?: unknown; capture?: unknown; screenshot?: unknown } | null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (!note) return NextResponse.json({ error: "Say what should change, even briefly." }, { status: 400 });

  const recent = await prisma.feedbackTicket.count({
    where: { userId: actor.id, createdAt: { gte: new Date(Date.now() - 86400000) } },
  });
  if (recent >= DAILY_LIMIT) {
    return NextResponse.json({ error: "You've sent a lot today — please try again tomorrow." }, { status: 429 });
  }

  const capture = sanitizeCapture(body?.capture);
  const shot = decodeDataUrl(body?.screenshot);
  if (!shot) capture.shot = "none";

  // The picture first: a ticket without its picture is still useful, a
  // picture without its ticket is an orphan, so the key is only stored once
  // the upload has succeeded.
  let screenshotKey: string | null = null;
  if (shot && isBlobStorageConfigured()) {
    const key = `feedback/${actor.companyId}/${randomUUID()}.${shot.ext}`;
    try {
      await putObject(key, shot.bytes, shot.contentType);
      screenshotKey = key;
    } catch (err) {
      reportError("[feedback/change] screenshot upload failed", { companyId: actor.companyId, error: err });
      capture.shot = "none";
    }
  } else if (shot) {
    capture.shot = "none";
  }

  const details = changeRequestDetails(note, capture, {
    name: actor.name,
    id: actor.id,
    role: actor.role,
    companyId: actor.companyId,
    companyName: company.name,
  });
  const title = changeRequestTitle(note, capture);

  const ticket = await prisma.feedbackTicket.create({
    data: {
      type: "SUGGESTION",
      title,
      details,
      pageUrl: CHANGE_REQUEST_TAG,
      screenshotKey,
      capture: capture as unknown as Prisma.InputJsonValue,
      companyId: actor.companyId,
      userId: actor.id,
    },
    include: { user: { select: { name: true, email: true } }, company: { select: { name: true } } },
  });

  // The email carries the note + where; the picture and the capture stay on the ticket.
  await sendEmail({
    to: FEEDBACK_INBOX,
    ...newFeedbackEmail({
      type: "SUGGESTION",
      title: ticket.title,
      details:
        details.split(DETAILS_SEPARATOR).slice(0, 2).join("\n\n") +
        `\n\n(picture + full capture on the ticket — #${shortTicketId(ticket.id)}, id ${ticket.id})`,
      pageUrl: `Change request · ${pathOf(capture.page.url) || "unknown page"}`,
      userName: ticket.user?.name ?? actor.name,
      userEmail: ticket.user?.email ?? "",
      companyName: ticket.company.name,
    }),
  }).catch(() => undefined);

  return NextResponse.json({ id: ticket.id, short: shortTicketId(ticket.id) }, { status: 201 });
}
