import Link from "next/link";
import { Gift } from "lucide-react";
import { prisma } from "@/lib/db";
import SectionHeader from "@/components/SectionHeader";
import { money } from "@/lib/statuses";
import { ganTail, listSquareGiftCards } from "@/lib/square-products";
import { giftCardState } from "@/app/platform/payments/square/labels";
import { Chip } from "@/components/ds";

/**
 * The client's Square gift cards (2026-10-30): every card linked to them
 * with its state and balance, each a link to the Gift cards tab. Renders
 * nothing for a company without Square, without the scope, or for a client
 * with no cards — the contact page stays as it was. Streamed under
 * Suspense: it reads Square.
 */
export default async function SquareClientCard({ contactId, companyId }: { contactId: string; companyId: string }) {
  const conn = await prisma.squareConnection.findUnique({ where: { companyId }, select: { scopes: true } });
  if (!conn || !conn.scopes.includes("GIFTCARDS_READ")) return null;
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { squareCustomerId: true } });
  if (!contact?.squareCustomerId) return null;

  const cards = await listSquareGiftCards(companyId, { customerId: contact.squareCustomerId, limit: 20 });
  const giftCards = cards.ok ? cards.data.giftCards.filter((c) => c.state === "ACTIVE" || c.state === "PENDING") : [];
  if (giftCards.length === 0) return null;

  return (
    <div className="card-tool p-5 lg:p-6">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <Gift size={15} className="text-gray-400" /> Gift cards
          </span>
        }
      />
      <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
        {giftCards.map((c) => {
          const st = giftCardState(c.state);
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <Link prefetch={false} href={`/app/payments?tab=giftcards&giftcard=${encodeURIComponent(c.id)}`} className="numeral-ledger font-medium text-gray-900 hover:underline">
                {ganTail(c.gan)}
              </Link>
              <span className="flex items-center gap-2">
                <Chip tone={st.tone}>{st.label}</Chip>
                <span className="numeral-ledger font-semibold text-gray-900">{money(c.balanceCents / 100)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
