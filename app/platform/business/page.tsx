import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Map, Receipt, Timer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { entryMs, formatDuration } from "@/lib/time-entries";
import { startOfMonthIn, startOfWeekIn } from "@/lib/timezone";
import PageTitle from "@/components/PageTitle";
import { InfoTip } from "@/components/ds";

export const metadata: Metadata = { title: "Overview" };

/**
 * Business hub (owners/admins): one nav entry fanning out to the
 * running-the-company surfaces — Insights, Team Map, Timesheets. Each card
 * carries a small live stat so the page is a glance, not just a menu.
 */
export default async function BusinessPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  // "This week" / "this month" on the company's calendar, not the UTC box.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";
  const now = new Date();
  const startOfWeek = startOfWeekIn(tz, now);
  const startOfMonth = startOfMonthIn(tz, now);

  const [onClock, weekEntries, monthPayments, monthExpenses] = await Promise.all([
    prisma.timeEntry.count({ where: { companyId, endedAt: null } }),
    prisma.timeEntry.findMany({
      where: { companyId, startedAt: { gte: startOfWeek } },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.payment.aggregate({
      where: { companyId, paidAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { companyId, incurredAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
  ]);
  const weekMs = weekEntries.reduce((s, e) => s + entryMs(e, now), 0);
  const collected = Number(monthPayments._sum.amount ?? 0);
  const spent = Number(monthExpenses._sum.amount ?? 0);

  const cards = [
    {
      href: "/app/insights",
      icon: BarChart3,
      title: "Insights",
      body: "Revenue, lead sources, and how the business is performing.",
      stat: `$${collected.toLocaleString("en-US", { maximumFractionDigits: 0 })} collected this month`,
    },
    {
      href: "/app/team-map",
      icon: Map,
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
      title: "Timesheets",
      body: "Hours by team member, with edits for missed punches.",
      stat: `${formatDuration(weekMs)} logged this week`,
    },
    {
      href: "/app/expenses",
      icon: Receipt,
      title: "Expenses",
      body: "Materials, fuel, software — log costs to see real profit.",
      stat: `$${spent.toLocaleString("en-US", { maximumFractionDigits: 0 })} spent this month`,
    },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageTitle className="mb-6" info="The view from the office.">
        Business
      </PageTitle>

      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="ds-card ds-card-link group p-5"
          >
            <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
              <c.icon size={17} />
            </span>
            <p className="font-display flex items-center gap-1 font-bold text-[color:var(--ds-ink)]">
              {c.title}
              <InfoTip>{c.body}</InfoTip>
            </p>
            <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-[color:var(--ds-ink-2)]">
              {c.stat}
              <ArrowRight
                size={11}
                className="text-[color:var(--ds-primary)] transition-transform group-hover:translate-x-0.5"
              />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
