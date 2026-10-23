import { prisma } from "../db";
import { type Actor, contactScope } from "../permissions";
import { wallTimeToUtc } from "../booking-engine";
import type { AIFunctionDecl } from "../ai";
import { matchPriceBook } from "../price-book-match";

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
  /** Moves real money (charges a card, refunds, payouts, billing runs) —
   *  card renders amber with a money note and never merges into a batch. */
  money?: boolean;
  /** Verb for the commit button ("Send email", "Charge card"); the drawer
   *  derives one from `kind` when absent. */
  confirmLabel?: string;
  /** Where to go after Confirm succeeds (relative /app path). */
  href?: string;
  /** Extra authentication for destructive cards: the user must type this
   *  exact text before Confirm arms (matches the force-delete page UX). */
  confirmText?: string;
  /** Bulk work: one card, one Confirm, many requests run in order.
   *  When present, endpoint/method/payload above are ignored. */
  batch?: BatchItem[];
};

export type ToolCtx = {
  proposals: Proposal[];
  /** Set by queue_next_step: the follow-up request the drawer sends on its
   *  own once every card staged this turn is confirmed (multi-step work
   *  where step two depends on step one being saved). */
  nextStep?: string;
  /** Fold a side model call (e.g. a grounded web lookup) into this turn's metered usage. */
  addUsage?: (u: { tokensIn: number; tokensOut: number; tokensCached: number }) => void;
  /** Set by a tool whose work lives on a page (the Estimates builder): the drawer opens this /app path after the reply. */
  navigate?: string;
};

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

/** Look up one visible contact; shared by activity + action tools.
 *  Takes an id — or, when the model passed a name instead (voice sessions
 *  do this: "email Marcus Henderson"), the one contact whose first/last/
 *  company name matches every word of it. Ambiguous names return null so
 *  the tool asks rather than guessing. */
export async function findContact(actor: Actor, clientId: string) {
  const select = { id: true, firstName: true, lastName: true, companyName: true, address: true } as const;
  const key = str(clientId, 80).trim();
  if (!key) return null;
  const byId = await prisma.contact.findFirst({ where: { id: key.slice(0, 40), companyId: actor.companyId, ...contactScope(actor) }, select });
  if (byId) return byId;
  const words = key.split(/\s+/).filter((w) => /^[\p{L}\p{N}'’.&-]{2,}$/u.test(w)).slice(0, 4);
  if (words.length === 0 || /_id|placeholder|^[a-z0-9]{20,}$/i.test(key)) return null;
  const matches = await prisma.contact.findMany({
    where: {
      companyId: actor.companyId,
      ...contactScope(actor),
      AND: words.map((w) => ({
        OR: [
          { firstName: { contains: w, mode: "insensitive" as const } },
          { lastName: { contains: w, mode: "insensitive" as const } },
          { companyName: { contains: w, mode: "insensitive" as const } },
        ],
      })),
    },
    select,
    take: 2,
  });
  return matches.length === 1 ? matches[0] : null;
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
export type ParsedLineItem = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** undefined = the model didn't say — inherit from the existing line on edits. */
  isOptional: boolean | undefined;
  /** Set when the line was priced from (or matched to) a price-book entry. */
  unitCost?: number | null;
  workItemId?: string | null;
};

function parseLineItem(li: unknown): (ParsedLineItem & { priced: boolean }) | null {
  const r = (li ?? {}) as Record<string, unknown>;
  const quantity = r.quantity === null || r.quantity === undefined ? null : Math.round(num(r.quantity) ?? 0);
  const unitPrice = num(r.unitPrice);
  const item = {
    name: str(r.name, 120),
    description: str(r.description, 200),
    // Quantities are whole units
    quantity: quantity && quantity > 0 && quantity <= 999 ? quantity : 1,
    unitPrice: unitPrice !== null && unitPrice >= 0 && unitPrice <= 100000 ? unitPrice : 0,
    isOptional: r.isOptional === true ? true : r.isOptional === false ? false : undefined,
    // A missing or $0 price means "look it up"
    priced: unitPrice !== null && unitPrice > 0,
  };
  return item.description || item.name ? item : null;
}

export function parseLineItems(raw: unknown): ParsedLineItem[] {
  const items = Array.isArray(raw) ? raw.slice(0, 10) : [];
  return items
    .map(parseLineItem)
    .filter((li): li is ParsedLineItem & { priced: boolean } => li !== null)
    .map(({ priced: _priced, ...li }) => li);
}

export type ResolvedLineItems = {
  items: ParsedLineItem[];
  /** Lines with no price and no price-book match — ask about these, naming the closest entries. */
  unresolved: { name: string; close: string[] }[];
};

/**
 * parseLineItems + the price book (David 2026-10-19): a line the model sent
 * without a price (or at $0) is priced by its name from the company's active
 * services and products — typo-tolerant, so "Wter Heater Replacement" finds
 * "Water Heater Replacement" and carries its price, cost basis and
 * price-book link. A clear match also normalises the name and links the
 * line even when the model did give a price. Nothing matching an unpriced
 * line → it's listed in `unresolved` so the tool can ask ONE precise
 * question ("pick one of these or give me a price") instead of "how much?".
 */
export async function resolveLineItems(companyId: string, raw: unknown): Promise<ResolvedLineItems> {
  const rawItems = Array.isArray(raw) ? raw.slice(0, 10) : [];
  const parsed = rawItems
    .map(parseLineItem)
    .filter((li): li is ParsedLineItem & { priced: boolean } => li !== null);
  const book = parsed.length
    ? await prisma.workItem.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, description: true, unitPrice: true, unitCost: true },
        take: 500,
      })
    : [];
  const unresolved: ResolvedLineItems["unresolved"] = [];
  const items: ParsedLineItem[] = [];
  for (const { priced, ...li } of parsed) {
    const label = li.name || li.description;
    const { best, close } = book.length ? matchPriceBook(label, book) : { best: null, close: [] };
    if (best) {
      items.push({
        ...li,
        name: best.name,
        description: li.description && li.description !== li.name ? li.description : best.description ?? "",
        unitPrice: priced ? li.unitPrice : Number(best.unitPrice),
        unitCost: best.unitCost != null ? Number(best.unitCost) : null,
        workItemId: best.id,
      });
      continue;
    }
    items.push(li);
    if (!priced) unresolved.push({ name: label, close: close.map((c) => `${c.name} (${money(c.unitPrice)})`) });
  }
  return { items, unresolved };
}

/** The one-line error a tool returns when lines couldn't be priced. */
export function unresolvedError(unresolved: ResolvedLineItems["unresolved"]): string {
  return unresolved
    .map((u) =>
      u.close.length
        ? `No price-book entry matches "${u.name}" — closest: ${u.close.join(", ")}. Ask the user to pick one or give a price.`
        : `No price-book entry matches "${u.name}" and no price was given. Ask the user for the price (or the right service name).`
    )
    .join(" ");
}

/** Standard Gemini declaration for a line-items parameter. */
export const LINE_ITEMS_PARAM = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short service/product name (shown bold)" },
      description: { type: "string" },
      quantity: { type: "integer" },
      unitPrice: {
        type: "number",
        description: "Omit to price the line from the price book by its name — only ask the user when the tool reports nothing matched",
      },
      isOptional: {
        type: "boolean",
        description: "Optional add-on the client can keep or remove when approving a quote",
      },
    },
    required: ["description", "quantity"],
  },
} as const;
