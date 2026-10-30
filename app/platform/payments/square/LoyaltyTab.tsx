import Link from "next/link";
import { ArrowUpRight, ChevronRight, Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { Chip } from "@/components/ds";
import EmptyState from "@/components/EmptyState";
import { listLoyaltyMembers, loyaltyProgramFor } from "@/lib/loyalty";
import { accrualRuleLabel, rewardTierLabel } from "@/lib/square-products";
import { ReconnectCard, RuledLabel, SquareUnavailable, squareLink } from "./bits";
import LoyaltyActions from "./LoyaltyActions";

/**
 * Loyalty tab (Square, 2026-10-30): the seller's Square Loyalty program as
 * WorkBench sees it — how points are earned, the rewards, whether it is
 * active — and the members, matched to clients. Enroll a client here (or on
 * their page); points accrue on every payment they make; a reward is spent
 * on an invoice (⋯ → Use a reward). The program itself is made and priced
 * in the Square dashboard (a Square Loyalty subscription).
 */
export default async function LoyaltyTab({
  companyId,
  sandbox,
  cursor,
  canManage,
  canReconnect,
  missingScope,
}: {
  companyId: string;
  sandbox: boolean;
  cursor: string | null;
  canManage: boolean;
  canReconnect: boolean;
  missingScope: boolean;
}) {
  if (missingScope) return <ReconnectCard what="your loyalty program" canReconnect={canReconnect} />;
  const state = await loyaltyProgramFor(companyId, { withProgram: true });
  if (state.status === "UNKNOWN" && state.failure?.missingScopes) return <ReconnectCard what="your loyalty program" canReconnect={canReconnect} />;
  const dashboard = squareLink("loyalty", sandbox);

  if (!state.program) {
    return (
      <div className="mb-8">
        {state.failure && <SquareUnavailable failure={state.failure} what="your loyalty program" />}
        <div className="ds-card overflow-hidden">
          <EmptyState
            art="invoices"
            hue="var(--ds-primary)"
            title={state.status === "NONE" ? "No loyalty program yet" : "Couldn't read your program just now"}
            body={
              state.status === "NONE"
                ? "Square Loyalty is a Square subscription you set up in your Square dashboard: pick how clients earn points and what the rewards are. Once it's on, WorkBench enrolls clients, adds points on every payment, and spends rewards on invoices."
                : "Square didn't answer. Your program will show here once it does."
            }
            showPlusIcon={false}
          />
          <div className="border-t border-gray-100 px-5 py-4">
            <a href={dashboard} target="_blank" rel="noopener noreferrer" className="btn-primary">
              Set up loyalty in Square <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </div>
    );
  }

  const program = state.program;
  const active = program.status === "ACTIVE";
  const [members, contacts] = await Promise.all([
    active ? listLoyaltyMembers(companyId, cursor) : Promise.resolve({ members: [], cursor: null, failure: null }),
    canManage && active
      ? prisma.contact.findMany({
          where: { companyId, status: { in: ["LEAD", "ACTIVE"] }, placeholder: false },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 2000,
        })
      : Promise.resolve([]),
  ]);
  const orderTiers = program.tiers.filter((t) => t.scope === "ORDER");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Chip tone={active ? "good" : "warn"}>{active ? "Program on" : "Program paused"}</Chip>
          {state.checkedAt && <span className="text-xs text-gray-500">checked {state.checkedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
        </div>
        <LoyaltyActions canManage={canManage && active} contacts={contacts} words={{ one: program.one, other: program.other }} />
      </div>

      {!active && (
        <p className="mb-4 text-sm text-[color:var(--ds-warn)]">Square shows this program as inactive — check your Square Loyalty subscription. Points and rewards pause until it&apos;s back.</p>
      )}

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div>
          <RuledLabel info="The rule Square applies to every payment an enrolled client makes through WorkBench (and at the counter). Edit it in Square.">How {program.other} are earned</RuledLabel>
          <div className="ds-card overflow-hidden">
            <div className="divide-y divide-gray-100">
              {program.accrual.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">No earning rule yet — add one in Square.</p>}
              {program.accrual.map((r, i) => (
                <p key={i} className="flex items-center gap-2 px-4 py-3 text-sm text-gray-900">
                  <Star size={14} className="text-[color:var(--ds-warn)]" /> {accrualRuleLabel(r, program)}
                </p>
              ))}
              {program.expiration && <p className="px-4 py-2 text-xs text-gray-500">{program.other} expire after {program.expiration.replace(/^P/, "").toLowerCase()}</p>}
            </div>
            <div className="border-t border-gray-100 px-4 py-2.5">
              <a href={dashboard} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700">
                Edit the program in Square <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
        </div>
        <div>
          <RuledLabel info="What a client can spend their points on. Rewards that take money off the whole sale are spent on an invoice here (⋯ → Use a reward); a reward on one specific item is redeemed in the Square app.">Rewards</RuledLabel>
          <div className="ds-card overflow-hidden">
            <div className="divide-y divide-gray-100">
              {program.tiers.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">No rewards yet — add tiers in Square.</p>}
              {program.tiers.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="text-gray-900 truncate">{t.name}</p>
                    <p className="text-xs text-gray-500">
                      {rewardTierLabel(t)}
                      {t.scope !== "ORDER" ? " · in the Square app only" : ""}
                    </p>
                  </div>
                  <span className="numeral-ledger shrink-0 font-semibold text-gray-900">
                    {t.points} {t.points === 1 ? program.one : program.other}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {program.tiers.length > 0 && orderTiers.length === 0 && (
            <p className="mt-2 text-xs text-gray-500">None of these rewards takes money off a whole sale, so none can be spent on a WorkBench invoice yet.</p>
          )}
        </div>
      </div>

      {active && (
        <div className="mb-8">
          <RuledLabel info="Everyone in the program on Square — enrolled here, at the counter, or online — with their points. A member who isn't a WorkBench client yet shows by phone number.">
            Members
          </RuledLabel>
          {members.failure && <SquareUnavailable failure={members.failure} what="members" />}
          <div className="ds-card overflow-hidden">
            {members.members.length === 0 ? (
              <EmptyState compact title={members.failure ? "Couldn't read Square just now" : "No members yet"} body={members.failure ? "Members will list once Square answers." : "Enroll a client above, or from their page. Clients can also join from their hub."} />
            ) : (
              <div className="divide-y divide-gray-100">
                <div className="hidden lg:grid grid-cols-[1fr_160px_120px_120px_28px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                  <span>Member</span>
                  <span>Joined</span>
                  <span className="text-right">Lifetime</span>
                  <span className="text-right">{program.other}</span>
                  <span></span>
                </div>
                {members.members.map(({ account, contact }) => {
                  const inner = (
                    <>
                      <div className="flex-1 lg:flex-none min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{contact ? `${contact.firstName} ${contact.lastName}` : (account.phone ?? "Member")}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {contact ? (account.phone ?? "") : "not a WorkBench client"}
                          <span className="lg:hidden"> · {account.lifetimePoints} lifetime</span>
                        </p>
                      </div>
                      <span className="hidden lg:block text-sm text-gray-500">{account.enrolledAt ? new Date(account.enrolledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</span>
                      <span className="numeral-ledger hidden lg:block text-sm text-gray-500 text-right">{account.lifetimePoints}</span>
                      <span className="numeral-ledger text-sm font-semibold text-gray-900 text-right">{account.balance}</span>
                      <ChevronRight size={14} className={`hidden lg:block ${contact ? "text-gray-400" : "text-transparent"}`} />
                    </>
                  );
                  const cls = "flex lg:grid lg:grid-cols-[1fr_160px_120px_120px_28px] gap-4 items-center px-4 py-2.5";
                  return contact ? (
                    <Link key={account.id} prefetch={false} href={`/app/contacts/${contact.id}`} className={`${cls} hover:bg-gray-50 active:bg-gray-100 transition-colors`}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={account.id} className={cls}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {members.cursor && (
            <p className="mt-3 text-right">
              <Link prefetch={false} href={`/app/payments?tab=loyalty&cursor=${encodeURIComponent(members.cursor)}`} className="ds-link text-sm font-medium">
                More members →
              </Link>
            </p>
          )}
        </div>
      )}
    </>
  );
}
