import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, contactScope } from "@/lib/permissions";
import { tapToPayOffer } from "@/lib/tap-to-pay";
import RequestPaymentForm from "./RequestPaymentForm";

/**
 * Request payment — the quick charge. One amount, what it is for, an
 * optional client; the result is a live pay link to text, email, copy or
 * have scanned, and (in the phone app) a Tap to Pay button for the client
 * standing right there. Plan: docs/plans/checkout-tap-to-pay-2026-10-22.md.
 */
export default async function RequestPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const { contactId } = await searchParams;

  const [contacts, tapToPay] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId: actor.companyId, ...contactScope(actor), status: { in: ["LEAD", "ACTIVE"] }, placeholder: false },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    tapToPayOffer(actor),
  ]);

  return (
    <RequestPaymentForm
      contacts={contacts}
      initialContactId={contactId && contacts.some((c) => c.id === contactId) ? contactId : ""}
      tapToPay={tapToPay}
    />
  );
}
