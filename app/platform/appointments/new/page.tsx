import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope, isManager } from "@/lib/permissions";
import { resolveSlotInterval } from "@/lib/scheduling";
import { earliestOpenMinutes, sanitizeBusinessHours } from "@/lib/business-hours";
import AppointmentForm from "./AppointmentForm";

export const metadata: Metadata = { title: "New Appointment" };

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string; requestId?: string; date?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { contactId, requestId, date } = await searchParams;

  const [contacts, users, request, company] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, ...contactScope(actor), status: { in: ["LEAD", "ACTIVE"] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        address: true,
        city: true,
        state: true,
        addresses: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    isManager(actor.role)
      ? prisma.user.findMany({
          where: { companyId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    requestId
      ? prisma.request.findFirst({
          where: { id: requestId, companyId, contact: contactScope(actor) },
          select: { id: true, title: true, contactId: true },
        })
      : Promise.resolve(null),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { schedulingIntervalMinutes: true, businessHours: true },
    }),
  ]);

  return (
    <AppointmentForm
      actorId={actor.id}
      contacts={contacts}
      users={users}
      prefilledContactId={request?.contactId ?? contactId ?? ""}
      requestId={request?.id ?? ""}
      requestTitle={request?.title ?? ""}
      prefilledDate={date ?? ""}
      intervalMinutes={resolveSlotInterval({
        companyIntervalMinutes: company?.schedulingIntervalMinutes,
      })}
      dayStartMinutes={earliestOpenMinutes(sanitizeBusinessHours(company?.businessHours))}
    />
  );
}
