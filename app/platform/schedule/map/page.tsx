import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isManager, requirePageActor } from "@/lib/permissions";
import { localDayParts } from "@/lib/booking-engine";
import RouteMapClient from "./RouteMapClient";

export const metadata: Metadata = { title: "Route Map" };

/**
 * Route Manager — the schedule Day view on a map. Every role that can see
 * the schedule can see its routes (techs: their own stops only, enforced by
 * jobScope in the API); optimizing/reordering follows the job PATCH rules —
 * managers + Sales/Tech combo for anyone, techs for their own day, sales not
 * at all.
 */
export default async function RouteMapPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; team?: string }>;
}) {
  const actor = await requirePageActor();
  const canFilterTeam = isManager(actor.role) || actor.role === "USER";

  const { date, team } = await searchParams;
  const dateParam = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  // Default day = "today" on the company's clock, not the server's
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true },
  });
  const { y, m, d } = localDayParts(company?.timezone || "America/Chicago", new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = dateParam ?? `${y}-${pad(m)}-${pad(d)}`;

  const users = canFilterTeam
    ? await prisma.user.findMany({
        where: { companyId: actor.companyId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <RouteMapClient
      date={dateStr}
      team={canFilterTeam ? (team ?? "") : ""}
      users={users}
      meId={actor.id}
      meName={actor.name}
      canDispatch={canFilterTeam}
      canOptimize={actor.role !== "SALES"}
    />
  );
}
