import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { isQuickBooksConfigured, quickBooksEnvironment } from "@/lib/quickbooks";

/** Connection state + sync health for the Settings → QuickBooks page. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const configured = isQuickBooksConfigured();
  const connection = configured
    ? await prisma.quickBooksConnection.findUnique({ where: { companyId: actor.companyId } })
    : null;

  if (!connection) {
    return NextResponse.json({ configured, connected: false });
  }

  const [synced, errorRecords, invoiceTotal, invoiceSynced] = await Promise.all([
    prisma.quickBooksSyncRecord.count({
      where: { companyId: actor.companyId, status: "SYNCED" },
    }),
    prisma.quickBooksSyncRecord.findMany({
      where: { companyId: actor.companyId, status: "ERROR" },
      orderBy: { lastSyncedAt: "desc" },
      take: 5,
      select: { entityType: true, localId: true, error: true, lastSyncedAt: true },
    }),
    prisma.invoice.count({
      where: { companyId: actor.companyId, status: { not: "DRAFT" } },
    }),
    prisma.quickBooksSyncRecord.count({
      where: { companyId: actor.companyId, entityType: "INVOICE", status: "SYNCED" },
    }),
  ]);

  return NextResponse.json({
    configured,
    connected: true,
    environment: quickBooksEnvironment(),
    qboCompanyName: connection.qboCompanyName,
    realmId: connection.realmId,
    autoSync: connection.autoSync,
    lastSyncAt: connection.lastSyncAt,
    lastSyncError: connection.lastSyncError,
    reconnectNeeded: connection.refreshTokenExpiresAt < new Date(),
    counts: {
      synced,
      errors: await prisma.quickBooksSyncRecord.count({
        where: { companyId: actor.companyId, status: "ERROR" },
      }),
      invoicesTotal: invoiceTotal,
      invoicesSynced: invoiceSynced,
    },
    recentErrors: errorRecords,
  });
}
