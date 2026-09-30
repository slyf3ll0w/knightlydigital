import { prisma } from "@/lib/db";
import { PLAN_IDS, PLANS, formatCents, normalizeGrants } from "@/lib/plans";
import { ATLAS_PLAN_TOKENS, assistantUsageSummary, formatPlanPrice, freeBalance, planBalance } from "@/lib/assistant-billing";
import { paymentsOnboardingOpen } from "@/lib/payments-gate";
import { consoleActionLabel, consoleAuditFor } from "@/lib/console-audit";
import { Card, SectionTitle } from "@/components/ds";
import { fullDate } from "@/lib/console-format";
import { relativeSeen } from "@/lib/presence";
import { PaymentsControl } from "./PaymentsControl";
import { AssistantControl } from "./AssistantControl";
import { PlanControl } from "./PlanControl";
import { AddonControl } from "./AddonControl";
import { LineControl } from "./LineControl";
import { AccountActions } from "./AccountActions";
import type { CompanyCore } from "./shared";

/** Every switch the platform has for this account, and who flipped what. */
export default async function ControlsTab({ company }: { company: CompanyCore }) {
  const id = company.id;
  const [atlasUsage, users, contacts, jobs, invoices, payments, audit] = await Promise.all([
    assistantUsageSummary(id),
    prisma.user.count({ where: { companyId: id } }),
    prisma.contact.count({ where: { companyId: id } }),
    prisma.job.count({ where: { companyId: id } }),
    prisma.invoice.count({ where: { companyId: id } }),
    prisma.payment.count({ where: { companyId: id } }),
    consoleAuditFor(id, 40),
  ]);
  const atlasPlan = planBalance(company);
  const atlasFree = freeBalance(company);
  const footprint = { users, contacts, jobs, invoices, payments, large: payments > 0 || contacts > 25 || jobs > 25 };

  return (
    <>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PaymentsControl
          companyId={id}
          onboardingState={company.finixOnboardingState}
          paymentsWaived={company.paymentsWaived}
          onboardingOpen={paymentsOnboardingOpen()}
        />
        <PlanControl
          companyId={id}
          plans={PLAN_IDS.map((pid) => ({
            id: pid,
            name: PLANS[pid].name,
            tagline: PLANS[pid].tagline,
            price: formatCents(PLANS[pid].monthlyCents),
            comingSoon: PLANS[pid].comingSoon,
          }))}
          grants={normalizeGrants(company.planGrants)}
          dispatchPaid={Boolean(company.addonActiveAt)}
        />
        <AssistantControl
          companyId={id}
          assistantEnabled={company.assistantEnabled}
          free={{ included: atlasFree.included, used: atlasFree.used, remaining: atlasFree.remaining, periodEnd: atlasFree.periodEnd.toISOString() }}
          plan={
            atlasPlan
              ? {
                  activeAt: company.atlasPlanActiveAt!.toISOString(),
                  included: atlasPlan.included,
                  used: atlasPlan.used,
                  remaining: atlasPlan.remaining,
                  periodEnd: atlasPlan.periodEnd.toISOString(),
                }
              : null
          }
          planTokens={ATLAS_PLAN_TOKENS}
          planPrice={formatPlanPrice()}
          usage={{
            days: atlasUsage.days,
            turns: atlasUsage.turns,
            costCents: atlasUsage.costCents,
            atlasTokens: atlasUsage.atlasTokens,
            toolCalls: atlasUsage.toolCalls,
            lastAt: atlasUsage.lastAt?.toISOString() ?? null,
          }}
        />
        <AddonControl
          companyId={id}
          addonEnabled={company.addonEnabled}
          addonActiveAt={company.addonActiveAt?.toISOString() ?? null}
          addonLiverySubId={company.addonLiverySubId}
        />
        <div className="lg:col-span-2">
          <LineControl
            companyId={id}
            number={company.lineNumber?.startsWith("pending:") ? null : company.lineNumber}
            forwardTo={company.lineForwardTo}
            provisionedAt={company.lineProvisionedAt?.toISOString() ?? null}
            releaseAt={company.lineReleaseAt?.toISOString() ?? null}
            voiceAppAt={company.lineVoiceAppAt?.toISOString() ?? null}
            voiceAvailable={Boolean(process.env.TELNYX_VOICE_APP_ID)}
            callerIdName={company.lineCallerIdName}
            registration={
              company.messagingRegistration
                ? {
                    ...company.messagingRegistration,
                    submittedAt: company.messagingRegistration.submittedAt.toISOString(),
                    approvedAt: company.messagingRegistration.approvedAt?.toISOString() ?? null,
                    lastCheckedAt: company.messagingRegistration.lastCheckedAt?.toISOString() ?? null,
                  }
                : null
            }
          />
        </div>
        <div className="lg:col-span-2">
          <AccountActions
            companyId={id}
            name={company.name}
            slug={company.slug}
            suspendedAt={company.suspendedAt ? company.suspendedAt.toISOString() : null}
            suspendedReason={company.suspendedReason}
            footprint={footprint}
          />
        </div>
      </div>

      <SectionTitle className="mt-10" info="Every action a superadmin has taken on this account from the console, newest first. Written by the console itself, so it is complete from 2026-09-30 on.">
        Console history
      </SectionTitle>
      <Card className="ds-divide overflow-hidden">
        {audit.length === 0 && <p className="ds-small px-6 py-9 text-center">No console actions on this account yet.</p>}
        {audit.map((a) => (
          <div key={a.id} className="ds-row">
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium text-[color:var(--ds-ink)]">{consoleActionLabel(a.action)}</span>
              <span className="ds-small block truncate">
                {a.superadminName}
                {a.detail ? ` · ${a.detail}` : ""}
              </span>
            </span>
            <span className="ds-small whitespace-nowrap" title={fullDate(a.createdAt)}>
              {relativeSeen(a.createdAt)}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}
