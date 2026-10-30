import { Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { loyaltyForContact } from "@/lib/loyalty";
import { accrualRuleLabel, rewardTierLabel } from "@/lib/square-products";
import JoinRewardsButton from "./JoinRewardsButton";

/**
 * Client hub: the business's rewards program and the client's points
 * (2026-10-30). A client with a mobile number who hasn't joined sees one
 * button; a member sees their points and what each reward takes. Nothing
 * renders for a business without an active Square Loyalty program. Streamed
 * under Suspense — it reads Square.
 */
export default async function RewardsCard({ token }: { token: string }) {
  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: { id: true, companyId: true, company: { select: { name: true, squareConnection: { select: { loyaltyStatus: true, scopes: true } } } } },
  });
  const conn = contact?.company.squareConnection;
  if (!contact || !conn || conn.loyaltyStatus !== "ACTIVE" || !conn.scopes.includes("LOYALTY_WRITE")) return null;
  const loyalty = await loyaltyForContact(contact.companyId, contact.id).catch(() => null);
  if (!loyalty || (!loyalty.account && !loyalty.canJoin)) return null;
  const { program, account } = loyalty;

  return (
    <div className="anim-portal anim-delay-2 card-ledger overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Star size={15} className="text-gray-400" />
        <h2 className="font-semibold text-gray-900 text-sm">Rewards</h2>
      </div>
      <div className="px-4 py-3">
        {account ? (
          <>
            <p className="numeral-ledger text-2xl font-semibold text-gray-900">
              {account.balance} <span className="text-sm font-normal text-gray-500">{account.balance === 1 ? program.one : program.other}</span>
            </p>
            {program.accrual[0] && <p className="mt-1 text-xs text-gray-500">You earn {accrualRuleLabel(program.accrual[0], program)} with {contact.company.name}.</p>}
            {program.tiers.length > 0 && (
              <ul className="mt-3 divide-y divide-gray-50 rounded-lg border border-gray-100">
                {program.tiers.map((t) => {
                  const can = account.balance >= t.points;
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className={can ? "text-gray-900" : "text-gray-500"}>
                        {t.name} <span className="text-xs text-gray-500">· {rewardTierLabel(t)}</span>
                      </span>
                      <span className={`numeral-ledger text-xs ${can ? "font-semibold text-green-700" : "text-gray-400"}`}>
                        {t.points} {t.points === 1 ? program.one : program.other}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-xs text-gray-500">Ask {contact.company.name} to put a reward on your next invoice.</p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              {contact.company.name} has a rewards program{program.accrual[0] ? ` — ${accrualRuleLabel(program.accrual[0], program)}` : ""}. Join with the mobile number on your account.
            </p>
            <JoinRewardsButton token={token} words={{ one: program.one, other: program.other }} />
          </div>
        )}
      </div>
    </div>
  );
}
