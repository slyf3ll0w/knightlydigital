import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { prisma } from "@/lib/db";
import { isManager, requirePageActor } from "@/lib/permissions";
import { localDayParts } from "@/lib/booking-engine";
import { featureAllowedFor } from "@/lib/plan-gate";
import { PLANS } from "@/lib/plans";
import RouteMapClient from "./RouteMapClient";

export const metadata: Metadata = { title: "Route Map" };

/**
 * Route Manager — the schedule Day view on a map. Every role that can see
 * the schedule can see its routes (techs: their own stops only, enforced by
 * jobScope in the API); optimizing/reordering follows the job PATCH rules —
 * managers + Sales/Tech combo for anyone, techs for their own day, sales not
 * at all. Part of the Pro plan: without it (once PLAN_GATING is live) the
 * page is a short note, not a broken map.
 */
export default async function RouteMapPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; team?: string }>;
}) {
  const actor = await requirePageActor();
  const canFilterTeam = isManager(actor.role) || actor.role === "USER";

  if (!(await featureAllowedFor(actor.companyId, "routes"))) {
    const pro = PLANS.SHOP;
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
          <MapPin size={22} />
        </span>
        <h1 className="text-lg font-bold text-gray-900">Route Manager is part of {pro.name}</h1>
        <p className="mt-2 text-sm text-gray-600">
          Every stop on a map, drive times between them, one-tap route optimizing, and Find a Time when you
          book. {pro.name} also includes {pro.includes.slice(0, 3).map((s) => s.toLowerCase()).join(", ")} and more.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link href="/pricing" className="btn-primary">
            See plans
          </Link>
          <Link href="/app/schedule" className="rounded-[10px] btn-tool-line bg-white px-3 py-2 text-sm font-medium text-gray-700">
            Back to the schedule
          </Link>
        </div>
      </div>
    );
  }

  const { date, team } = await searchParams;
  const dateParam =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(`${date}T12:00:00Z`).getTime()) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
      ? date
      : null;
  // Default day = "today" on the company's clock, not the server's
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true, lat: true, lng: true },
  });
  const timezone = company?.timezone || "America/Chicago";
  const { y, m, d } = localDayParts(timezone, new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${y}-${pad(m)}-${pad(d)}`;
  const dateStr = dateParam ?? todayStr;

  // Everyone, including deactivated members: a stop whose only assignee left
  // the company still belongs on the day (the calendar shows it) — it lands
  // under their name, marked inactive, so it can be handed on.
  const users = canFilterTeam
    ? await prisma.user.findMany({
        where: { companyId: actor.companyId },
        select: { id: true, name: true, role: true, isActive: true },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      })
    : [];

  return (
    <RouteMapClient
      date={dateStr}
      today={todayStr}
      timezone={timezone}
      team={canFilterTeam ? (team ?? "") : ""}
      users={users}
      meId={actor.id}
      meName={actor.name}
      canDispatch={canFilterTeam}
      canOptimize={actor.role !== "SALES"}
      canSeeTeam={isManager(actor.role)}
      home={typeof company?.lat === "number" && typeof company?.lng === "number" ? { lat: company.lat, lng: company.lng } : null}
    />
  );
}
