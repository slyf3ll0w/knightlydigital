import { prisma } from "../db";
import type { Actor } from "../permissions";
import { contactScope } from "../permissions";
import { type ToolCtx, clientName, findContact, num, str } from "./core";
import { quoted } from "./untrusted";

/**
 * Client notes as context, cheaply (David 2026-10-24: a "do not schedule
 * him again" note on a client must reach Atlas before he books the man —
 * without paying for the client's whole picture on every turn).
 *
 * The loop calls `withClientHeadsUp` after every tool run. When the call
 * touched one client (clientId / contactId, or a job / quote / invoice /
 * appointment that belongs to one) AND it either staged a card or was one
 * of the few reads that precede an action, the response gains a compact
 * `clientHeadsUp`: the profile note plus the three latest notes, each cut
 * short. Once per client per turn, five clients a turn at most, nothing at
 * all for clients with no notes — so the usual cost is zero and the worst
 * case is a few hundred tokens.
 *
 * The prompt tells Atlas what to do with it: say it plainly, then let the
 * user decide. Notes inform; they never let him refuse the owner.
 */

/** Reads that come right before an action and so deserve the heads-up. */
const HEADS_UP_READS = new Set(["get_document", "get_client_details", "get_statement", "find_a_time"]);
/** Tools whose output already carries the notes — no need to repeat them. */
const CARRIES_NOTES = new Set(["get_client_activity", "get_client_notes"]);
const MAX_PER_TURN = 5;
const NOTE_CHARS = 180;

async function contactIdFor(actor: Actor, toolName: string, args: Record<string, unknown>): Promise<string | null> {
  const direct = str(args.clientId, 80) || str(args.contactId, 80);
  if (direct) {
    const c = await findContact(actor, direct);
    return c?.id ?? null;
  }
  const companyId = actor.companyId;
  const jobNumber = num(args.jobNumber);
  if (jobNumber !== null && args.jobNumber !== undefined) {
    const j = await prisma.job.findFirst({ where: { companyId, jobNumber }, select: { contactId: true } });
    return j?.contactId ?? null;
  }
  const jobId = str(args.jobId, 40);
  if (jobId) {
    const j = await prisma.job.findFirst({ where: { companyId, id: jobId }, select: { contactId: true } });
    return j?.contactId ?? null;
  }
  const appointmentId = str(args.appointmentId, 40);
  if (appointmentId) {
    const a = await prisma.appointment.findFirst({ where: { companyId, id: appointmentId }, select: { contactId: true } });
    return a?.contactId ?? null;
  }
  const quoteNumber = num(args.quoteNumber);
  if (quoteNumber !== null && args.quoteNumber !== undefined) {
    const q = await prisma.quote.findFirst({ where: { companyId, quoteNumber }, select: { contactId: true } });
    return q?.contactId ?? null;
  }
  const quoteId = str(args.quoteId, 40);
  if (quoteId) {
    const q = await prisma.quote.findFirst({ where: { companyId, id: quoteId }, select: { contactId: true } });
    return q?.contactId ?? null;
  }
  const invoiceNumber = num(args.invoiceNumber);
  if (invoiceNumber !== null && args.invoiceNumber !== undefined) {
    const i = await prisma.invoice.findFirst({ where: { companyId, invoiceNumber }, select: { contactId: true } });
    return i?.contactId ?? null;
  }
  // get_document takes kind + number
  if (toolName === "get_document") {
    const n = num(args.number);
    const kind = str(args.kind, 12).toLowerCase();
    if (n !== null && args.number !== undefined) {
      if (kind === "quote") return (await prisma.quote.findFirst({ where: { companyId, quoteNumber: n }, select: { contactId: true } }))?.contactId ?? null;
      if (kind === "invoice") return (await prisma.invoice.findFirst({ where: { companyId, invoiceNumber: n }, select: { contactId: true } }))?.contactId ?? null;
      if (kind === "job") return (await prisma.job.findFirst({ where: { companyId, jobNumber: n }, select: { contactId: true } }))?.contactId ?? null;
    }
  }
  return null;
}

export type ClientHeadsUp = {
  client: string;
  notes?: string[];
  profileNote?: string;
  moreNotes?: number;
  rule?: string;
};

/** The compact note bundle for one client; null when they have no notes. */
export async function clientHeadsUp(actor: Actor, contactId: string): Promise<ClientHeadsUp | null> {
  const c = await prisma.contact.findFirst({
    where: { id: contactId, companyId: actor.companyId, ...contactScope(actor) },
    select: {
      firstName: true, lastName: true, companyName: true, notes: true,
      contactNotes: { take: 3, orderBy: { createdAt: "desc" }, select: { body: true, createdAt: true, user: { select: { name: true } } } },
      _count: { select: { contactNotes: true } },
    },
  });
  if (!c) return null;
  const profileNote = (c.notes ?? "").trim();
  if (!profileNote && c.contactNotes.length === 0) return null;
  // Fenced (lib/assistant/untrusted.ts): a note is data to weigh, never an order.
  const out: ClientHeadsUp = { client: clientName(c) };
  if (c.contactNotes.length > 0) {
    out.notes = c.contactNotes.map(
      (n) => `${n.createdAt.toISOString().slice(0, 10)} · ${n.user.name}: ${quoted(n.body, NOTE_CHARS)}`
    );
    if (c._count.contactNotes > 3) out.moreNotes = c._count.contactNotes - 3;
  }
  if (profileNote) out.profileNote = quoted(profileNote, 200) ?? undefined;
  return out;
}

export const HEADS_UP_RULE =
  "Read these notes before you reply. If one warns against what the user is doing, say so plainly in one sentence — then the user decides; if they already know or still want it, go ahead. Never refuse over a note.";

/**
 * Decorate a tool response with the client's notes when the call warrants
 * it. Never throws — a failure here must not sink the tool's real result.
 */
export async function withClientHeadsUp(
  actor: Actor,
  toolName: string,
  args: Record<string, unknown>,
  response: Record<string, unknown>,
  ctx: ToolCtx
): Promise<Record<string, unknown>> {
  if ("error" in response || CARRIES_NOTES.has(toolName)) return response;
  const staged = response.staged === true;
  if (!staged && !HEADS_UP_READS.has(toolName)) return response;
  try {
    const seen = (ctx.headsUpSeen ??= new Set<string>());
    if (seen.size >= MAX_PER_TURN) return response;
    const contactId = await contactIdFor(actor, toolName, args);
    if (!contactId || seen.has(contactId)) return response;
    const first = seen.size === 0;
    seen.add(contactId);
    const headsUp = await clientHeadsUp(actor, contactId);
    if (!headsUp) return response;
    return { ...response, clientHeadsUp: first ? { ...headsUp, rule: HEADS_UP_RULE } : headsUp };
  } catch {
    return response;
  }
}
