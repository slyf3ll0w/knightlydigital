import { prisma } from "@/lib/db";
import type { Prisma, PipelineTrigger } from "@prisma/client";
import { fireAutomations } from "@/lib/automations-server";

/**
 * Lead pipeline (the Leads kanban board).
 *
 * The board is a view over contacts: a set `pipelineStageId` = a card. The
 * lifecycle is enforced here so every entry point (web forms, webhook leads,
 * manual creates, Atlas) behaves identically:
 *
 *  - LEAD contacts always sit on the board (a sweep on every board load
 *    catches any created outside the wired paths, e.g. CSV imports).
 *  - Winning (first job/invoice/quote-conversion, or the board's Won zone)
 *    clears the stage and makes them an ACTIVE client.
 *  - An ACTIVE client with a NEW request re-enters the board — their card
 *    carries a Repeat badge (wonAt / job history) and closing them again
 *    just clears the stage; they never regress to LEAD.
 *  - Losing archives a lead (with an optional reason); a repeat client who
 *    doesn't buy again simply leaves the board and stays ACTIVE.
 *  - App events (request created, call connected / text sent, outbound call
 *    unanswered, appointment scheduled, quote sent) auto-advance cards to
 *    whichever stage claims that trigger — forward only, so a re-send never
 *    demotes a lead. The phone/text hooks live in lib/voice.ts and the
 *    Messages POST route; the default "Contacted" column claims CONTACT_MADE.
 *
 * More than one board (2026-11-27, ticket #p6pp98). Every company has its
 * main board: the stages with `boardId` null, no row needed. A company can
 * add boards (LeadBoard), each with its own columns, its own trigger claims
 * and its own limit of MAX_STAGES. A lead is on one board at a time, the
 * board of its stage. New leads land on the main board unless a rule sends
 * them elsewhere (`routeBoard`): the booking form names a board, or the
 * lead's source is listed on one. Automatic moves stay on the card's own
 * board. The Converted section is one per company (boardId null) and closes
 * every board. "First stage" always means the first stage OF A BOARD.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const MAX_STAGES = 12;
/** Extra boards a company may add beside its main one. */
export const MAX_BOARDS = 8;
/** What the main board is called where boards are listed. */
export const MAIN_BOARD_NAME = "Main board";

/** The stages one board shows, in order: its own columns, then the shared Converted section. `boardId` null = the main board. */
export function stagesOfBoard<T extends { boardId: string | null; isConverted: boolean }>(stages: T[], boardId: string | null): T[] {
  return stages.filter((s) => s.isConverted || (s.boardId ?? null) === (boardId ?? null));
}

/** The first working column of a board (where its new leads land). */
export async function firstStageOf(db: Db, companyId: string, boardId: string | null) {
  return db.pipelineStage.findFirst({
    where: { companyId, isConverted: false, boardId: boardId ?? null },
    orderBy: { sortOrder: "asc" },
  });
}

/** Every board's first working column: "new leads" badges count the cards in these. */
export async function firstStageIds(db: Db, companyId: string): Promise<string[]> {
  const stages = await db.pipelineStage.findMany({
    where: { companyId, isConverted: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true, boardId: true },
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of stages) {
    const key = s.boardId ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.id);
  }
  return out;
}

