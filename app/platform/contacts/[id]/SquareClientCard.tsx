import Link from "next/link";
import { Gift, Star } from "lucide-react";
import { prisma } from "@/lib/db";
import SectionHeader from "@/components/SectionHeader";
import { money } from "@/lib/statuses";
import { loyaltyForContact } from "@/lib/loyalty";
import { ganTail, listSquareGiftCards, rewardTierLabel } from "@/lib/square-products";
import { giftCardState } from "@/app/platform/payments/square/labels";
import { Chip } from "@/components/ds";
import RewardsActions from "./RewardsActions";

/**
 * The client's standing in the business's Square products (2026-10-30):
 * their rewards points and the program's rewards (enroll / adjust from
 * here), and the gift cards linked to them. Renders nothing for a company
 * without Square, without the scopes, or without a program and no cards —
 * the contact page stays as it was. Streamed under Suspense: it reads Square.
 */
export default async function SquareClientCard({ contactId, companyId, canManage }: { contactId: string; companyId: string; canManage: boolean }) {
  const conn = await prisma.squareConnection.findUnique({ where: { companyId }, select: { scopes: true, loyaltyStatus: true } });
  if (!conn) return null;
  const hasLoyalty = conn.scopes.includes("LOYALTY_READ");
  const hasGift = conn.scopes.includes("GIFTCARDS_READ");
  if (!hasLoyalty && !hasGift) return null;
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { squareCustomerId: true, phone: true } });
  if (!contact) return null;

  const [loyalty, cards] = await Promise.all([
    hasLoyalty && conn.loyaltyStatus !== "NONE" && conn.loyaltyStatus !== "UNKNOWN" ? loyaltyForContact(companyId, contactId).catch(() => null) : Promise.resolve(null),
    hasGift && contact.squareCustomerId ? listSquareGiftCards(companyId, { customerId: contact.squareCustomerId, limit: 20 }) : Promise.resolve(null),
  ]);
  const giftCards = cards?.ok ? cards.data.giftCards.filter((c) => c.state === "ACTIVE" || c.state === "PENDING") : [];
  if (!loyalty && giftCards.length === 0) return null;

  return (
    <div className="card-tool p-5 lg:p-6">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <Star size={15} className="text-gray-400" /> Rewards and gift cards
          </span>
        }
      />
      {loyalty && (
        <div className="mt-3">
          {loyalty.account ? (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500">{loyalty.program.other}</p>
                <p className="numeral-ledger text-2xl font-semibold text-gray-900">
                  {loyalty.account.balance} <span className="text-sm font-normal text-gray-500">· {loyalty.account.lifetimePoints} lifetime</span>
                </p>
              </div>
              <RewardsActions contactId={contactId} enrolled canManage={canManage} words={{ one: loyalty.program.one, other: loyalty.program.other }} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600">
                Not in your rewards program yet.
                {!loyalty.canJoin && <span className="text-gray-500"> Add a mobile number to enroll them.</span>}
              </p>
              <RewardsActions contactId={contactId} enrolled={false} canManage={canManage && loyalty.canJoin} words={{ one: loyalty.program.one, other: loyalty.program.other }} />
            </div>
          )}
          {loyalty.account && loyalty.program.tiers.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
              {loyalty.program.tiers.map((t) => {
                const can = loyalty.account!.balance >= t.points;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className={can ? "text-gray-900" : "text-gray-400"}>
                      {t.name} <span className="text-xs text-gray-500">· {rewardTierLabel(t)}</span>
                    </span>
                    <span className={`numeral-ledger text-xs ${can ? "font-semibold text-[color:var(--ds-good)]" : "text-gray-400"}`}>
                      {t.points} {t.points === 1 ? loyalty.program.one : loyalty.program.other}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {loyalty.account && <p className="mt-2 text-xs text-gray-500">Spend a reward from an unpaid invoice&apos;s ⋯ menu → Use a reward.</p>}
        </div>
      )}
      {giftCards.length > 0 && (
        <div className={loyalty ? "mt-4 border-t border-gray-100 pt-4" : "mt-3"}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Gift size={12} /> Gift cards
          </p>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
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
      )}
    </div>
  );
}
