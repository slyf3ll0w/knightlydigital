import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit, clientIp } from "@/lib/rate-limit";
import {
  notifyTeamOfClientMessage,
  portalThreadContactInclude,
} from "@/lib/portal-messages";
import { suspendedResponse } from "@/lib/suspension";

/**
 * Public (hub-token-authed): the client asks to move a visit. This is a
 * REQUEST, not a self-serve write — it lands in the portal message thread
 * (which already pushes/emails the team), so scheduling stays in the
 * company's hands and the whole exchange is on the record.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!limit(`hub-resched:${ip}`, 20, 3600_000).ok) {
    return NextResponse.json({ error: "Too many requests — please try again later." }, { status: 429 });
  }

  const data = await req.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  const kind = data?.kind === "appointment" ? "appointment" : "job";
  const id = typeof data?.id === "string" ? data.id : "";
  const note = typeof data?.note === "string" ? data.note.trim().slice(0, 1000) : "";
  if (!token || !id) return NextResponse.json({ error: "Missing details." }, { status: 400 });

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: portalThreadContactInclude,
  });
  if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const gate = await prisma.company.findUnique({
    where: { id: contact.companyId },
    select: { suspendedAt: true, timezone: true },
  });
  if (gate?.suspendedAt) {
    return suspendedResponse("This business can't take requests right now.");
  }
  // Dates render in the company's timezone — the server's own zone can be a
  // day off around midnight
  const dateOpts = {
    month: "long",
    day: "numeric",
    timeZone: gate?.timezone ?? "America/Chicago",
  } as const;

  // Resolve the visit (must belong to this client) for an accurate label
  let label: string | null = null;
  if (kind === "job") {
    const job = await prisma.job.findFirst({
      where: { id, contactId: contact.id },
      select: { title: true, jobNumber: true, scheduledAt: true },
    });
    if (job) {
      label = `job #${job.jobNumber} (${job.title})${
        job.scheduledAt ? ` on ${job.scheduledAt.toLocaleDateString("en-US", dateOpts)}` : ""
      }`;
    }
  } else {
    const appt = await prisma.appointment.findFirst({
      where: { id, contactId: contact.id },
      select: { title: true, scheduledAt: true },
    });
    if (appt) {
      label = `the ${appt.title} appointment on ${appt.scheduledAt.toLocaleDateString("en-US", dateOpts)}`;
    }
  }
  if (!label) return NextResponse.json({ error: "Visit not found." }, { status: 404 });

  const body = `Reschedule request for ${label}.${note ? `\n\n"${note}"` : ""}`;
  const message = await prisma.portalMessage.create({
    data: {
      companyId: contact.companyId,
      contactId: contact.id,
      direction: "INBOUND",
      via: "portal",
      body,
    },
  });
  await notifyTeamOfClientMessage(contact, message.id, body, "portal");

  return NextResponse.json({ sent: true });
}
