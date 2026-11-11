import type { Contact, Prisma } from "@prisma/client";

/**
 * A public form matched a PLACEHOLDER contact — a number that texted or was
 * texted first, named after its digits and hidden from the client list and
 * pickers until someone names it. The form just named them: make the row a
 * real lead with what they typed, in place, so their message thread stays
 * attached. (Before, the form's name was thrown away and a card called
 * "(214) 555-0100" landed on the Leads board.) createdAt is reset: this is
 * their real "created" moment, the same rule as the thread's Save card, and
 * the callers' new-lead checks key on it.
 */
export async function namePlaceholder(
  tx: Prisma.TransactionClient,
  contact: Contact,
  typed: { firstName: string; lastName: string; email?: string | null; address?: string | null; leadSource?: string | null }
): Promise<Contact> {
  if (!contact.placeholder) return contact;
  return tx.contact.update({
    where: { id: contact.id },
    data: {
      placeholder: false,
      kind: "CLIENT",
      status: "LEAD",
      firstName: typed.firstName,
      lastName: typed.lastName,
      createdAt: new Date(),
      ...(!contact.email && typed.email ? { email: typed.email } : {}),
      ...(!contact.address && typed.address ? { address: typed.address } : {}),
      ...(!contact.leadSource && typed.leadSource ? { leadSource: typed.leadSource } : {}),
    },
  });
}
