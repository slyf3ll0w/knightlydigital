import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { arrivalTimeLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import RescheduleButton from "./RescheduleButton";
import { HubEmpty, HubGroup, HubPageHead, HubStatus } from "../HubKit";

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
          arrivalWindowMinutes: true,
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
            ? `${dayLabel(d)} · arriving ${arrivalTimeLabel(tz, d, resolveArrivalWindowMinutes(a.arrivalWindowMinutes, windowMin))}`
            : `${dayLabel(d)} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}`,
        address: a.address,
        tentative: a.tentative,
      };
    }),
  ].sort((x, y) => (x.when?.getTime() ?? Infinity) - (y.when?.getTime() ?? Infinity));

  const monthOf = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: tz });
  const dayOf = (d: Date) => d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz });
  return (
    <div>
      <HubPageHead
        title="Visits"
        note={rows.length === 0 ? "Nothing scheduled right now" : rows.length === 1 ? "1 coming up" : `${rows.length} coming up`}
      />
      {rows.length === 0 ? (
        <HubEmpty title="Nothing scheduled right now" body="Confirmed visits and appointments show up here with their arrival windows." />
      ) : (
        <HubGroup flush>
          {rows.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="hk-row has-lead hk-visit">
              {r.when ? (
                <span className="hk-lead">
                  <span className="hk-date" aria-hidden>
                    <span className="hk-date-m">{monthOf(r.when)}</span>
                    <span className="hk-date-d">{dayOf(r.when)}</span>
                  </span>
                </span>
              ) : null}
              <span className="hk-row-text">
                <span className="hk-row-title">{r.title}</span>
                <span className="hk-row-sub">{r.timeLabel}</span>
                {r.address ? <span className="hk-row-sub">{r.address}</span> : null}
                {r.tentative ? (
                  <span className="mt-1 block">
                    <HubStatus tone="warn" label="Awaiting confirmation" />
                  </span>
                ) : null}
              </span>
              <span className="hk-row-end">
                <RescheduleButton token={token} kind={r.kind} id={r.id} title={r.title} />
              </span>
            </div>
          ))}
        </HubGroup>
      )}
      <p className="mt-4 px-1 text-[13.5px] leading-snug text-[color:var(--hh-muted)]">
        Need a different time? Use &ldquo;Request reschedule&rdquo; and we&apos;ll get back to you — nothing changes until it&apos;s confirmed.
      </p>
    </div>
  );
}
