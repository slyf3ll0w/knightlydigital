/**
 * The Lead sources report's read (rules + math: lib/lead-source.ts
 * `buildSourceRows`). One question: of the leads that came in during a
 * period, where did they come from and what became of them?
 *
 * It follows the LEADS, not the calendar: a lead that arrived in the period
 * counts with everything it has done since (quote sent, became a client,
 * money collected), so a source's revenue is "what these leads have paid so
 * far". The Insights "By lead source" card is the other view: money collected
 * in the period, whenever the client first arrived.
 */
import { prisma } from "./db";
import { buildSourceRows, canonicalLeadSource, leadSourceKey, UNTRACKED_SOURCE, type SourceRow } from "./lead-source";

/** Newest leads read for one report; a period with more says so (`capped`). */
export const REPORT_LEAD_CAP = 5000;

export type LeadSourceReport = {
  rows: SourceRow[];
  totals: { leads: number; quoted: number; won: number; revenue: number; winRate: number | null };
  capped: boolean;
};

type Range = { since: Date; until?: Date };

function leadWhere(companyId: string, { since, until }: Range) {
  return {
    companyId,
    kind: "CLIENT" as const,
    placeholder: false,
    createdAt: { gte: since, ...(until ? { lt: until } : {}) },
  };
}

export async function loadLeadSourceReport(companyId: string, range: Range): Promise<LeadSourceReport> {
  const where = leadWhere(companyId, range);
  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: REPORT_LEAD_CAP + 1,
    select: { id: true, leadSource: true, status: true, wonAt: true },
  });
  const capped = contacts.length > REPORT_LEAD_CAP;
  const leads = capped ? contacts.slice(0, REPORT_LEAD_CAP) : contacts;
  const ids = new Set(leads.map((c) => c.id));

  const [quoted, paid] = await Promise.all([
    prisma.quote.groupBy({
      by: ["contactId"],
      where: { companyId, status: { not: "DRAFT" }, contact: where },
      _count: true,
    }),
    prisma.payment.findMany({
      where: { companyId, invoice: { contact: where } },
      select: { amount: true, invoice: { select: { contactId: true } } },
    }),
  ]);
  const quotedIds = new Set(quoted.map((q) => q.contactId));
  const revenue = new Map<string, number>();
  for (const p of paid) {
    const id = p.invoice?.contactId;
    if (!id || !ids.has(id)) continue;
    revenue.set(id, (revenue.get(id) ?? 0) + Number(p.amount));
  }

  const rows = buildSourceRows(
    leads.map((c) => ({
      source: c.leadSource,
      quoted: quotedIds.has(c.id),
      won: c.status === "ACTIVE" || c.wonAt !== null,
      revenue: revenue.get(c.id) ?? 0,
    }))
  );
  const sum = (f: (r: SourceRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totalLeads = sum((r) => r.leads);
  const won = sum((r) => r.won);
  return {
    rows,
    totals: {
      leads: totalLeads,
      quoted: sum((r) => r.quoted),
      won,
      revenue: Math.round(sum((r) => r.revenue) * 100) / 100,
      winRate: totalLeads > 0 ? Math.round((won / totalLeads) * 100) : null,
    },
    capped,
  };
}

export type SourceLeadRow = { id: string; name: string; createdAt: Date; status: string; won: boolean; detail: string | null };

/** The leads behind one row of the report (newest first, 200 max). */
export async function loadLeadsForSource(companyId: string, range: Range, sourceKey: string): Promise<{ source: string; leads: SourceLeadRow[] }> {
  const contacts = await prisma.contact.findMany({
    where: leadWhere(companyId, range),
    orderBy: { createdAt: "desc" },
    take: REPORT_LEAD_CAP,
    select: { id: true, firstName: true, lastName: true, companyName: true, leadSource: true, status: true, wonAt: true, createdAt: true, leadArrival: true },
  });
  let source = "";
  const leads: SourceLeadRow[] = [];
  for (const c of contacts) {
    const label = canonicalLeadSource(c.leadSource) ?? UNTRACKED_SOURCE;
    if (leadSourceKey(label) !== sourceKey) continue;
    source ||= label;
    if (leads.length >= 200) continue;
    const arrival = c.leadArrival && typeof c.leadArrival === "object" && !Array.isArray(c.leadArrival) ? (c.leadArrival as Record<string, unknown>) : null;
    const campaign = arrival && typeof arrival.utmCampaign === "string" ? arrival.utmCampaign : null;
    const term = arrival && typeof arrival.utmTerm === "string" ? arrival.utmTerm : null;
    leads.push({
      id: c.id,
      name: c.companyName?.trim() || `${c.firstName} ${c.lastName}`.trim(),
      createdAt: c.createdAt,
      status: c.status,
      won: c.status === "ACTIVE" || c.wonAt !== null,
      detail: [campaign, term].filter(Boolean).join(" · ") || null,
    });
  }
  return { source, leads };
}
