import { prisma } from "../db";
import { type Actor, contactScope } from "../permissions";
import { wallTimeToUtc } from "../booking-slots";
import type { AIFunctionDecl } from "../ai";

/**
 * Shared plumbing for the assistant tool registry (see index.ts for the
 * architecture note). Every domain module imports from here; nothing here
 * knows about specific tools.
 */

/** One request of a batch proposal. */
export type BatchItem = {
  endpoint: string;
  method: "POST" | "PATCH" | "DELETE";
  payload: Record<string, unknown>;
};

/** A staged write, rendered as a confirmation card in the drawer. Confirm
 *  POSTs `payload` to `endpoint` — an existing, self-validating API route. */
export type Proposal = {
  id: string;
  kind: string;
  title: string;
  lines: string[];
  endpoint: string;
  method: "POST" | "PATCH" | "DELETE";
  payload: Record<string, unknown>;
  /** Destructive action — card renders red. */
  danger?: boolean;
  /** Extra authentication for destructive cards: the user must type this
   *  exact text before Confirm arms (matches the force-delete page UX). */
  confirmText?: string;
  /** Bulk work: one card, one Confirm, many requests run in order.
   *  When present, endpoint/method/payload above are ignored. */
  batch?: BatchItem[];
};

export type ToolCtx = { proposals: Proposal[] };

export type Tool = {
  decl: AIFunctionDecl;
  allowed: (actor: Actor) => boolean;
  run: (
    actor: Actor,
    args: Record<string, unknown>,
    ctx: ToolCtx
  ) => Promise<Record<string, unknown>>;
};

// ── helpers ──────────────────────────────────────────────────────────────────

export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function money(v: unknown): string {
  return `$${Number(v ?? 0).toFixed(2)}`;
}

export function clientName(c: { firstName: string; lastName: string; companyName?: string | null }): string {
  const person = `${c.firstName} ${c.lastName}`.trim();
  return c.companyName ? `${person} (${c.companyName})` : person;
}

/** Parse YYYY-MM-DD to a UTC-noon date; null for garbage. */
export function day(v: unknown): Date | null {
  const s = str(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtWhen(tz: string, d: Date, anytime: boolean): string {
  const date = d.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (anytime) return `${date} (anytime)`;
  return `${date} ${d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`;
}

/** Absolute-URL base for client-facing links (prod sets NEXTAUTH_URL). */
export function siteBase(): string {
  return (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
}

export async function companyTz(companyId: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return c?.timezone ?? "America/Chicago";
}

/** Look up one visible contact; shared by activity + action tools. */
export async function findContact(actor: Actor, clientId: string) {
  return prisma.contact.findFirst({
    where: { id: str(clientId, 40), companyId: actor.companyId, ...contactScope(actor) },
    select: { id: true, firstName: true, lastName: true, companyName: true, address: true },
  });
}

/** date (+optional time/duration) → schedule payload fields + display label,
 *  wall-time-correct in the company's timezone. */
export async function schedulePayload(
  companyId: string,
  dateArg: unknown,
  timeArg: unknown,
  durationArg: unknown
): Promise<{ error: string } | { fields: Record<string, unknown>; label: string }> {
  const d = day(dateArg);
  if (!d) return { error: "date must be YYYY-MM-DD" };
  const tz = await companyTz(companyId);
  const [y, m, dd] = str(dateArg, 10).split("-").map(Number);
  const time = str(timeArg, 5);
  const anytime = !/^\d{2}:\d{2}$/.test(time);
  const minutes = anytime ? 12 * 60 : Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const start = wallTimeToUtc(tz, y, m, dd, minutes);
  const dur = num(durationArg);
  const durationMin = dur && dur >= 15 && dur <= 600 ? dur : 60;
  return {
    label: fmtWhen(tz, start, anytime),
    fields: {
      scheduledAt: start.toISOString(),
      ...(anytime
        ? { scheduledAnytime: true, scheduledEnd: null }
        : {
            scheduledAnytime: false,
            scheduledEnd: new Date(start.getTime() + durationMin * 60000).toISOString(),
          }),
    },
  };
}

export function stage(ctx: ToolCtx, p: Omit<Proposal, "id">): Record<string, unknown> {
  const proposal: Proposal = { ...p, id: `p${ctx.proposals.length + 1}-${p.kind}` };
  ctx.proposals.push(proposal);
  return {
    staged: true,
    summary: `${p.title} — a confirmation card is now showing; the user must press Confirm for it to happen.`,
  };
}

/** Sanitize an AI-supplied line-items array (shared by quotes, invoices, jobs). */
export function parseLineItems(raw: unknown): { description: string; quantity: number; unitPrice: number }[] {
  const items = Array.isArray(raw) ? raw.slice(0, 10) : [];
  return items
    .map((li) => {
      const r = (li ?? {}) as Record<string, unknown>;
      const quantity = r.quantity === null || r.quantity === undefined ? null : Math.round(num(r.quantity) ?? 0);
      const unitPrice = num(r.unitPrice);
      return {
        description: str(r.description, 200),
        // Quantities are whole units
        quantity: quantity && quantity > 0 && quantity <= 999 ? quantity : 1,
        unitPrice: unitPrice !== null && unitPrice >= 0 && unitPrice <= 100000 ? unitPrice : 0,
      };
    })
    .filter((li) => li.description);
}

/** Standard Gemini declaration for a line-items parameter. */
export const LINE_ITEMS_PARAM = {
  type: "array",
  items: {
    type: "object",
    properties: {
      description: { type: "string" },
      quantity: { type: "integer" },
      unitPrice: { type: "number" },
    },
    required: ["description", "quantity", "unitPrice"],
  },
} as const;
