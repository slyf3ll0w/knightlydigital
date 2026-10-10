import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, contactScope } from "@/lib/permissions";
import { resolveNextJob } from "@/lib/next-job";
import { DEFAULT_ON_MY_WAY_TEMPLATE, fillEta, renderMessageTemplate } from "@/lib/messaging";
import { notifyClientOfReply, portalThreadContactInclude } from "@/lib/portal-messages";
import { fireAutomations } from "@/lib/automations-server";
import { companyCanSendSms } from "@/lib/sms";

/**
 * POST — "tell my next client I'm on my way", hands-free. The app's own
 * On my way button opens the tech's Messages app with the template filled
 * in; Siri has no Messages app to hand off to, so the text goes out from
 * the business line as a client-thread message (the same path as the
 * Messages page), and the job is stamped and noted exactly as the button
 * does (app/api/app/jobs/[id]/on-my-way). No drive-time ETA — Siri's
 * request carries no position — so the {{eta}} phrase is dropped.
 *
 * A company with no business line (or one not yet registered for texting)
 * can't send from the thread, so the reply is `{ handoff: true, phone,
 * body }` instead: the intent brings the app forward and opens the phone's
 * Messages app with the text filled in — exactly what the app's own button
 * does — and the job is stamped the same way.
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

  const fromLine = await companyCanSendSms(actor.companyId);
  if (fromLine) {
    const message = await prisma.portalMessage.create({
      data: { companyId: actor.companyId, contactId: contact.id, direction: "OUTBOUND", senderId: actor.id, body, via: "portal" },
      select: { id: true },
    });
    await notifyClientOfReply(contact, message.id, body);
  } else if (!contact.phone) {
    return NextResponse.json({ error: `${contact.firstName} has no phone number.` }, { status: 400 });
  }

  const sentAt = new Date();
  await Promise.all([
    prisma.job.update({ where: { id: job.id }, data: { onMyWaySentAt: sentAt } }),
    prisma.jobNote.create({
      data: {
        jobId: job.id,
        userId: actor.id,
        body: fromLine
          ? `Sent ${contact.firstName} an "on my way" text (via Siri).`
          : `Sent ${contact.firstName} an "on my way" text (via Siri, from your phone).`,
      },
    }),
  ]);
  fireAutomations(actor.companyId, "job.on_my_way", job.id);

  return NextResponse.json({
    success: true,
    job: { id: job.id, title: job.title },
    client: contact.firstName,
    ...(fromLine ? {} : { handoff: true, phone: contact.phone, body }),
  });
}
