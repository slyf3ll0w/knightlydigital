import { prisma } from "@/lib/db";
import type { Prisma, PipelineTrigger } from "@prisma/client";

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
 *  - App events (request created, appointment scheduled, quote sent/approved)
 *    auto-advance cards to whichever stage claims that trigger — forward
 *    only, so a re-send never demotes a lead.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const MAX_STAGES = 12;

// Converted is pinned after every orderable stage
const CONVERTED_SORT = 9999;

// QUOTE_APPROVED is no longer offered: an approved quote always converts the
// lead (recordLeadWin) rather than advancing to a custom stage. The enum
// value stays in the schema for any stage that still carries it.
export const PIPELINE_TRIGGERS = [
  "REQUEST_CREATED",
  "APPOINTMENT_SCHEDULED",
  "QUOTE_SENT",
] as const;

export const triggerLabel: Record<string, string> = {
  REQUEST_CREATED: "Request comes in",
  APPOINTMENT_SCHEDULED: "Appointment scheduled",
  QUOTE_SENT: "Quote sent",
  QUOTE_APPROVED: "Quote approved",
};

// Seeded on first board visit; every part is editable afterward.
const DEFAULT_STAGES: { name: string; color: string; autoAdvanceOn: PipelineTrigger | null }[] = [
  { name: "New", color: "#F59E0B", autoAdvanceOn: "REQUEST_CREATED" },
  { name: "Contacted", color: "#3B82F6", autoAdvanceOn: null },
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
  await prisma.contact.updateMany({
    where: { companyId, status: "LEAD", pipelineStageId: null },
    data: { pipelineStageId: stages[0].id, stageChangedAt: new Date() },
  });
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
  opts?: { stageId?: string }
): Promise<void> {
  const contact = await db.contact.findFirst({
    where: { id: contactId, companyId },
    select: { id: true, status: true, pipelineStage: { select: { id: true, isConverted: true } } },
  });
  if (!contact || (contact.pipelineStage && !contact.pipelineStage.isConverted)) return;

  let stage = opts?.stageId
    ? await db.pipelineStage.findFirst({
        where: { id: opts.stageId, companyId, isConverted: false },
      })
    : null;
  if (!stage) {
    stage = await db.pipelineStage.findFirst({
      where: { companyId, isConverted: false },
      orderBy: { sortOrder: "asc" },
    });
  }
  if (!stage) return; // board never opened — the ensureStages sweep will catch them

  await db.contact.update({
    where: { id: contact.id },
    data: {
      pipelineStageId: stage.id,
      pipelineOrder: await topOrder(db, companyId, stage.id),
      stageChangedAt: new Date(),
      ...(contact.status === "ARCHIVED" && { status: "LEAD", lostAt: null, lostReason: null }),
    },
  });
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
): Promise<void> {
  const target = await db.pipelineStage.findFirst({
    where: { companyId, autoAdvanceOn: trigger },
  });
  if (!target) return;
  const contact = await db.contact.findFirst({
    where: { id: contactId, companyId, pipelineStageId: { not: null } },
    select: { id: true, pipelineStage: { select: { id: true, sortOrder: true } } },
  });
  if (!contact?.pipelineStage) return;
  if (target.sortOrder <= contact.pipelineStage.sortOrder) return;
  await db.contact.update({
    where: { id: contact.id },
    data: {
      pipelineStageId: target.id,
      pipelineOrder: await topOrder(db, companyId, target.id),
      stageChangedAt: new Date(),
    },
  });
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
): Promise<void> {
  if (contact.status !== "LEAD" && !contact.pipelineStageId) return;
  const converted = await convertedStageFor(db, companyId);
  if (contact.pipelineStageId === converted.id) return; // already there
  await db.contact.update({
    where: { id: contact.id },
    data: {
      status: "ACTIVE",
      pipelineStageId: converted.id,
      pipelineOrder: await topOrder(db, companyId, converted.id),
      stageChangedAt: new Date(),
      wonAt: new Date(),
      lostAt: null,
      lostReason: null,
    },
  });
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
): Promise<void> {
  await db.contact.update({
    where: { id: contact.id },
    data: {
      pipelineStageId: null,
      stageChangedAt: null,
      lostAt: new Date(),
      lostReason: reason?.trim() ? reason.trim().slice(0, 300) : null,
      ...(contact.status === "LEAD" && { status: "ARCHIVED" }),
    },
  });
}
