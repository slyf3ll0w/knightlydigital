import { prisma } from "@/lib/db";
import { usageDay } from "@/lib/usage";
import { storageCostCentsPerMonth, usageCostCents } from "@/lib/platform-costs";
import { bestPresence, latest, loadElsewhere, presenceOf, relativeSeen, viaLabel, type PresenceState } from "@/lib/presence";
import { ATLAS_ACCESS_SELECT, atlasAccess } from "@/lib/assistant-access";
import { PLANS, normalizeGrants } from "@/lib/plans";
import { mapboxMonthUsage } from "@/lib/mapbox-budget";
import type { Devices } from "@/components/console/DeviceIcons";

/**
 * The Accounts home of the platform console: one row per company with the
 * things that say whether a business is actually using WorkBench — who is
 * online, when they were last in, how many clients they've added, what
 * they've done in the range — plus what they cost us and what they carry.
 * Test accounts (Company.isTest) ride along with a flag so the page can
 * list them separately and keep them out of every total.
 */

export type Tone = "primary" | "secondary" | "good" | "warn" | "bad" | "neutral";

export type AccountStatus = {
  key: "live" | "pending" | "kyc-action" | "kyc-pending" | "kyc-rejected" | "suspended";
  label: string;
  tone: Tone;
};

export function accountStatus(c: {
  suspendedAt: Date | null;
  accessPendingAt: Date | null;
  finixOnboardingState: string | null;
}): AccountStatus {
  if (c.suspendedAt) return { key: "suspended", label: "Suspended", tone: "bad" };
  if (c.accessPendingAt) return { key: "pending", label: "Pending review", tone: "warn" };
  if (c.finixOnboardingState === "UPDATE_REQUESTED") return { key: "kyc-action", label: "KYC action needed", tone: "warn" };
  if (c.finixOnboardingState === "REJECTED") return { key: "kyc-rejected", label: "KYC rejected", tone: "bad" };
  if (c.finixOnboardingState === "PROVISIONING") return { key: "kyc-pending", label: "KYC pending", tone: "neutral" };
  return { key: "live", label: "Live", tone: "good" };
}

export type AccountRow = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  place: string | null;
  createdAt: string;
  isTest: boolean;
  status: AccountStatus;
  presence: PresenceState;
  lastSeenAt: string | null;
  lastSeen: string;
  team: { total: number; online: number };
  clients: { total: number; added: number };
  activity: { jobs: number; quotes: number; invoices: number; payments: number };
  collectedCents: number;
  costCents: number;
  cost: { ai: number; comms: number; storage: number; processing: number };
  chips: { label: string; tone: Tone }[];
  devices: Devices;
  referralSource: string | null;
};

/** One person in the app right now, for the home page's Online now list. */
export type OnlinePerson = {
  userId: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  companyName: string;
  isTest: boolean;
  via: string | null;
  seenAt: string;
};

export type Attention = { key: string; label: string; detail: string; tone: Tone; href: string };
export type GrowthWeek = { label: string; created: number; total: number };

export type AccountsData = {
  days: number;
  rows: AccountRow[];
  stats: { live: number; online: number; active7d: number; newThisMonth: number; pending: number; openFeedback: number };
  attention: Attention[];
  growth: GrowthWeek[];
  online: OnlinePerson[];
};

const DAY = 86_400_000;

