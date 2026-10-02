import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, contactScope, jobScope, appointmentScope } from "@/lib/permissions";
import InvoiceEditor from "./InvoiceEditor";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; contactId?: string; appointmentId?: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;

  const { jobId, contactId, appointmentId } = await searchParams;

  // Straight from an appointment (work done on the spot — no quote, no job):
  // the client and a subject come from it, the lines are typed here.
  const appointment = appointmentId
    ? await prisma.appointment.findFirst({
        where: { id: appointmentId, companyId, ...appointmentScope(actor) },
        select: { id: true, title: true, contactId: true, scheduledAt: true },
      })
    : null;

  const [contacts, workItems, company, job] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, ...contactScope(actor), status: { in: ["LEAD", "ACTIVE"] }, placeholder: false },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultTaxRate: true },
    }),
    // Job-linked invoices follow JOB visibility (a Sales + Tech member can
    // complete any job, so they can bill any job) — contact scope alone left
    // the prefill empty and the POST rejecting the client.
    jobId
      ? prisma.job.findFirst({
          where: { id: jobId, companyId, ...jobScope(actor) },
          include: {
            contact: true,
            lineItems: { orderBy: { sortOrder: "asc" } },
            quote: {
              include: {
                // Services the client opted out of on the quote must not
                // reappear on the bill when the quote is the prefill source
                lineItems: {
                  where: { OR: [{ isOptional: false }, { optedOut: false }] },
                  orderBy: { sortOrder: "asc" },
                },
              },
            },
          },
        })
      : null,
  ]);

  const defaultTaxRatePercent = company?.defaultTaxRate
    ? String(Math.round(Number(company.defaultTaxRate) * 100000) / 1000)
    : "";

  return (
    <InvoiceEditor
      contacts={contacts}
      workItems={JSON.parse(JSON.stringify(workItems))}
      prefillJob={job ? JSON.parse(JSON.stringify(job)) : null}
      prefillAppointment={
        appointment
          ? { id: appointment.id, title: appointment.title, contactId: appointment.contactId, scheduledAt: appointment.scheduledAt.toISOString() }
          : null
      }
      prefilledContactId={contactId ?? appointment?.contactId ?? ""}
      defaultTaxRatePercent={defaultTaxRatePercent}
    />
  );
}
