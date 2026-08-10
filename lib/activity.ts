import { prisma } from "@/lib/db";

/**
 * Append-only audit trail for money-touching mutations. Fire-and-forget: a
 * logging failure must never fail the mutation it describes, so callers don't
 * await the promise chain beyond the helper's own catch.
 *
 * What gets logged (deliberately narrow — this is a trust feature, not
 * telemetry): status flips on invoices/quotes, payment deletion, refunds,
 * card-on-file charges, invoice/job deletion. Read back on the entity detail
 * pages.
 */
export function logActivity(params: {
  companyId: string;
  userId?: string | null;
  userName?: string | null;
  entityType: "invoice" | "quote" | "payment" | "job" | "contact";
  entityId: string;
  action: string;
  detail?: string | null;
}): void {
  prisma.activityLog
    .create({
      data: {
        companyId: params.companyId,
        userId: params.userId ?? null,
        userName: params.userName ?? null,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        detail: params.detail?.slice(0, 500) ?? null,
      },
    })
    .catch((e) => console.error("[activity] log failed", params.action, e));
}

/** The audit rows for one entity, newest first (detail-page display). */
export async function activityFor(
  companyId: string,
  entityType: string,
  entityId: string,
  take = 20
) {
  return prisma.activityLog.findMany({
    where: { companyId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
