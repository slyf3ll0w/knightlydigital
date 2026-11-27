import { prisma } from "@/lib/db";
import type { QuoteStatus, RequestStatus } from "@prisma/client";
import { requirePageActor, canSell, contactScope, seesAllLeads, isManager } from "@/lib/permissions";
import { ensureStages, listBoards, stagesOfBoard, MAIN_BOARD_NAME } from "@/lib/pipeline";
import LeadsBoardClient, { type BoardCard, type BoardStage, type BoardTab, type LostLead } from "./LeadsBoardClient";

export const dynamic = "force-dynamic";

/**
 * The Leads pipeline board — a kanban over contacts with a pipeline stage.
 * Cards arrive from web forms, the lead webhook, and manual creates; they
 * leave through Won (→ active client) or Lost. Stage columns are the
 * company's own (Settings → Clients & documents → Lead pipeline).
 */
// The Converted section shows only recent wins — older ones live in Clients
const CONVERTED_SHOWN = 25;
const LOST_SHOWN = 200;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ board?: string | string[] }> }) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  // More than one board (lib/pipeline.ts): ?board=<id> picks one, none = the main board
  const asked = (await searchParams).board;
  const [allStages, extraBoards] = await Promise.all([ensureStages(companyId), listBoards(prisma, companyId)]);
  const boardId = extraBoards.find((b) => b.id === (typeof asked === "string" ? asked : ""))?.id ?? null;
  const stages = stagesOfBoard(allStages, boardId);
  const openByStage = extraBoards.length
    ? new Map(
        (
          await prisma.contact.groupBy({
            by: ["pipelineStageId"],
            where: { companyId, pipelineStageId: { in: allStages.filter((s) => !s.isConverted).map((s) => s.id) }, ...contactScope(actor) },
            _count: { _all: true },
          })
        ).map((g) => [g.pipelineStageId, g._count._all])
      )
    : new Map<string | null, number>();
  const tab = (id: string | null, name: string): BoardTab => {
    const own = allStages.filter((s) => !s.isConverted && (s.boardId ?? null) === id);
    return { id, name, open: own.reduce((n, s) => n + (openByStage.get(s.id) ?? 0), 0), firstStageId: own[0]?.id ?? null };
  };
  const boards: BoardTab[] = extraBoards.length ? [tab(null, MAIN_BOARD_NAME), ...extraBoards.map((b) => tab(b.id, b.name))] : [];
  const convertedStage = stages.find((s) => s.isConverted);
  const [company] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { hideConvertedLeads: true },
    }),
  ]);
  const hideConverted = company?.hideConvertedLeads ?? false;
  const workingStageIds = stages.filter((s) => !s.isConverted).map((s) => s.id);

  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [contacts, convertedContacts, convertedTotal, team, lostRows, won30] = await Promise.all([
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
    // Off the board, newest first. Lost leads (lostAt set — archived if they
    // were a lead, a repeat client stays ACTIVE), plus leads archived from
    // their own page: those never got lostAt, so they left the board and
    // showed up nowhere on this page. An archived contact that never became
    // a client and has no work or billing on it was a lead.
    prisma.contact.findMany({
      where: {
        companyId,
        pipelineStageId: null,
        placeholder: false,
        ...contactScope(actor),
        OR: [
          { lostAt: { not: null } },
          {
            status: "ARCHIVED",
            kind: "CLIENT",
            timesWon: 0,
            wonAt: null,
            jobs: { none: {} },
            invoices: { none: {} },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: LOST_SHOWN,
      select: { id: true, firstName: true, lastName: true, companyName: true, lostAt: true, lostReason: true, status: true, timesWon: true, updatedAt: true },
    }),
    // The board tail: wins in the last 30 days
    prisma.contact.count({ where: { companyId, wonAt: { gte: since30 }, ...contactScope(actor) } }),
  ]);
  const lost: LostLead[] = lostRows.map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName}`.trim(),
    companyName: c.companyName,
    lostAt: c.lostAt ? c.lostAt.toISOString() : null,
    offAt: (c.lostAt ?? c.updatedAt).toISOString(),
    lostReason: c.lostReason,
    repeat: c.status === "ACTIVE" || c.timesWon > 0,
  }));

  const boardStages: BoardStage[] = stages
    .filter((s) => !(s.isConverted && hideConverted))
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      autoAdvanceOn: s.autoAdvanceOn,
      isConverted: s.isConverted,
    }));

  const cards: BoardCard[] = [
    ...contacts.map((c) => toCard(c, false)),
    ...convertedContacts.map((c) => toCard(c, true)),
  ];

  return (
    <LeadsBoardClient
      key={boardId ?? "main"}
      stages={boardStages}
      boards={boards}
      boardId={boardId}
      cards={cards}
      team={team}
      manager={isManager(actor.role)}
      convertedOverflow={Math.max(0, convertedTotal - convertedContacts.length)}
      lost={lost}
      won30={won30}
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
  // Searchable on the board, not shown on the card
  address: true,
  city: true,
  state: true,
  zip: true,
  notes: true,
  customFields: true,
  pipelineStageId: true,
  stageChangedAt: true,
  wonAt: true,
  timesWon: true,
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
  // The card's next step: the soonest booked appointment, else the soonest open task
  appointments: {
    where: { status: "SCHEDULED" as const, scheduledAt: { gte: new Date(Date.now() - 6 * 3_600_000) } },
    orderBy: { scheduledAt: "asc" as const },
    take: 1,
    select: { scheduledAt: true, title: true },
  },
  tasks: {
    where: { doneAt: null },
    orderBy: [{ dueAt: { sort: "asc" as const, nulls: "last" as const } }],
    take: 1,
    select: { dueAt: true, title: true },
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
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  customFields: unknown;
  pipelineStageId: string | null;
  stageChangedAt: Date | null;
  wonAt: Date | null;
  timesWon: number;
  createdAt: Date;
  assignedTo: { id: string; name: string } | null;
  quotes: { total: unknown }[];
  requests: { id: string }[];
  appointments: { scheduledAt: Date; title: string }[];
  tasks: { dueAt: Date | null; title: string }[];
  _count: { requests: number; quotes: number; appointments: number };
};

/** Everything searchable that the card itself doesn't show — flattened once
 *  here so the board's filter stays a substring test. */
function searchBlob(c: CardRow): string {
  const custom =
    c.customFields && typeof c.customFields === "object" && !Array.isArray(c.customFields)
      ? Object.values(c.customFields as Record<string, unknown>).filter(
          (v): v is string => typeof v === "string"
        )
      : [];
  return [c.address, c.city, c.state, c.zip, c.notes, ...custom]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function toCard(c: CardRow, inConverted: boolean): BoardCard {
  return {
    id: c.id,
    name: `${c.firstName} ${c.lastName}`.trim(),
    companyName: c.companyName,
    email: c.email,
    phone: c.phone,
    leadSource: c.leadSource,
    stageId: c.pipelineStageId!,
    stageChangedAt: (c.stageChangedAt ?? c.createdAt).toISOString(),
    // Repeat = they'd worked with the company BEFORE this pipeline run: an
    // existing client back on the working board, or a second+ conversion.
    // A first-time win sitting in Converted is NOT a repeat.
    repeat: inConverted ? c.timesWon > 1 : c.status === "ACTIVE" || c.timesWon > 0,
    value: c.quotes.reduce((s, q) => s + Number(q.total), 0),
    assignedTo: c.assignedTo,
    openRequestId: c.requests[0]?.id ?? null,
    next: c.appointments[0]
      ? { kind: "appointment", at: c.appointments[0].scheduledAt.toISOString(), title: c.appointments[0].title }
      : c.tasks[0]
        ? { kind: "task", at: c.tasks[0].dueAt ? c.tasks[0].dueAt.toISOString() : null, title: c.tasks[0].title }
        : null,
    createdAt: c.createdAt.toISOString(),
    searchBlob: searchBlob(c),
    counts: {
      requests: c._count.requests,
      quotes: c._count.quotes,
      appointments: c._count.appointments,
    },
  };
}
