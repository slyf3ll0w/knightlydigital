import { prisma } from "@/lib/db";
import { phoneDigits } from "@/lib/phone";

/**
 * Blocked numbers (ticket #bwggje, 2026-11-27).
 *
 * A company can block a phone number: a call from it is hung up before
 * anything rings (no row in the call log, no push, no voicemail), and a text
 * from it is dropped before it reaches Messages. Blocking never touches the
 * person's record or history, and it does not stop the team calling or
 * texting them: it only silences what comes IN from that number.
 *
 * One row per company + number (BlockedNumber). The number is kept as its
 * ten bare digits, the shape every inbound lookup already uses.
 */

/** Ten bare digits for a US number in any dressing, or null. */
export function blockDigits(raw: string | null | undefined): string | null {
  const d = phoneDigits(raw ?? "");
  return d && d.length === 10 ? d : null;
}

export function prettyBlocked(digits: string): string {
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

export async function isBlockedNumber(companyId: string, raw: string | null | undefined): Promise<boolean> {
  const digits = blockDigits(raw);
  if (!digits) return false;
  const row = await prisma.blockedNumber.findUnique({ where: { companyId_digits: { companyId, digits } }, select: { id: true } });
  return Boolean(row);
}

export type BlockedRow = { id: string; digits: string; number: string; label: string | null; createdAt: string };

export async function listBlockedNumbers(companyId: string): Promise<BlockedRow[]> {
  const rows = await prisma.blockedNumber.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { id: true, digits: true, label: true, createdAt: true },
  });
  return rows.map((r) => ({ id: r.id, digits: r.digits, number: prettyBlocked(r.digits), label: r.label, createdAt: r.createdAt.toISOString() }));
}

/**
 * Block a number. The label defaults to whoever that number is on file as,
 * so the list in Settings says "Maria Lopez" rather than only digits.
 * Idempotent: blocking a blocked number answers the row that exists.
 */
export async function blockNumber(companyId: string, digits: string, opts: { label?: string | null; userId?: string | null } = {}): Promise<BlockedRow> {
  let label = opts.label?.trim().slice(0, 80) || null;
  if (!label) {
    const who = await prisma.contact.findFirst({
      where: { companyId, phoneDigits: digits, placeholder: false },
      orderBy: { updatedAt: "desc" },
      select: { firstName: true, lastName: true, companyName: true },
    });
    label = who ? `${who.firstName} ${who.lastName}`.trim() || who.companyName || null : null;
  }
  const row = await prisma.blockedNumber.upsert({
    where: { companyId_digits: { companyId, digits } },
    create: { companyId, digits, label, createdById: opts.userId ?? null },
    update: {},
    select: { id: true, digits: true, label: true, createdAt: true },
  });
  return { id: row.id, digits: row.digits, number: prettyBlocked(row.digits), label: row.label, createdAt: row.createdAt.toISOString() };
}

/** Unblock by number. Returns whether anything was blocked. */
export async function unblockNumber(companyId: string, digits: string): Promise<boolean> {
  const gone = await prisma.blockedNumber.deleteMany({ where: { companyId, digits } });
  return gone.count > 0;
}
