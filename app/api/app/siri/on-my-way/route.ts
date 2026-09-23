import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, contactScope } from "@/lib/permissions";
import { resolveNextJob } from "@/lib/next-job";
import { DEFAULT_ON_MY_WAY_TEMPLATE, fillEta, renderMessageTemplate } from "@/lib/messaging";
import { notifyClientOfReply, portalThreadContactInclude } from "@/lib/portal-messages";

/**
 * POST — "tell my next client I'm on my way", hands-free. The app's own
 * On my way button opens the tech's Messages app with the template filled
 * in; Siri has no Messages app to hand off to, so the text goes out from
 * the business line as a client-thread message (the same path as the
 * Messages page), and the job is stamped and noted exactly as the button
 * does (app/api/app/jobs/[id]/on-my-way). No drive-time ETA — Siri's
 * request carries no position — so the {{eta}} phrase is dropped.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const job = await resolveNextJob(actor);
  if (!job) return NextResponse.json({ error: "no-job" }, { status: 404 });

  const [contact, company, me] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: job.contactId, companyId: actor.companyId, ...contactScope(actor) },
      include: portalThreadContactInclude,
    }),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { name: true, onMyWayTemplate: true } }),
    prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }),
  ]);
  if (!contact || !company) return NextResponse.json({ error: "no-job" }, { status: 404 });

  const body = fillEta(
    renderMessageTemplate(company.onMyWayTemplate || DEFAULT_ON_MY_WAY_TEMPLATE, {
      firstName: contact.firstName,
      techName: me?.name ?? "",
      companyName: company.name,
    }),
    null
  ).trim();

  const message = await prisma.portalMessage.create({
    data: { companyId: actor.companyId, contactId: contact.id, direction: "OUTBOUND", senderId: actor.id, body, via: "portal" },
    select: { id: true },
  });
  await notifyClientOfReply(contact, message.id, body);

  const sentAt = new Date();
  await Promise.all([
    prisma.job.update({ where: { id: job.id }, data: { onMyWaySentAt: sentAt } }),
    prisma.jobNote.create({
      data: { jobId: job.id, userId: actor.id, body: `Sent ${contact.firstName} an "on my way" text (via Siri).` },
    }),
  ]);

  return NextResponse.json({ success: true, job: { id: job.id, title: job.title }, client: contact.firstName });
}
