import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CalendarDays } from "lucide-react";
import { arrivalTimeLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import RescheduleButton from "./RescheduleButton";

/**
 * Client hub: every upcoming visit — scheduled jobs and appointments — with
 * arrival windows and a "request reschedule" action that lands in the message
 * thread. Fixes the old blind spot where appointments were invisible to the
 * client and rescheduling meant digging up an email address.
 */
export default async function HubVisitsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      id: true,
      company: { select: { timezone: true, arrivalWindowMinutes: true } },
      jobs: {
        where: { status: "ACTIVE", scheduledAt: { gte: startOfDay } },
        orderBy: { scheduledAt: "asc" },
        take: 20,
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          scheduledAnytime: true,
          arrivalWindowMinutes: true,
          address: true,
        },
      },
      appointments: {
        where: { status: "SCHEDULED", scheduledAt: { gte: startOfDay } },
        orderBy: { scheduledAt: "asc" },
        take: 20,
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          scheduledEnd: true,
          scheduledAnytime: true,
          tentative: true,
          address: true,
          type: true,
        },
      },
    },
  });
  if (!contact) notFound();

  const tz = contact.company.timezone;
  const windowMin = contact.company.arrivalWindowMinutes;

  type Row = {
    kind: "job" | "appointment";
    id: string;
    title: string;
    when: Date | null;
    timeLabel: string;
    address: string | null;
    tentative: boolean;
  };

  const dayLabel = (d: Date) =>
    d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: tz,
    });

  const rows: Row[] = [
    ...contact.jobs.map((j): Row => {
      const d = j.scheduledAt;
      return {
        kind: "job",
        id: j.id,
        title: j.title,
        when: d,
        timeLabel: !d
          ? "To be scheduled"
          : j.scheduledAnytime
            ? `${dayLabel(d)} · anytime that day`
            : `${dayLabel(d)} · arriving ${arrivalTimeLabel(tz, d, resolveArrivalWindowMinutes(j.arrivalWindowMinutes, windowMin))}`,
        address: j.address,
        tentative: false,
      };
    }),
    ...contact.appointments.map((a): Row => {
      const d = a.scheduledAt;
      return {
        kind: "appointment",
        id: a.id,
        title: a.title,
        when: d,
        timeLabel: a.scheduledAnytime
          ? `${dayLabel(d)} · anytime that day`
          : a.type === "IN_PERSON"
            ? `${dayLabel(d)} · arriving ${arrivalTimeLabel(tz, d, windowMin)}`
            : `${dayLabel(d)} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}`,
        address: a.address,
        tentative: a.tentative,
      };
    }),
  ].sort((x, y) => (x.when?.getTime() ?? Infinity) - (y.when?.getTime() ?? Infinity));

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Upcoming visits</h2>
      {rows.length === 0 ? (
        <div className="card-ledger py-14 text-center">
          <CalendarDays size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nothing scheduled right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="card-ledger p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                    {r.tentative && (
                      <span className="stamp text-amber-700">Awaiting confirmation</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{r.timeLabel}</p>
                  {r.address && <p className="text-xs text-gray-400 mt-0.5">{r.address}</p>}
                </div>
                <RescheduleButton token={token} kind={r.kind} id={r.id} title={r.title} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-gray-400">
        Need a different time? Use &ldquo;Request reschedule&rdquo; and we&apos;ll get back to
        you — nothing changes until it&apos;s confirmed.
      </p>
    </div>
  );
}
