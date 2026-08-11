import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager, jobScope } from "@/lib/permissions";
import JobEditForm from "./JobEditForm";

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor(
    (a) => isManager(a.role) || a.role === "USER"
  );
  const companyId = actor.companyId;

  const { id } = await params;
  const [job, workItems] = await Promise.all([
    prisma.job.findFirst({
      where: { id, companyId, ...jobScope(actor) },
      include: {
        contact: {
          select: {
            firstName: true,
            lastName: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            addresses: { orderBy: { createdAt: "asc" } },
          },
        },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!job) notFound();

  // Closed jobs are locked — reopen first (matches the invoice/quote rule)
  if (job.status === "ARCHIVED") redirect(`/app/jobs/${job.id}`);

  return (
    <JobEditForm
      workItems={JSON.parse(JSON.stringify(workItems))}
      job={{
        id: job.id,
        title: job.title,
        description: job.description ?? "",
        address: job.address ?? "",
        propertyId: job.propertyId ?? "",
        leadSource: job.leadSource ?? "",
        contactName: `${job.contact.firstName} ${job.contact.lastName}`,
        contactAddress: {
          address: job.contact.address,
          city: job.contact.city,
          state: job.contact.state,
          zip: job.contact.zip,
        },
        savedAddresses: job.contact.addresses.map((a) => ({
          id: a.id,
          label: a.label,
          address: a.address,
          city: a.city,
          state: a.state,
          zip: a.zip,
        })),
        lineItems: job.lineItems.map((li) => ({
          name: li.name,
          description: li.description ?? "",
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          unitCost: li.unitCost != null ? Number(li.unitCost) : null,
          workItemId: li.workItemId,
          recurringInterval: li.recurringInterval,
        })),
      }}
    />
  );
}
