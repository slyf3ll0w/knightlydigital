/**
 * One user's schedule as a flat list of calendar events — the single source
 * both calendar-sync renderers read (the .ics subscribe feed in lib/ics.ts
 * and the Google Calendar push in lib/google-calendar.ts). Design:
 * docs/plans/google-calendar-sync-2026-09-11.md.
 *
 * What counts as "their schedule": jobs they are assigned to, appointments
 * assigned to them, their personal time blocks, and company-wide blocks.
 * Nothing here is shown that the user can't already open in the app.
 */

import { prisma } from "@/lib/db";
import {
  toCalendarEventFromAppointment,
  toCalendarEventFromJob,
  toCalendarEventFromTimeBlock,
  type CalendarEvent,
} from "@/lib/calendar-event-shape";

export * from "@/lib/calendar-event-shape";

// ─── Loader ──────────────────────────────────────────────────────────────────

const jobSelect = {
  id: true,
  jobNumber: true,
  title: true,
  description: true,
  scheduledAt: true,
  scheduledEnd: true,
  scheduledAnytime: true,
  address: true,
  bookedOnlineAt: true,
  contact: { select: { firstName: true, lastName: true, phone: true, address: true } },
} as const;

const appointmentSelect = {
  id: true,
  title: true,
  type: true,
  scheduledAt: true,
  scheduledEnd: true,
  scheduledAnytime: true,
  tentative: true,
  address: true,
  meetingLink: true,
  notes: true,
  contact: { select: { firstName: true, lastName: true, phone: true, address: true } },
} as const;

const blockSelect = {
  id: true,
  userId: true,
  title: true,
  startAt: true,
  endAt: true,
  allDay: true,
  address: true,
} as const;

export type UserCalendarScope = {
  userId: string;
  companyId: string;
  tz: string;
};

/**
 * Who the feed/push is for. Null when the user is gone, inactive, or their
 * company is suspended — callers treat that as "no calendar".
 */
export async function resolveUserCalendarScope(userId: string): Promise<UserCalendarScope | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      companyId: true,
      company: { select: { timezone: true, suspendedAt: true } },
    },
  });
  if (!user || !user.isActive || !user.companyId || !user.company || user.company.suspendedAt) return null;
  return { userId: user.id, companyId: user.companyId, tz: user.company.timezone };
}

export async function loadUserCalendarEvents(
  scope: UserCalendarScope,
  window: { from: Date; to: Date }
): Promise<CalendarEvent[]> {
  const { userId, companyId, tz } = scope;
  const [jobs, appointments, blocks] = await Promise.all([
    prisma.job.findMany({
      where: {
        companyId,
        scheduledAt: { gte: window.from, lte: window.to },
        assignments: { some: { userId } },
      },
      select: jobSelect,
      orderBy: { scheduledAt: "asc" },
      take: 2000,
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        assignedToId: userId,
        status: { not: "CANCELLED" },
        scheduledAt: { gte: window.from, lte: window.to },
      },
      select: appointmentSelect,
      orderBy: { scheduledAt: "asc" },
      take: 2000,
    }),
    prisma.timeBlock.findMany({
      where: {
        companyId,
        OR: [{ userId }, { userId: null }],
        startAt: { lte: window.to },
        endAt: { gte: window.from },
      },
      select: blockSelect,
      orderBy: { startAt: "asc" },
      take: 2000,
    }),
  ]);

  const events: CalendarEvent[] = [];
  for (const j of jobs) {
    const ev = toCalendarEventFromJob(j, tz);
    if (ev) events.push(ev);
  }
  for (const a of appointments) events.push(toCalendarEventFromAppointment(a, tz));
  for (const b of blocks) events.push(toCalendarEventFromTimeBlock(b, tz));
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
}

/**
 * Re-resolve specific records for the Google reconcile: which of these are
 * still on this user's calendar? Missing ids = gone / cancelled / unscheduled
 * / no longer theirs → the pushed copy should be deleted.
 */
export async function loadCalendarEventsByIds(
  scope: UserCalendarScope,
  ids: { JOB: string[]; APPOINTMENT: string[]; BLOCK: string[] }
): Promise<CalendarEvent[]> {
  const { userId, companyId, tz } = scope;
  const [jobs, appointments, blocks] = await Promise.all([
    ids.JOB.length
      ? prisma.job.findMany({
          where: { id: { in: ids.JOB }, companyId, scheduledAt: { not: null }, assignments: { some: { userId } } },
          select: jobSelect,
        })
      : [],
    ids.APPOINTMENT.length
      ? prisma.appointment.findMany({
          where: { id: { in: ids.APPOINTMENT }, companyId, assignedToId: userId, status: { not: "CANCELLED" } },
          select: appointmentSelect,
        })
      : [],
    ids.BLOCK.length
      ? prisma.timeBlock.findMany({
          where: { id: { in: ids.BLOCK }, companyId, OR: [{ userId }, { userId: null }] },
          select: blockSelect,
        })
      : [],
  ]);
  const events: CalendarEvent[] = [];
  for (const j of jobs) {
    const ev = toCalendarEventFromJob(j, tz);
    if (ev) events.push(ev);
  }
  for (const a of appointments) events.push(toCalendarEventFromAppointment(a, tz));
  for (const b of blocks) events.push(toCalendarEventFromTimeBlock(b, tz));
  return events;
}