export async function listBoards(db: Db, companyId: string) {
  return db.leadBoard.findMany({ where: { companyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

/**
 * Which board a NEW lead lands on: the form's board when it names one, else
 * the board that lists the lead's source, else the main board (null).
 */
export async function routeBoard(db: Db, companyId: string, hint: { bookingTypeId?: string | null; source?: string | null }): Promise<string | null> {
  if (hint.bookingTypeId) {
    const type = await db.bookingType.findFirst({ where: { id: hint.bookingTypeId, companyId }, select: { leadBoardId: true } });
    if (type?.leadBoardId) return type.leadBoardId;
  }
  const source = hint.source?.trim().toLowerCase();
  if (source) {
    const boards = await db.leadBoard.findMany({ where: { companyId, NOT: { sources: { isEmpty: true } } }, orderBy: { sortOrder: "asc" }, select: { id: true, sources: true } });
    const hit = boards.find((b) => b.sources.some((s) => s.trim().toLowerCase() === source));
    if (hit) return hit.id;
  }
  return null;
}

/** Add a board with the starter columns (same names and automatic moves as a new main board). */
export async function createBoard(companyId: string, name: string) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.leadBoard.findFirst({ where: { companyId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const board = await tx.leadBoard.create({ data: { companyId, name, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    for (let i = 0; i < DEFAULT_STAGES.length; i++) {
      await tx.pipelineStage.create({ data: { companyId, boardId: board.id, sortOrder: i, ...DEFAULT_STAGES[i] } });
    }
    return board;
  });
}

/** Remove a board: its cards go to the first column of the main board, its columns go with it. */
export async function deleteBoard(companyId: string, boardId: string): Promise<{ moved: number }> {
  return prisma.$transaction(async (tx) => {
    const board = await tx.leadBoard.findFirst({ where: { id: boardId, companyId }, select: { id: true } });
    if (!board) return { moved: 0 };
    const stageIds = (await tx.pipelineStage.findMany({ where: { companyId, boardId }, select: { id: true } })).map((s) => s.id);
    const main = await firstStageOf(tx, companyId, null);
    const moved = stageIds.length
      ? await tx.contact.updateMany({
          where: { companyId, pipelineStageId: { in: stageIds } },
          data: { pipelineStageId: main?.id ?? null, stageChangedAt: new Date() },
        })
      : { count: 0 };
    await tx.pipelineStage.deleteMany({ where: { companyId, boardId } });
    await tx.leadBoard.delete({ where: { id: boardId } });
    return { moved: moved.count };
  });
}

/**
 * A board change the automations engine should hear about (lib/automations.ts
 * triggers lead.stage_changed / lead.won / lead.lost). The lifecycle functions
 * below return one when they actually moved the card. Called with the root
 * `prisma` client they fire it themselves; called inside a transaction they
 * can't (the row isn't committed yet), so the caller collects the returned
 * moves and hands them to `firePipelineMoves` after the transaction resolves.
 */
export type PipelineMove = {
  event: "lead.stage_changed" | "lead.won" | "lead.lost";
  contactId: string;
  /** lead.stage_changed: the stage the card landed on. */
  stage?: string;
};

export function firePipelineMoves(companyId: string, moves: (PipelineMove | null | undefined)[]): void {
  for (const m of moves) {
    if (!m) continue;
    fireAutomations(companyId, m.event, m.contactId, m.stage ? { stage: m.stage } : undefined);
  }
}

function emit(db: Db, companyId: string, move: PipelineMove): PipelineMove {
  if (db === prisma) firePipelineMoves(companyId, [move]);
  return move;
}

// Converted is pinned after every orderable stage
const CONVERTED_SORT = 9999;

// QUOTE_APPROVED is no longer offered: an approved quote always converts the
// lead (recordLeadWin) rather than advancing to a custom stage. The enum
// value stays in the schema for any stage that still carries it.
export const PIPELINE_TRIGGERS = [
  "REQUEST_CREATED",
  "CONTACT_MADE",
  "CALL_NO_ANSWER",
  "APPOINTMENT_SCHEDULED",
  "QUOTE_SENT",
] as const;

export const triggerLabel: Record<string, string> = {
  REQUEST_CREATED: "Request comes in",
  CONTACT_MADE: "You call or text them",
  CALL_NO_ANSWER: "You call and they don't pick up",
  APPOINTMENT_SCHEDULED: "Appointment scheduled",
  QUOTE_SENT: "Quote sent",
  QUOTE_APPROVED: "Quote approved",
};

// Seeded on first board visit; every part is editable afterward. "Contacted"
// claims the call/text trigger by default; a "No answer" column is left for
// the company to add (Settings → Lead pipeline) — put it BEFORE Contacted so
// a lead who finally picks up still moves forward into Contacted.
const DEFAULT_STAGES: { name: string; color: string; autoAdvanceOn: PipelineTrigger | null }[] = [
  { name: "New", color: "#F59E0B", autoAdvanceOn: "REQUEST_CREATED" },
  { name: "Contacted", color: "#3B82F6", autoAdvanceOn: "CONTACT_MADE" },
  { name: "Estimate Scheduled", color: "#8B5CF6", autoAdvanceOn: "APPOINTMENT_SCHEDULED" },
  { name: "Quote Sent", color: "#22C55E", autoAdvanceOn: "QUOTE_SENT" },
];

export function isValidHex(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

/**
 * The company's stages, seeding the defaults on first use. Guarantees the
 * terminal Converted section exists (backfilled for boards created before
 * it), and sweeps any stray LEAD contacts onto the first stage so the board
 * never misses a lead (imports, older records, paths that predate the
 * pipeline).
 */
export async function ensureStages(companyId: string) {
  let stages = await prisma.pipelineStage.findMany({
    where: { companyId },
    orderBy: { sortOrder: "asc" },
  });
  if (stages.length === 0) {
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction — two first visits racing is harmless
      const count = await tx.pipelineStage.count({ where: { companyId } });
      if (count > 0) return;
      for (let i = 0; i < DEFAULT_STAGES.length; i++) {
        await tx.pipelineStage.create({
          data: { companyId, sortOrder: i, ...DEFAULT_STAGES[i] },
        });
      }
      await tx.pipelineStage.create({
        data: {
          companyId,
          name: "Converted",
          color: "#22C55E",
          sortOrder: CONVERTED_SORT,
          isConverted: true,
        },
      });
    });
    stages = await prisma.pipelineStage.findMany({
      where: { companyId },
      orderBy: { sortOrder: "asc" },
    });
  } else if (!stages.some((s) => s.isConverted)) {
    // Board predates the Converted section — add it
    await convertedStageFor(prisma, companyId);
    stages = await prisma.pipelineStage.findMany({
      where: { companyId },
      orderBy: { sortOrder: "asc" },
    });
  }
  // Stray-lead sweep: probe before writing so the board's every render isn't
  // an updateMany against the contacts table
  const strayWhere = { companyId, status: "LEAD" as const, pipelineStageId: null };
  // Strays land on the MAIN board's first column (stages[0] alone could be another board's)
  const mainFirst = stages.find((s) => !s.isConverted && !s.boardId) ?? stages[0];
  if (await prisma.contact.findFirst({ where: strayWhere, select: { id: true } })) {
    await prisma.contact.updateMany({
      where: strayWhere,
      data: { pipelineStageId: mainFirst.id, stageChangedAt: new Date() },
    });
  }
  return stages;
}

/** The company's Converted section, created if it doesn't exist yet. */
export async function convertedStageFor(db: Db, companyId: string) {
  const existing = await db.pipelineStage.findFirst({
    where: { companyId, isConverted: true },
  });
  if (existing) return existing;
  return db.pipelineStage.create({
    data: {
      companyId,
      name: "Converted",
      color: "#22C55E",
      sortOrder: CONVERTED_SORT,
      isConverted: true,
    },
  });
}

/** Top-of-column pipelineOrder for a stage (cards sort pipelineOrder asc). */
async function topOrder(db: Db, companyId: string, stageId: string): Promise<number> {
  const first = await db.contact.findFirst({
    where: { companyId, pipelineStageId: stageId },
    orderBy: { pipelineOrder: "asc" },
    select: { pipelineOrder: true },
  });
  return (first?.pipelineOrder ?? 1) - 1;
}

/**
 * Put a contact on the board (no-op if already in a working stage). New leads
 * land on the first stage unless a specific one is passed. Contacts sitting
 * in the Converted section re-enter the working board — that's a client back
 * for more work. ARCHIVED contacts (including lost leads) are resurrected to
 * LEAD; ACTIVE clients keep their status and re-enter as repeat business.
 */
export async function enterPipeline(
  db: Db,
  companyId: string,
  contactId: string,
  opts?: { stageId?: string; boardId?: string | null; bookingTypeId?: string | null }
): Promise<PipelineMove | null> {
  const contact = await db.contact.findFirst({
    where: { id: contactId, companyId },
    select: { id: true, status: true, leadSource: true, pipelineStage: { select: { id: true, isConverted: true } } },
  });
  if (!contact || (contact.pipelineStage && !contact.pipelineStage.isConverted)) return null;

  let stage = opts?.stageId
    ? await db.pipelineStage.findFirst({
        where: { id: opts.stageId, companyId, isConverted: false },
      })
    : null;
  // The board named, else the one a rule picks (the form they came through,
  // then their lead source), else the main board
  if (!stage) {
    const boardId = opts?.boardId ?? (await routeBoard(db, companyId, { bookingTypeId: opts?.bookingTypeId, source: contact.leadSource }));
    if (boardId) stage = await firstStageOf(db, companyId, boardId);
  }
  if (!stage) stage = await firstStageOf(db, companyId, null);
  if (!stage) return null; // board never opened — the ensureStages sweep will catch them

  await db.contact.update({
    where: { id: contact.id },
    data: {
      pipelineStageId: stage.id,
      pipelineOrder: await topOrder(db, companyId, stage.id),
      stageChangedAt: new Date(),
      ...(contact.status === "ARCHIVED" && { status: "LEAD", lostAt: null, lostReason: null }),
    },
  });
  return emit(db, companyId, { event: "lead.stage_changed", contactId: contact.id, stage: stage.name });
}

/**
 * Move a card forward when an app event fires (quote sent, appointment
 * booked, …). Only forward: re-sending a quote to a lead who already
 * reached "Approved" must not drag them back.
 */
export async function autoAdvance(
  db: Db,
  companyId: string,
  contactId: string,
  trigger: PipelineTrigger
): Promise<PipelineMove | null> {
  const contact = await db.contact.findFirst({
    where: { id: contactId, companyId, pipelineStageId: { not: null } },
    select: { id: true, pipelineStage: { select: { id: true, sortOrder: true, boardId: true, isConverted: true } } },
  });
  if (!contact?.pipelineStage || contact.pipelineStage.isConverted) return null;
  // The column that claims this trigger ON THE CARD'S OWN BOARD: a card never changes boards by itself
  const target = await db.pipelineStage.findFirst({
    where: { companyId, autoAdvanceOn: trigger, boardId: contact.pipelineStage.boardId ?? null, isConverted: false },
  });
  if (!target) return null;
  if (target.sortOrder <= contact.pipelineStage.sortOrder) return null;
  await db.contact.update({
    where: { id: contact.id },
    data: {
      pipelineStageId: target.id,
      pipelineOrder: await topOrder(db, companyId, target.id),
      stageChangedAt: new Date(),
    },
  });
  return emit(db, companyId, { event: "lead.stage_changed", contactId: contact.id, stage: target.name });
}

/**
 * The lead closed — quote approved, first job/invoice, quote conversion, or
 * the board's Won zone. The card lands in the Converted section and the
 * contact becomes (or stays) an ACTIVE client.
 * No-op for contacts that are neither leads nor on the board.
 */
export async function recordLeadWin(
  db: Db,
  companyId: string,
  contact: { id: string; status: string; pipelineStageId: string | null }
): Promise<PipelineMove | null> {
  if (contact.status !== "LEAD" && !contact.pipelineStageId) return null;
  const converted = await convertedStageFor(db, companyId);
  if (contact.pipelineStageId === converted.id) return null; // already there
  await db.contact.update({
    where: { id: contact.id },
    data: {
      status: "ACTIVE",
      pipelineStageId: converted.id,
      pipelineOrder: await topOrder(db, companyId, converted.id),
      stageChangedAt: new Date(),
      wonAt: new Date(),
      timesWon: { increment: 1 },
      lostAt: null,
      lostReason: null,
    },
  });
  return emit(db, companyId, { event: "lead.won", contactId: contact.id });
}

/**
 * A business connection (Contact.kind CONTACT — a sub, a supplier, a referral
 * partner) got their first job: they're a client now, in the Clients list
 * with everyone else. Callers run it right after a job create, in the same
 * transaction; a no-op for anyone already a CLIENT.
 */
export async function becomeClient(db: Db, companyId: string, contactId: string): Promise<boolean> {
  const r = await db.contact.updateMany({
    where: { id: contactId, companyId, kind: "CONTACT" },
    data: { kind: "CLIENT", status: "ACTIVE" },
  });
  return r.count > 0;
}

/**
 * The lead didn't buy. Leads archive (restorable from Clients → Archived,
 * or by a new request resurrecting them); repeat clients just leave the
 * board and stay ACTIVE.
 */
export async function recordLeadLoss(
  db: Db,
  contact: { id: string; status: string },
  reason?: string | null
): Promise<PipelineMove | null> {
  const updated = await db.contact.update({
    where: { id: contact.id },
    data: {
      pipelineStageId: null,
      stageChangedAt: null,
      lostAt: new Date(),
      lostReason: reason?.trim() ? reason.trim().slice(0, 300) : null,
      ...(contact.status === "LEAD" && { status: "ARCHIVED" }),
    },
    select: { companyId: true },
  });
  return emit(db, updated.companyId, { event: "lead.lost", contactId: contact.id });
}
