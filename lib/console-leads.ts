import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";

/**
 * The platform console's lead board (/superadmin/leads): WorkBench's own
 * sales pipeline, built like a tenant's Leads board (lib/pipeline.ts) but
 * over its own two tables, ConsoleLeadStage + ConsoleLead.
 *
 *  - Cards come from the website's Contact us form (every non-spam
 *    ContactSubmission is boarded once — `boardContactSubmissions`, run by the
 *    form route and as a backstop on every board load) and from manual adds.
 *  - Columns are editable (rename, recolor, add, reorder, delete). The one
 *    `isWon` column is pinned last and can't be deleted: a card there is WON.
 *  - Lost takes a card off the board (status LOST, optional reason); the
 *    Lost list reopens it.
 */

export const MAX_STAGES = 12;
const HEX = /^#[0-9a-f]{6}$/i;

const DEFAULT_STAGES = [
  { name: "New", color: "#F59E0B" },
  { name: "Contacted", color: "#3B82F6" },
  { name: "Demo booked", color: "#8B5CF6" },
  { name: "Trying it", color: "#14B8A6" },
];
const WON_STAGE = { name: "Signed up", color: "#22C55E" };

export type ConsoleStage = { id: string; name: string; color: string | null; isWon: boolean };

export type ConsoleLeadCard = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  businessName: string | null;
  message: string | null;
  notes: string | null;
  source: string;
  stageId: string;
  stageChangedAt: string;
  status: string;
  lostReason: string | null;
  lostAt: string | null;
  createdAt: string;
};

/**
 * Seed the default columns on first use; always make sure a Won column exists.
 * The seed runs in a serializable transaction that re-reads the table first,
 * so the very first contact-form boarding racing the first board load can't
 * each seed a set of columns (audit 2026-10-06, D7). The loser's transaction
 * is rolled back by Postgres; one retry then sees the winner's rows.
 */
export async function ensureConsoleStages(): Promise<ConsoleStage[]> {
  let stages = await prisma.consoleLeadStage.findMany({ orderBy: { sortOrder: "asc" } });
  if (stages.length === 0 || !stages.some((s) => s.isWon)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        stages = await prisma.$transaction(
          async (tx) => {
            const current = await tx.consoleLeadStage.findMany({ orderBy: { sortOrder: "asc" } });
            if (current.length === 0) {
              await tx.consoleLeadStage.createMany({
                data: [
                  ...DEFAULT_STAGES.map((s, i) => ({ ...s, sortOrder: i })),
                  { ...WON_STAGE, sortOrder: 9999, isWon: true },
                ],
              });
            } else if (!current.some((s) => s.isWon)) {
              await tx.consoleLeadStage.create({ data: { ...WON_STAGE, sortOrder: 9999, isWon: true } });
            } else {
              return current;
            }
            return tx.consoleLeadStage.findMany({ orderBy: { sortOrder: "asc" } });
          },
          { isolationLevel: "Serializable" }
        );
        break;
      } catch (err) {
        // A serialization failure means the other side seeded first — read theirs.
        if (attempt === 1) throw err;
      }
    }
  }
  // Won is always last, whatever its sortOrder says.
  return [...stages.filter((s) => !s.isWon), ...stages.filter((s) => s.isWon)].map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    isWon: s.isWon,
  }));
}

/**
 * Put every non-spam contact-form message that hasn't been boarded yet on
 * the board, in the first column. Each message is claimed (boardedAt) before
 * its card is made, so two concurrent runs never make two cards, and a card
 * deleted later stays deleted.
 */
export async function boardContactSubmissions(): Promise<void> {
  const fresh = await prisma.contactSubmission.findMany({
    where: { spam: false, boardedAt: null },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, name: true, email: true, phone: true, businessName: true, message: true, createdAt: true },
  });
  if (fresh.length === 0) return;
  const stages = await ensureConsoleStages();
  const first = stages.find((s) => !s.isWon);
  if (!first) return;
  for (const m of fresh) {
    try {
      const claimed = await prisma.contactSubmission.updateMany({
        where: { id: m.id, boardedAt: null },
        data: { boardedAt: new Date() },
      });
      if (claimed.count === 0) continue;
      // "Not spam" on a message whose card still exists just re-stamps it.
      const existing = await prisma.consoleLead.findUnique({ where: { contactSubmissionId: m.id }, select: { id: true } });
      if (existing) continue;
      await prisma.consoleLead.create({
        data: {
          name: m.name,
          email: m.email,
          phone: m.phone,
          businessName: m.businessName,
          message: m.message,
          source: "contact_form",
          contactSubmissionId: m.id,
          stageId: first.id,
          stageChangedAt: m.createdAt,
          createdAt: m.createdAt,
        },
      });
    } catch (err) {
      reportError("[console-leads] boarding a contact message failed", err);
    }
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function loadConsoleBoard(): Promise<{ stages: ConsoleStage[]; cards: ConsoleLeadCard[]; lost: ConsoleLeadCard[] }> {
  await boardContactSubmissions();
  const stages = await ensureConsoleStages();
  const select = {
    id: true,
    name: true,
    email: true,
    phone: true,
    businessName: true,
    message: true,
    notes: true,
    source: true,
    stageId: true,
    stageChangedAt: true,
    status: true,
    lostReason: true,
    lostAt: true,
    createdAt: true,
  } as const;
  const [open, lost] = await Promise.all([
    prisma.consoleLead.findMany({ where: { status: { in: ["OPEN", "WON"] } }, orderBy: { stageChangedAt: "desc" }, take: 1000, select }),
    prisma.consoleLead.findMany({ where: { status: "LOST" }, orderBy: { lostAt: "desc" }, take: 200, select }),
  ]);
  const toCard = (l: (typeof open)[number]): ConsoleLeadCard => ({
    ...l,
    stageChangedAt: l.stageChangedAt.toISOString(),
    lostAt: iso(l.lostAt),
    createdAt: l.createdAt.toISOString(),
  });
  return { stages, cards: open.map(toCard), lost: lost.map(toCard) };
}

/** Status that goes with a column: the Won column means WON, any other OPEN. */
export async function statusForStage(stageId: string): Promise<{ status: "OPEN" | "WON"; stageId: string } | null> {
  const stage = await prisma.consoleLeadStage.findUnique({ where: { id: stageId }, select: { id: true, isWon: true } });
  if (!stage) return null;
  return { status: stage.isWon ? "WON" : "OPEN", stageId: stage.id };
}

export type StageInput = { id?: string; name: string; color?: string | null };

/** Validate the Customize list: the working columns in order, then the Won column. */
export function cleanStageInput(raw: unknown): { stages: StageInput[]; won: StageInput } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Bad request" };
  const body = raw as { stages?: unknown; won?: unknown };
  const one = (v: unknown): StageInput | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as { id?: unknown; name?: unknown; color?: unknown };
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    if (!name) return null;
    return {
      id: typeof o.id === "string" && o.id ? o.id : undefined,
      name,
      color: typeof o.color === "string" && HEX.test(o.color) ? o.color : null,
    };
  };
  if (!Array.isArray(body.stages)) return { error: "Bad request" };
  const stages = body.stages.map(one);
  if (stages.some((s) => !s)) return { error: "Every column needs a name." };
  if (stages.length === 0) return { error: "Keep at least one column before Won." };
  if (stages.length > MAX_STAGES) return { error: `Up to ${MAX_STAGES} columns.` };
  const won = one(body.won);
  if (!won) return { error: "The Won column needs a name." };
  return { stages: stages as StageInput[], won };
}
