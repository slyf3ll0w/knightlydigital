import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Who is on an appointment (David 2026-10-06: an estimate can take two
 * people). `Appointment.assignedToId` stays the lead person — every older
 * reader (reminders, booking, Atlas, automations) keeps working off it — and
 * everyone else sits in `AppointmentAssignee` rows. Readers that ask "is this
 * person busy / is it theirs" use the where-helpers below so the extras count
 * as much as the lead.
 */

/** Appointments this person is on — lead or extra. */
export function apptForUser(userId: string): Prisma.AppointmentWhereInput {
  return { OR: [{ assignedToId: userId }, { extraAssignees: { some: { userId } } }] };
}

/** Appointments any of these people are on. */
export function apptForUsers(userIds: string[]): Prisma.AppointmentWhereInput {
  return { OR: [{ assignedToId: { in: userIds } }, { extraAssignees: { some: { userId: { in: userIds } } } }] };
}

/** Select fragment for reading everyone on a row. */
export const peopleSelect = {
  assignedToId: true,
  extraAssignees: { select: { userId: true } },
} as const;

/** Lead first, then the extras — no duplicates. */
export function peopleOf(appt: { assignedToId: string | null; extraAssignees?: { userId: string }[] | null }): string[] {
  const ids: string[] = [];
  if (appt.assignedToId) ids.push(appt.assignedToId);
  for (const e of appt.extraAssignees ?? []) if (!ids.includes(e.userId)) ids.push(e.userId);
  return ids;
}

/** Clean a body's `assigneeIds` (or the old single `assignedToId`) into a unique list. */
export function requestedPeople(body: { assigneeIds?: unknown; assignedToId?: unknown }): string[] | undefined {
  if (Array.isArray(body.assigneeIds)) {
    const out: string[] = [];
    for (const v of body.assigneeIds) if (typeof v === "string" && v && !out.includes(v)) out.push(v);
    return out.slice(0, 10);
  }
  if (body.assignedToId !== undefined) return body.assignedToId ? [String(body.assignedToId)] : [];
  return undefined;
}

/**
 * Every id must be an active member of the company who can open
 * appointments (techs can't — the pages need canSell, so one on them would
 * never be seen). Returns the bad case's message, or null.
 */
export async function checkPeople(companyId: string, ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const ok = await prisma.user.count({
    where: { id: { in: ids }, companyId, isActive: true, role: { not: "TECH" } },
  });
  return ok === ids.length
    ? null
    : "Appointments can only be assigned to team members who handle sales (not techs).";
}

/** Replace the extras so the appointment is on exactly `ids` (lead = ids[0]). */
export async function setExtraPeople(appointmentId: string, ids: string[]): Promise<void> {
  const extras = ids.slice(1);
  await prisma.$transaction([
    prisma.appointmentAssignee.deleteMany({
      where: { appointmentId, ...(extras.length ? { userId: { notIn: extras } } : {}) },
    }),
    ...(extras.length
      ? [
          prisma.appointmentAssignee.createMany({
            data: extras.map((userId) => ({ appointmentId, userId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}
