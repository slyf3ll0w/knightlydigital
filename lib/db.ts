import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma's pool defaults to `num_cpus * 2 + 1` connections with a 10 s wait —
 * on a shared Railway host that's whatever the box reports, not what the
 * container gets, and it's the app-side ceiling on concurrency (Postgres
 * allows 500). Pin it explicitly unless the URL already says otherwise.
 */
function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/[?&]connection_limit=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=20&pool_timeout=20`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    datasources: { db: { url: withPoolDefaults(process.env.DATABASE_URL) } },
    // Generous limits so multi-step writes survive slow connections instead
    // of timing out mid-request (default is 5s)
    transactionOptions: { maxWait: 10000, timeout: 20000 },
  });

globalForPrisma.prisma = prisma;

// ─── Calendar-sync write trigger ─────────────────────────────────────────────
// Any write to the four schedule tables nudges the Google Calendar push
// (lib/google-calendar.ts) to reconcile that company a few seconds later.
// Registered once per process (the singleton above survives HMR, so guard
// against stacking a second copy). The sync module is imported lazily so this
// file stays dependency-free and the hook costs nothing until a company has
// actually connected a Google account. Prisma 5's `$use` is deprecated in
// favor of client extensions but still supported; swap when we upgrade.
const SCHEDULE_MODELS = new Set(["Job", "JobAssignment", "Appointment", "TimeBlock"]);
const WRITE_ACTIONS = new Set(["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany"]);

const globalForTrigger = globalThis as unknown as { calendarSyncTriggerInstalled?: boolean };
if (!globalForTrigger.calendarSyncTriggerInstalled) {
  globalForTrigger.calendarSyncTriggerInstalled = true;
  prisma.$use(async (params, next) => {
    const result = await next(params);
    if (params.model && SCHEDULE_MODELS.has(params.model) && WRITE_ACTIONS.has(params.action)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = (params.args ?? {}) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = result as any;
      const companyId: string | null =
        (typeof row?.companyId === "string" && row.companyId) ||
        (typeof args.where?.companyId === "string" && args.where.companyId) ||
        (typeof args.data?.companyId === "string" && args.data.companyId) ||
        (typeof args.create?.companyId === "string" && args.create.companyId) ||
        null;
      import("@/lib/google-calendar")
        .then((m) => m.scheduleGoogleCalendarSync(companyId))
        .catch((err) => console.error("[calendar-sync] trigger failed", err));
    }
    return result;
  });
}
