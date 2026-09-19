import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, jobScope, viaContactScope } from "@/lib/permissions";

/**
 * GET /api/app/schedule/palette?q= — what the Schedule palette can drag onto
 * the calendar: clients and leads by name, open requests (booking forms,
 * client hub, internal), and unscheduled jobs. With no query it returns the
 * "waiting" lists — every NEW request and the most recently touched clients
 * — so the panel is useful before anyone types.
 *
 * Scoped exactly like the list pages (contactScope / viaContactScope /
 * jobScope); Sales and Tech never see clients they aren't assigned.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const searching = q.length >= 2;
  const companyId = actor.companyId;
  const contains = { contains: q, mode: "insensitive" as const };
  const nameOr = [{ firstName: contains }, { lastName: contains }, { companyName: contains }];
  const take = searching ? 8 : 6;

  const [contacts, requests, jobs] = await Promise.all([
    canSell(actor.role)
      ? prisma.contact.findMany({
          where: {
            companyId,
            ...contactScope(actor),
            ...(searching
              ? { OR: [...nameOr, { email: contains }, { phone: contains }, { address: contains }] }
              : {}),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            address: true,
            phone: true,
            status: true,
            pipelineStageId: true,
            pipelineStage: { select: { name: true, isConverted: true } },
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take,
        })
      : Promise.resolve([]),
    canSell(actor.role)
      ? prisma.request.findMany({
          where: {
            companyId,
            ...viaContactScope(actor),
            status: "NEW",
            ...(searching ? { OR: [{ title: contains }, { contact: { OR: nameOr } }] } : {}),
          },
          select: {
            id: true,
            title: true,
            preferredDate: true,
            source: true,
            createdAt: true,
            contact: { select: { id: true, firstName: true, lastName: true, address: true, phone: true } },
          },
          orderBy: { createdAt: "asc" },
          take: searching ? 8 : 25,
        })
      : Promise.resolve([]),
    searching
      ? prisma.job.findMany({
          where: {
            companyId,
            ...jobScope(actor),
            status: "ACTIVE",
            scheduledAt: null,
            OR: [{ title: contains }, { address: contains }, { contact: { OR: nameOr } }],
          },
          select: {
            id: true,
            jobNumber: true,
            title: true,
            status: true,
            address: true,
            contact: { select: { id: true, firstName: true, lastName: true, phone: true, address: true } },
            assignments: { select: { userId: true, user: { select: { name: true } } } },
            outsourced: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 8,
        })
      : Promise.resolve([]),
  ]);

  const person = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim();
  const dateParam = (d: Date | null) => {
    if (!d) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  return NextResponse.json({
    contacts: contacts.map((c) => {
      const lead = c.status === "LEAD" || (Boolean(c.pipelineStageId) && !c.pipelineStage?.isConverted);
      return {
        type: "contact" as const,
        id: c.id,
        name: person(c) || c.companyName || "Client",
        lead,
        address: c.address,
        phone: c.phone,
        sub: lead
          ? `Lead${c.pipelineStage?.name ? ` · ${c.pipelineStage.name}` : ""}`
          : c.companyName && person(c)
            ? c.companyName
            : (c.address ?? "Client"),
      };
    }),
    requests: requests.map((r) => ({
      type: "request" as const,
      id: r.id,
      title: r.title,
      contactId: r.contact.id,
      name: person(r.contact),
      address: r.contact.address,
      phone: r.contact.phone,
      preferredDate: dateParam(r.preferredDate),
      sub:
        r.source === "booking_form"
          ? "From your booking page"
          : r.source === "estimate_form"
            ? "From your website estimate form"
          : r.source === "client_hub"
            ? "From the client hub"
            : "Request",
    })),
    jobs: jobs.map((j) => ({
      type: "job" as const,
      job: {
        id: j.id,
        kind: "job" as const,
        jobNumber: j.jobNumber,
        title: j.title,
        status: j.status,
        apptType: null,
        scheduledAt: null,
        scheduledEnd: null,
        scheduledAnytime: false,
        contactName: person(j.contact),
        contactId: j.contact.id,
        assignees: j.assignments.map((a) => a.user.name?.trim() ?? "").filter(Boolean),
        assigneeIds: j.assignments.map((a) => a.userId),
        outsourced: j.outsourced,
        phone: j.contact.phone,
        address: j.address ?? j.contact.address,
      },
    })),
  });
}
