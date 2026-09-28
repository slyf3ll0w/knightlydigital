import { prisma } from "./db";
import { loadPriceBook } from "./estimator-server";
import type { PriceBookEntry } from "./estimator";

/**
 * What the builder knows about the business before it writes a tool —
 * everything in Workbench that bears on pricing, gathered once per build:
 *   - the business itself (trade, where it works, deposit / tax defaults)
 *   - the price book (services with price, cost, duration, description)
 *   - what they've ACTUALLY charged: quote lines from the last year, grouped
 *     by name with count and typical price — the truest rates there are
 *   - the services offered for online booking (names, durations)
 *   - the estimate tools they already have (naming, no duplicates)
 * Rendered as compact text for the model, plus the price book itself for
 * the compile-time checks. Nothing here costs tokens beyond the prompt.
 */

export type BusinessContext = {
  /** Prompt block. */
  text: string;
  /** Short version for the (cheap) plan call. */
  brief: string;
  book: PriceBookEntry[];
  /** The company's stated trade, for playbook matching when the description is vague. */
  industry: string | null;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export async function loadBusinessContext(companyId: string, opts: { excludeEstimatorId?: string } = {}): Promise<BusinessContext> {
  const since = new Date(Date.now() - 365 * 86400_000);
  const [company, book, items, bookingTypes, tools, lineRows] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, industry: true, city: true, state: true, serviceZips: true, website: true, defaultDepositValue: true, defaultTaxRate: true, surchargeEnabled: true },
    }),
    loadPriceBook(companyId),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      select: { name: true, description: true, unitPrice: true, unitCost: true, durationMinutes: true, depositValue: true, recurringInterval: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
    prisma.bookingType.findMany({ where: { companyId, isActive: true }, select: { name: true, description: true, durationMinutes: true }, orderBy: { sortOrder: "asc" }, take: 20 }),
    prisma.estimator.findMany({
      where: { companyId, ...(opts.excludeEstimatorId ? { NOT: { id: opts.excludeEstimatorId } } : {}) },
      select: { name: true, description: true, isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.quoteLineItem.findMany({
      where: { quote: { companyId, createdAt: { gte: since }, status: { in: ["AWAITING_RESPONSE", "APPROVED", "CONVERTED"] } } },
      select: { name: true, description: true, unitPrice: true, quantity: true, workItemId: true },
      orderBy: { quote: { createdAt: "desc" } },
      take: 2500,
    }),
  ]);

  // What they've actually charged: group by line name, typical price + range
  const groups = new Map<string, { name: string; prices: number[]; qtys: number[]; linked: boolean }>();
  for (const l of lineRows) {
    const name = (l.name || l.description || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const g = groups.get(key) ?? { name, prices: [], qtys: [], linked: false };
    g.prices.push(Number(l.unitPrice));
    g.qtys.push(Number(l.quantity));
    if (l.workItemId) g.linked = true;
    groups.set(key, g);
  }
  const charged = Array.from(groups.values())
    .sort((a, b) => b.prices.length - a.prices.length)
    .slice(0, 40)
    .map((g) => {
      const lo = Math.min(...g.prices), hi = Math.max(...g.prices), med = median(g.prices), q = median(g.qtys);
      const range = lo === hi ? money(med) : `typically ${money(med)} (${money(lo)}–${money(hi)})`;
      return `- ${g.name} — ${range} per unit${q !== 1 ? `, typical qty ${q}` : ""}, on ${g.prices.length} quote line${g.prices.length === 1 ? "" : "s"}`;
    });

  const bizLines = company
    ? [
        `Name: ${company.name}`,
        company.industry ? `Trade: ${company.industry}` : null,
        company.city || company.state ? `Based in: ${[company.city, company.state].filter(Boolean).join(", ")}` : null,
        company.serviceZips.length > 0 ? `Service area: ${company.serviceZips.length} ZIP code${company.serviceZips.length === 1 ? "" : "s"}` : null,
        company.website ? `Website: ${company.website}` : null,
        company.defaultDepositValue !== null ? `Default deposit on quotes: ${Number(company.defaultDepositValue) <= 100 ? `${Number(company.defaultDepositValue)}%` : money(Number(company.defaultDepositValue))}` : null,
        company.defaultTaxRate !== null ? `Tax is added on the quote (${(Number(company.defaultTaxRate) * 100).toFixed(2)}%) — tool prices are PRE-tax` : "Tool prices are pre-tax; the quote adds tax",
      ].filter(Boolean)
    : [];

  const bookLines = items.length
    ? items.map((w) => {
        const recurring = w.recurringInterval ? `RECURRING — billed ${w.recurringInterval.toLowerCase()} (link it for a subscription)` : null;
        const bits = [money(Number(w.unitPrice)), w.unitCost !== null ? `cost ${money(Number(w.unitCost))}` : null, w.durationMinutes ? `${w.durationMinutes} min` : null, w.depositValue !== null ? `deposit ${Number(w.depositValue) <= 100 ? `${Number(w.depositValue)}%` : money(Number(w.depositValue))}` : null, recurring].filter(Boolean);
        return `- ${w.name} — ${bits.join(", ")}${w.description ? ` — ${w.description.replace(/\s+/g, " ").slice(0, 140)}` : ""}`;
      })
    : ["(empty)"];

  const bookingLines = bookingTypes.map((b) => `- ${b.name}${b.durationMinutes ? ` (${b.durationMinutes} min)` : ""}${b.description ? ` — ${b.description.replace(/\s+/g, " ").slice(0, 100)}` : ""}`);
  const toolLines = tools.map((t) => `- ${t.name}${t.isActive ? "" : " (off)"}${t.description ? ` — ${t.description}` : ""}`);

  const text = [
    `THE BUSINESS (from Workbench — use it):\n${bizLines.join("\n")}`,
    `\nPrice book — services and products with the rates they sell at (exact names; link lines with workItemName; a linked line inherits the item's cost, description and recurring billing):\n${bookLines.join("\n")}`,
    charged.length > 0 ? `\nWhat they've actually charged on quotes in the last year (the truest rates — prefer these over guesses):\n${charged.join("\n")}` : "\nNo priced quotes in the last year yet.",
    bookingLines.length > 0 ? `\nServices offered for online booking:\n${bookingLines.join("\n")}` : null,
    toolLines.length > 0 ? `\nEstimate tools they already have (don't duplicate; keep naming consistent):\n${toolLines.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const brief = [
    bizLines.slice(0, 3).join(" · "),
    items.length > 0 ? `Price book (${items.length}): ${items.slice(0, 25).map((w) => `${w.name} ${money(Number(w.unitPrice))}`).join("; ")}${items.length > 25 ? "; …" : ""}` : "Price book: empty",
    charged.length > 0 ? `Charged on quotes: ${charged.slice(0, 12).map((c) => c.replace(/^- /, "")).join("; ")}` : null,
    toolLines.length > 0 ? `Existing tools: ${tools.map((t) => t.name).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { text, brief, book, industry: company?.industry ?? null };
}

// ── win rate per tool (the feedback nobody gives an owner on their pricing) ──

export type ToolStats = {
  /** Quotes that started from this tool (web form + in-app runs), all statuses */
  quotes: number;
  /** Approved or converted */
  won: number;
  /** Sent and still waiting, or changes requested */
  open: number;
  /** Sent quotes that were archived without approval */
  lost: number;
  /** won / (won + lost), null until at least 3 decided */
  winRate: number | null;
  /** Average total of the won quotes, null when none */
  avgWonTicket: number | null;
  /** Average total of every quote */
  avgTicket: number | null;
};

const EMPTY_STATS: ToolStats = { quotes: 0, won: 0, open: 0, lost: 0, winRate: null, avgWonTicket: null, avgTicket: null };

/** Quotes stamped with this tool (Quote.estimatorId), grouped into won / open / lost. */
export async function loadToolStats(companyId: string, estimatorId: string): Promise<ToolStats> {
  const rows = await prisma.quote.findMany({
    where: { companyId, estimatorId },
    select: { status: true, total: true, sentAt: true },
    take: 2000,
  });
  if (rows.length === 0) return EMPTY_STATS;
  let won = 0, open = 0, lost = 0, wonSum = 0, sum = 0;
  for (const q of rows) {
    const total = Number(q.total);
    sum += total;
    if (q.status === "APPROVED" || q.status === "CONVERTED") {
      won++;
      wonSum += total;
    } else if (q.status === "AWAITING_RESPONSE" || q.status === "CHANGES_REQUESTED") open++;
    else if (q.status === "ARCHIVED" && q.sentAt) lost++;
  }
  const decided = won + lost;
  return {
    quotes: rows.length,
    won,
    open,
    lost,
    winRate: decided >= 3 ? Math.round((won / decided) * 100) : null,
    avgWonTicket: won > 0 ? Math.round(wonSum / won) : null,
    avgTicket: Math.round(sum / rows.length),
  };
}

/** The stats as a prompt block for a change build — so Atlas can say "Premium never wins" when asked about pricing. */
export function toolStatsText(stats: ToolStats, toolName: string): string {
  if (stats.quotes === 0) return "";
  const bits = [
    `${stats.quotes} quote${stats.quotes === 1 ? "" : "s"} started from it`,
    `${stats.won} won`,
    `${stats.lost} lost (sent, never approved)`,
    `${stats.open} still open`,
    stats.winRate !== null ? `win rate ${stats.winRate}%` : "too few decided to call a win rate",
    stats.avgWonTicket !== null ? `average won ticket ${money(stats.avgWonTicket)}` : null,
    stats.avgTicket !== null ? `average quote ${money(stats.avgTicket)}` : null,
  ].filter(Boolean);
  return `How "${toolName}" has been doing: ${bits.join(" · ")}. A win rate above ~85% on a good sample usually means the tool is priced low; well under ~30% means high or the wrong shape — say so when the owner asks about pricing, and never change rates they didn't ask you to change.`;
}
