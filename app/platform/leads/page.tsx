import { prisma } from "@/lib/db";
import type { QuoteStatus, RequestStatus } from "@prisma/client";
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
// The Converted section shows only recent wins — older ones live in Clients
const CONVERTED_SHOWN = 25;

export default async function LeadsPage() {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const stages = await ensureStages(companyId);
  const convertedStage = stages.find((s) => s.isConverted);
  const [company] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { hideConvertedLeads: true },
    }),
  ]);
  const hideConverted = company?.hideConvertedLeads ?? false;
  const workingStageIds = stages.filter((s) => !s.isConverted).map((s) => s.id);

  const [contacts, convertedContacts, convertedTotal, team] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, pipelineStageId: { in: workingStageIds }, ...contactScope(actor) },
      orderBy: [{ pipelineOrder: "asc" }, { stageChangedAt: "desc" }],
      select: contactCardSelect,
    }),
    convertedStage && !hideConverted
      ? prisma.contact.findMany({
          where: { companyId, pipelineStageId: convertedStage.id, ...contactScope(actor) },
          orderBy: { stageChangedAt: "desc" },
          take: CONVERTED_SHOWN,
          select: contactCardSelect,
        })
      : Promise.resolve([]),
    convertedStage && !hideConverted
      ? prisma.contact.count({
          where: { companyId, pipelineStageId: convertedStage.id, ...contactScope(actor) },
        })
      : Promise.resolve(0),
    seesAllLeads(actor.role)
      ? prisma.user.findMany({
          where: { companyId, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const boardStages: BoardStage[] = stages
    .filter((s) => !(s.isConverted && hideConverted))
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      autoAdvanceOn: s.autoAdvanceOn,
      isConverted: s.isConverted,
    }));

  const cards: BoardCard[] = [...contacts, ...convertedContacts].map(toCard);

  return (
    <LeadsBoardClient
      stages={boardStages}
      cards={cards}
      team={team}
      manager={isManager(actor.role)}
      convertedOverflow={Math.max(0, convertedTotal - convertedContacts.length)}
    />
  );
}

const contactCardSelect = {
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
    where: { status: { in: ["DRAFT", "AWAITING_RESPONSE", "APPROVED"] as QuoteStatus[] } },
    select: { total: true },
  },
  requests: {
    where: { status: { in: ["NEW", "NEEDS_APPROVAL"] as RequestStatus[] } },
    select: { id: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  _count: {
    select: {
      requests: true,
      quotes: true,
      appointments: { where: { status: "SCHEDULED" as const } },
    },
  },
};

type CardRow = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  leadSource: string | null;
  pipelineStageId: string | null;
  stageChangedAt: Date | null;
  wonAt: Date | null;
  createdAt: Date;
  assignedTo: { id: string; name: string } | null;
  quotes: { total: unknown }[];
  requests: { id: string }[];
  _count: { requests: number; quotes: number; appointments: number };
};

function toCard(c: CardRow): BoardCard {
  return {
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
  };
}