export async function loadAccounts(days: number): Promise<AccountsData> {
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);
  const sinceDay = usageDay(since);
  const inRange = { createdAt: { gte: since } };

  const [companies, contactsAdded, jobs, quotes, invoices, payments, processed, usage, storage, pending, openFeedback, mapbox] =
    await Promise.all([
      prisma.company.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          industry: true,
          city: true,
          state: true,
          createdAt: true,
          isTest: true,
          suspendedAt: true,
          accessPendingAt: true,
          finixOnboardingState: true,
          planGrants: true,
          addonActiveAt: true,
          lineNumber: true,
          lineReleaseAt: true,
          timezone: true,
          referralSource: true,
          ...ATLAS_ACCESS_SELECT,
          messagingRegistration: { select: { status: true } },
          users: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              accountId: true,
              lastSeenAt: true,
              lastSeenVia: true,
              pushSubscriptions: { select: { platform: true } },
            },
          },
          _count: { select: { contacts: true } },
        },
      }),
      prisma.contact.groupBy({ by: ["companyId"], where: inRange, _count: { _all: true } }),
      prisma.job.groupBy({ by: ["companyId"], where: inRange, _count: { _all: true } }),
      prisma.quote.groupBy({ by: ["companyId"], where: inRange, _count: { _all: true } }),
      prisma.invoice.groupBy({ by: ["companyId"], where: inRange, _count: { _all: true } }),
      prisma.payment.groupBy({
        by: ["companyId"],
        where: { paidAt: { gte: since } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ["companyId"],
        where: { paidAt: { gte: since }, processorRef: { not: null } },
        _sum: { estCostCents: true },
      }),
      prisma.companyUsageDaily.groupBy({
        by: ["companyId"],
        where: { day: { gte: sinceDay } },
        _sum: { aiTokensIn: true, aiTokensOut: true, aiTokensCached: true, emailsSent: true, smsSegments: true },
      }),
      prisma.companyUsageDaily.findMany({
        where: { storageBytes: { not: null } },
        orderBy: { day: "desc" },
        distinct: ["companyId"],
        select: { companyId: true, storageBytes: true },
      }),
      prisma.accessApplication.count({ where: { status: "PENDING" } }),
      prisma.feedbackTicket.count({ where: { status: "OPEN" } }),
      mapboxMonthUsage(),
    ]);

  const countBy = (g: { companyId: string; _count: { _all: number } }[]) =>
    new Map(g.map((x) => [x.companyId, x._count._all]));
  const addedBy = countBy(contactsAdded);
  const jobsBy = countBy(jobs);
  const quotesBy = countBy(quotes);
  const invoicesBy = countBy(invoices);
  const paymentsBy = new Map(payments.map((p) => [p.companyId, p]));
  const processedBy = new Map(processed.map((p) => [p.companyId, p._sum.estCostCents ?? 0]));
  const usageBy = new Map(usage.map((u) => [u.companyId, u._sum]));
  const storageBy = new Map(storage.map((s) => [s.companyId, Number(s.storageBytes ?? 0)]));

  // A person on one login at several companies is online at the one they
  // used last, never at all of them (lib/presence.ts loadElsewhere).
  const elsewhere = await loadElsewhere(companies.flatMap((c) => c.users), now);
  const onlinePeople: OnlinePerson[] = [];

  const attention: Attention[] = [];
  const rows: AccountRow[] = companies.map((c) => {
    const status = accountStatus(c);
    const lastSeenAt = latest(c.users.map((u) => u.lastSeenAt));
    const states = c.users.map((u) => presenceOf(u.lastSeenAt, c.timezone, now, elsewhere.has(u.id)));
    const presence = bestPresence(states);
    const online = states.filter((st) => st === "online").length;
    c.users.forEach((u, i) => {
      if (states[i] !== "online") return;
      onlinePeople.push({
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        companyId: c.id,
        companyName: c.name,
        isTest: c.isTest,
        via: viaLabel(u.lastSeenVia),
        seenAt: u.lastSeenAt!.toISOString(),
      });
    });

    const u = usageBy.get(c.id);
    const ai = u
      ? usageCostCents({ aiTokensIn: u.aiTokensIn ?? 0, aiTokensOut: u.aiTokensOut ?? 0, aiTokensCached: u.aiTokensCached ?? 0, emailsSent: 0, smsSegments: 0 })
      : 0;
    const comms = u
      ? usageCostCents({ aiTokensIn: 0, aiTokensOut: 0, aiTokensCached: 0, emailsSent: u.emailsSent ?? 0, smsSegments: u.smsSegments ?? 0 })
      : 0;
    const storageCost = (storageCostCentsPerMonth(storageBy.get(c.id) ?? 0) * days) / 30;
    const processing = processedBy.get(c.id) ?? 0;
    const cost = { ai, comms, storage: storageCost, processing };

    const atlas = atlasAccess(c, now);
    const chips: AccountRow["chips"] = [];
    for (const p of normalizeGrants(c.planGrants)) chips.push({ label: PLANS[p].name, tone: "primary" });
    if (c.addonActiveAt && !normalizeGrants(c.planGrants).includes("DISPATCH")) chips.push({ label: "Voice (paid)", tone: "primary" });
    if (c.lineNumber && !c.lineNumber.startsWith("pending:")) chips.push({ label: c.lineReleaseAt ? "Line releasing" : "Line", tone: c.lineReleaseAt ? "warn" : "good" });
    chips.push(
      atlas.level === "full"
        ? { label: "Atlas full", tone: "primary" }
        : atlas.level === "plan"
          ? { label: "Atlas plan", tone: "primary" }
          : atlas.level === "free"
            ? { label: "Atlas free", tone: "neutral" }
            : atlas.level === "locked"
              ? { label: "Atlas spent", tone: "warn" }
              : { label: "Atlas off", tone: "neutral" }
    );

    const devices: Devices = { ios: false, android: false, web: false };
    for (const m of c.users) {
      if (m.lastSeenVia === "ios") devices.ios = true;
      else if (m.lastSeenVia === "android") devices.android = true;
      else if (m.lastSeenVia === "web") devices.web = true;
      for (const s of m.pushSubscriptions) {
        if (s.platform === "ios") devices.ios = true;
        else if (s.platform === "android") devices.android = true;
        else devices.web = true;
      }
    }

    if (!c.isTest) {
      const href = `/superadmin/company/${c.id}`;
      const push = (key: string, label: string, tone: Tone, detail = "") =>
        attention.push({ key: `${c.id}:${key}`, label, detail: detail || c.name, tone, href });
      if (status.key === "pending") push("pending", "Pending review", "warn", `${c.name} — approve or reject on Sign-ups`);
      if (status.key === "kyc-action") push("kyc", "Underwriter needs more info", "warn");
      if (status.key === "kyc-rejected") push("kyc", "KYC rejected", "bad");
      if (c.messagingRegistration?.status === "REJECTED") push("texting", "Texting registration rejected", "bad");
      if (status.key === "suspended") push("suspended", "Suspended", "bad");
      if (atlas.level === "locked") push("atlas", atlas.reason === "plan-spent" ? "Atlas plan tokens spent" : "Atlas free tier spent this month", "warn");
      if (c.lineReleaseAt) push("line", "Business line release scheduled", "warn", `${c.name} — ${c.lineReleaseAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    }

    const p = paymentsBy.get(c.id);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      industry: c.industry,
      place: [c.city, c.state].filter(Boolean).join(", ") || null,
      createdAt: c.createdAt.toISOString(),
      isTest: c.isTest,
      status,
      presence,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      lastSeen: relativeSeen(lastSeenAt, now),
      team: { total: c.users.length, online },
      clients: { total: c._count.contacts, added: addedBy.get(c.id) ?? 0 },
      activity: {
        jobs: jobsBy.get(c.id) ?? 0,
        quotes: quotesBy.get(c.id) ?? 0,
        invoices: invoicesBy.get(c.id) ?? 0,
        payments: p?._count._all ?? 0,
      },
      collectedCents: Math.round(Number(p?._sum.amount ?? 0) * 100),
      costCents: ai + comms + storageCost + processing,
      cost,
      chips,
      devices,
      referralSource: c.referralSource,
    };
  });

  // Platform-wide watch items (not tied to one account).
  const cap = (n: number, max: number, what: string) => {
    if (max > 0 && n >= max * 0.8)
      attention.push({
        key: `mapbox:${what}`,
        label: `Mapbox ${what} at ${Math.round((n / max) * 100)}% of the month's cap`,
        detail: "Route Manager falls back to estimates at the cap",
        tone: n >= max ? "bad" : "warn",
        href: "/superadmin/profitability",
      });
  };
  cap(mapbox.geocodeCalls, mapbox.geocodeCap, "geocodes");
  cap(mapbox.matrixElements, mapbox.matrixCap, "matrix");
  cap(mapbox.directionsCalls, mapbox.directionsCap, "directions");

  const live = rows.filter((r) => !r.isTest);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const stats = {
    live: live.filter((r) => r.status.key !== "suspended").length,
    online: live.reduce((n, r) => n + r.team.online, 0),
    active7d: live.filter((r) => r.lastSeenAt && now.getTime() - new Date(r.lastSeenAt).getTime() <= 7 * DAY).length,
    newThisMonth: live.filter((r) => new Date(r.createdAt) >= monthStart).length,
    pending,
    openFeedback,
  };

  // Twelve weekly buckets ending now: accounts opened that week, and the
  // running total at the week's end. The last bucket is the current week.
  const growth: GrowthWeek[] = [];
  const created = live.map((r) => new Date(r.createdAt).getTime());
  for (let i = 11; i >= 0; i--) {
    const end = now.getTime() - i * 7 * DAY;
    const start = end - 7 * DAY;
    growth.push({
      label: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      created: created.filter((t) => t > start && t <= end).length,
      total: created.filter((t) => t <= end).length,
    });
  }

  onlinePeople.sort((a, b) => Number(a.isTest) - Number(b.isTest) || b.seenAt.localeCompare(a.seenAt));
  return { days, rows, stats, attention, growth, online: onlinePeople };
}
