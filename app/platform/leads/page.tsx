import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope, seesAllLeads, isManager } from "@/lib/permissions";
import { ensureStages } from "@/lib/pipeline";
import LeadsBoardClient, { type BoardCard, type BoardStage } from "./LeadsBoardClient";

export const dynamic = "force-dynamic";

/**
 * The Leads pipeline board — a kanban over contacts with a pipeline stage.
 * Cards arrive from web forms, the lead webhook, and manual creates; they
 * leave through Won (→ active client) or Lost. Stage columns are the
 * company's own (Settings → Lead Pipeline).
 */
export default async function LeadsPage() {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const stages = await ensureStages(companyId);

  const [contacts, team] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, pipelineStageId: { not: null }, ...contactScope(actor) },
      orderBy: [{ pipelineOrder: "asc" }, { stageChangedAt: "desc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyName: true,
        email: true,
        phone: true,
        status: true,
        leadSource: true,
        pipelineStageId: true,
        stageChangedAt: true,
        wonAt: true,
        createdAt: true,
        assignedTo: { select: { id: true, name: true } },
        quotes: {
          where: { status: { in: ["DRAFT", "AWAITING_RESPONSE", "APPROVED"] } },
          select: { total: true },
        },
        requests: {
          where: { status: { in: ["NEW", "NEEDS_APPROVAL"] } },
          select: { id: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            requests: true,
            quotes: true,
            appointments: { where: { status: "SCHEDULED" } },
          },
        },
      },
    }),
    seesAllLeads(actor.role)
      ? prisma.user.findMany({
          where: { companyId, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const boardStages: BoardStage[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    autoAdvanceOn: s.autoAdvanceOn,
  }));

  const cards: BoardCard[] = contacts.map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName}`.trim(),
    companyName: c.companyName,
    email: c.email,
    phone: c.phone,
    leadSource: c.leadSource,
    stageId: c.pipelineStageId!,
    stageChangedAt: (c.stageChangedAt ?? c.createdAt).toISOString(),
    // A card that already won before (or is an ACTIVE client back for more
    // work) shows the Repeat badge — David's "worked with us before" signal
    repeat: c.status === "ACTIVE" || !!c.wonAt,
    value: c.quotes.reduce((s, q) => s + Number(q.total), 0),
    assignedTo: c.assignedTo,
    openRequestId: c.requests[0]?.id ?? null,
    counts: {
      requests: c._count.requests,
      quotes: c._count.quotes,
      appointments: c._count.appointments,
    },
  }));

  return (
    <LeadsBoardClient
      stages={boardStages}
      cards={cards}
      team={team}
      manager={isManager(actor.role)}
    />
  );
}
