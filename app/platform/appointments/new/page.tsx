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
  searchParams: Promise<{ contactId?: string; requestId?: string; date?: string; title?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  // ?title= carries a typed title over from the job form's "sounds like an
  // appointment" nudge
  const { contactId, requestId, date, title } = await searchParams;

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
    // Techs can't open appointments (canSell), so they're never offered
    isManager(actor.role)
      ? prisma.user.findMany({
          where: { companyId, isActive: true, role: { not: "TECH" } },
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
      prefilledTitle={typeof title === "string" ? title.trim().slice(0, 120) : ""}
      prefilledDate={date ?? ""}
      intervalMinutes={resolveSlotInterval({
        companyIntervalMinutes: company?.schedulingIntervalMinutes,
      })}
      dayStartMinutes={earliestOpenMinutes(sanitizeBusinessHours(company?.businessHours))}
    />
  );
}
