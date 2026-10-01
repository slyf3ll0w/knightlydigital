import { prisma } from "@/lib/db";

/**
 * What the public /status page shows. Same signals as /api/health, read in
 * one place so the page and the probe can never disagree:
 *   - database: a timed `SELECT 1`
 *   - hourly automations: age of the last nightly reconcile (the final step
 *     of the hourly cron, so it only advances when the cron is alive)
 * The page itself is served by the app, so "web app" is operational by the
 * fact that it rendered; a full outage shows as the page not loading, which
 * the copy on it says out loud.
 */

export type ComponentState = "operational" | "degraded" | "down";

export type ComponentStatus = {
  key: string;
  name: string;
  description: string;
  state: ComponentState;
  detail: string;
};

export type PlatformStatus = {
  checkedAt: Date;
  overall: ComponentState;
  components: ComponentStatus[];
};

const DB_SLOW_MS = 1500;
const CRON_DEGRADED_HOURS = 30;
const CRON_DOWN_HOURS = 48;

const RANK: Record<ComponentState, number> = { operational: 0, degraded: 1, down: 2 };

export async function loadPlatformStatus(): Promise<PlatformStatus> {
  const checkedAt = new Date();
  const [database, cron] = await Promise.all([checkDatabase(), checkCron()]);
  const components: ComponentStatus[] = [
    {
      key: "web",
      name: "Web app and mobile apps",
      description: "workbenchfsm.com, the client hub, booking pages and the iPhone / Android apps.",
      state: "operational",
      detail: "Responding.",
    },
    database,
    cron,
  ];
  const overall = components.reduce<ComponentState>(
    (worst, c) => (RANK[c.state] > RANK[worst] ? c.state : worst),
    "operational"
  );
  return { checkedAt, overall, components };
}

async function checkDatabase(): Promise<ComponentStatus> {
  const base = {
    key: "database",
    name: "Database",
    description: "Where your clients, jobs, quotes, invoices and messages live.",
  };
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - started;
    return ms > DB_SLOW_MS
      ? { ...base, state: "degraded", detail: `Reachable but slow (${ms} ms).` }
      : { ...base, state: "operational", detail: `Responding in ${ms} ms.` };
  } catch {
    return { ...base, state: "down", detail: "Not reachable right now." };
  }
}

async function checkCron(): Promise<ComponentStatus> {
  const base = {
    key: "automations",
    name: "Hourly automations",
    description: "Recurring billing, autopay retries, payment and appointment reminders, automation rules, calendar and QuickBooks sync.",
  };
  try {
    const latest = await prisma.reconcileRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (!latest) return { ...base, state: "down", detail: "Has not run yet." };
    const ageHours = (Date.now() - latest.startedAt.getTime()) / 3600_000;
    const when = latest.startedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
    if (ageHours > CRON_DOWN_HOURS) return { ...base, state: "down", detail: `Last confirmed run ${when}.` };
    if (ageHours > CRON_DEGRADED_HOURS) return { ...base, state: "degraded", detail: `Last confirmed run ${when} — later than expected.` };
    return { ...base, state: "operational", detail: `Last confirmed run ${when}.` };
  } catch {
    return { ...base, state: "down", detail: "Could not read the run log." };
  }
}
