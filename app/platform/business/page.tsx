import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Map, Timer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { entryMs, formatDuration } from "@/lib/time-entries";

export const metadata: Metadata = { title: "Business" };

/**
 * Business hub (owners/admins): one nav entry fanning out to the
 * running-the-company surfaces — Insights, Team Map, Timesheets. Each card
 * carries a small live stat so the page is a glance, not just a menu.
 */
export default async function BusinessPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const now = new Date();
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [onClock, weekEntries, monthPayments] = await Promise.all([
    prisma.timeEntry.count({ where: { companyId, endedAt: null } }),
    prisma.timeEntry.findMany({
      where: { companyId, startedAt: { gte: startOfWeek } },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.payment.aggregate({
      where: { companyId, paidAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
  ]);
  const weekMs = weekEntries.reduce((s, e) => s + entryMs(e, now), 0);
  const collected = Number(monthPayments._sum.amount ?? 0);

  const cards = [
    {
      href: "/app/insights",
      icon: BarChart3,
      tint: "#6366F1",
      title: "Insights",
      body: "Revenue, lead sources, and how the business is performing.",
      stat: `$${collected.toLocaleString("en-US", { maximumFractionDigits: 0 })} collected this month`,
    },
    {
      href: "/app/team-map",
      icon: Map,
      tint: "#16A34A",
      title: "Team Map",
      body: "Where your clocked-in team is working right now.",
      stat:
        onClock === 0
          ? "Nobody on the clock"
          : `${onClock} ${onClock === 1 ? "person" : "people"} on the clock`,
    },
    {
      href: "/app/timesheets",
      icon: Timer,
      tint: "#F59E0B",
      title: "Timesheets",
      body: "Hours by team member, with edits for missed punches.",
      stat: `${formatDuration(weekMs)} logged this week`,
    },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-gray-900 mb-1">Business</h1>
      <p className="text-sm text-gray-500 mb-6">The view from the office.</p>

      <div className="grid sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card-ledger group p-5 transition-shadow hover:shadow-md"
          >
            <span
              className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${c.tint}1A`, color: c.tint }}
            >
              <c.icon size={17} />
            </span>
            <p className="font-display font-bold text-gray-900">{c.title}</p>
            <p className="mt-1 text-xs text-gray-500">{c.body}</p>
            <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-gray-700">
              {c.stat}
              <ArrowRight
                size={11}
                className="text-green-600 transition-transform group-hover:translate-x-0.5"
              />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
