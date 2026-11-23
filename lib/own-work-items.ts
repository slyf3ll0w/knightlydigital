/**
 * A line item may name the price-book item it came from. That id arrives
 * from the browser, so before it is stored it must be one of THIS company's
 * items: otherwise a line could point at another company's price book
 * (2026-11-23 security review). An id that isn't the company's own is
 * cleared, which is what a hand-typed line already looks like, so the save
 * still goes through.
 */
import { prisma } from "@/lib/db";

/** Pure: clear every workItemId that is not in `own`. Mutates and returns the lines. */
export function clearForeignWorkItemIds<T>(lines: T[], own: Set<string>): T[] {
  for (const li of lines) {
    if (!li || typeof li !== "object") continue;
    const row = li as { workItemId?: unknown };
    if (row.workItemId == null) continue;
    if (typeof row.workItemId !== "string" || !own.has(row.workItemId)) row.workItemId = null;
  }
  return lines;
}

/** Clears, in place, any workItemId on the request's line items that isn't this company's. */
export async function keepOwnWorkItemIds(companyId: string, lineItems: unknown): Promise<void> {
  if (!Array.isArray(lineItems)) return;
  const ids = [
    ...new Set(
      lineItems
        .map((li) => (li && typeof li === "object" ? (li as { workItemId?: unknown }).workItemId : null))
        .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 60)
    ),
  ].slice(0, 500);
  const own = ids.length
    ? await prisma.workItem.findMany({ where: { companyId, id: { in: ids } }, select: { id: true } })
    : [];
  clearForeignWorkItemIds(lineItems, new Set(own.map((w) => w.id)));
}
