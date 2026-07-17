import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Timer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { entryMs, formatDuration, mapsHref } from "@/lib/time-entries";
import EntryActions from "./EntryActions";
import AddEntry from "./AddEntry";

/**
 * Weekly timesheets. Techs see their own hours; owners/admins see the whole
 * team and can fix entries (forgotten clock-outs, paper timesheets). Week
 * runs Sunday–Saturday in the company timezone (server TZ, like the
 * schedule page).
 */
export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const actor = await requirePageActor((a) => a.role !== "SALES");
  const manager = isManager(actor.role);
  const { week } = await searchParams;

  // Resolve the Sunday of the requested week (default: this week)
  const anchor = week ? new Date(`${week}T12:00:00`) : new Date();
  const weekStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const now = new Date();

  const toParam = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const prevWeek = toParam(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = toParam(new Date(weekStart.getTime() + 7 * 86400000));
  const isCurrentWeek = now >= weekStart && now < weekEnd;

  const [entries, teamUsers, recentJobs] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        companyId: actor.companyId,
        ...(manager ? {} : { userId: actor.id }),
        // entries that started this week, plus anything still running
        OR: [{ startedAt: { gte: weekStart, lt: weekEnd } }, { endedAt: null }],
      },
      include: {
        user: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    manager
      ? prisma.user.findMany({
          where: { companyId: actor.companyId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    manager
      ? prisma.job.findMany({
          where: { companyId: actor.companyId, status: { in: ["ACTIVE", "REQUIRES_INVOICING"] } },
          select: { id: true, title: true, jobNumber: true },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  // Group by team member
  const byUser = new Map<string, { name: string; entries: typeof entries }>();
  for (const e of entries) {
    const g = byUser.get(e.userId) ?? { name: e.user.name, entries: [] as typeof entries };
    g.entries.push(e);
    byUser.set(e.userId, g);
  }
  const groups = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  const grandTotal = entries.reduce((s, e) => s + entryMs(e, now), 0);

  const fmtDay = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {manager ? "Hours across your team" : "Your hours"} · week of{" "}
            {weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/app/timesheets?week=${prevWeek}`}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </Link>
          {!isCurrentWeek && (
            <Link
              href="/app/timesheets"
              className="px-3 py-1.5 text-xs font-semibold text-green-700 rounded-lg hover:bg-gray-100"
            >
              This week
            </Link>
          )}
          <Link
            href={`/app/timesheets?week=${nextWeek}`}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {manager && (
        <AddEntry
          users={teamUsers}
          jobs={recentJobs.map((j) => ({ id: j.id, label: `#${j.jobNumber} — ${j.title}` }))}
        />
      )}

      {groups.length === 0 ? (
        <div className="card-ledger flex items-center gap-3 px-5 py-8 justify-center">
          <Timer size={18} className="text-gray-400" />
          <p className="text-sm text-gray-500">
            No time logged this week. Clock in from any job page to start tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const total = g.entries.reduce((s, e) => s + entryMs(e, now), 0);
            return (
              <div key={g.name} className="card-ledger overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">{g.name}</h2>
                  <span className="numeral-ledger text-sm font-semibold text-gray-900 tabular-nums">
                    {formatDuration(total)}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {g.entries.map((e) => {
                    const open = !e.endedAt;
                    return (
                      <div key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <span className="w-24 shrink-0 text-xs font-medium text-gray-500">
                          {fmtDay(e.startedAt)}
                        </span>
                        <div className="flex-1 min-w-0">
                          {e.job ? (
                            <Link
                              href={`/app/jobs/${e.job.id}`}
                              className="text-gray-900 font-medium hover:text-green-700 truncate block"
                            >
                              {e.job.title}
                            </Link>
                          ) : (
                            <span className="text-gray-500">No job</span>
                          )}
                          <p className="text-xs text-gray-500">
                            {fmtTime(e.startedAt)}
                            {e.endedAt ? ` – ${fmtTime(e.endedAt)}` : ""}
                            {e.source === "MANUAL" && (
                              <span className="ml-1.5 stamp text-gray-500">Manual</span>
                            )}
                            {e.source === "CLOCK" && e.editedById && (
                              <span className="ml-1.5 stamp text-gray-500">Edited</span>
                            )}
                            {e.note && <span className="ml-1.5 text-gray-400">· {e.note}</span>}
                          </p>
                        </div>
                        {e.startLat != null && e.startLng != null && (
                          <a
                            href={mapsHref(e.startLat, e.startLng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Clock-in location"
                            className="text-gray-400 hover:text-green-700 shrink-0"
                          >
                            <MapPin size={14} />
                          </a>
                        )}
                        <span
                          className={`numeral-ledger w-16 shrink-0 text-right font-semibold tabular-nums ${
                            open ? "text-green-700" : "text-gray-900"
                          }`}
                        >
                          {open ? formatDuration(entryMs(e, now)) : formatDuration(entryMs(e))}
                        </span>
                        {open && (
                          <span className="relative flex h-2 w-2 shrink-0" title="On the clock">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                          </span>
                        )}
                        {manager && (
                          <EntryActions
                            entry={{
                              id: e.id,
                              startedAt: e.startedAt.toISOString(),
                              endedAt: e.endedAt ? e.endedAt.toISOString() : null,
                              note: e.note,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {manager && groups.length > 1 && (
            <div className="flex justify-end px-1 text-sm">
              <span className="text-gray-500 mr-2">Team total</span>
              <span className="numeral-ledger font-semibold text-gray-900 tabular-nums">
                {formatDuration(grandTotal)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
