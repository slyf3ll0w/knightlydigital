import { prisma } from "@/lib/db";
import { usageDay } from "@/lib/usage";
import { usageCostCents } from "@/lib/platform-costs";
import { assistantUsageSummary, freeBalance, planBalance } from "@/lib/assistant-billing";
import { atlasAccess } from "@/lib/assistant-access";
import { Card, Chip, SectionTitle } from "@/components/ds";
import { compact, fullDate, mb, usdFine } from "@/lib/console-format";
import type { CompanyCore } from "./shared";

/**
 * Usage: what this account consumes month by month — Atlas turns and
 * tokens, emails, texts, Mapbox calls, storage — and the Atlas meters as
 * the tenant sees them. Costs are ours (unit prices in lib/platform-costs).
 */

type Month = {
  month: string;
  aiCalls: number;
  aiTokens: number;
  aiCost: number;
  emails: number;
  sms: number;
  segments: number;
  geocodes: number;
  matrix: number;
  directions: number;
  storage: number | null;
};

function Meter({ label, used, included, refillsAt }: { label: string; used: number; included: number; refillsAt: Date }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, included)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="ds-label">{label}</span>
        <span className="ds-small">refills {fullDate(refillsAt)}</span>
      </div>
      <p className="ds-num mt-1 text-[15px] text-[color:var(--ds-ink)]">
        {used.toLocaleString()} <span className="ds-small">of {included.toLocaleString()} tokens</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-line)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--ds-warn)" : "var(--ds-primary)" }} />
      </div>
    </div>
  );
}

export default async function UsageTab({ company }: { company: CompanyCore }) {
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const [usage, summary] = await Promise.all([
    prisma.companyUsageDaily.findMany({ where: { companyId: company.id, day: { gte: usageDay(since) } }, orderBy: { day: "asc" } }),
    assistantUsageSummary(company.id),
  ]);

  const months = new Map<string, Month>();
  for (const u of usage) {
    const key = u.day.slice(0, 7);
    let m = months.get(key);
    if (!m) {
      m = { month: key, aiCalls: 0, aiTokens: 0, aiCost: 0, emails: 0, sms: 0, segments: 0, geocodes: 0, matrix: 0, directions: 0, storage: null };
      months.set(key, m);
    }
    m.aiCalls += u.aiCalls;
    m.aiTokens += u.aiTokensIn + u.aiTokensOut;
    m.aiCost += usageCostCents({ aiTokensIn: u.aiTokensIn, aiTokensOut: u.aiTokensOut, aiTokensCached: u.aiTokensCached, emailsSent: 0, smsSegments: 0 });
    m.emails += u.emailsSent;
    m.sms += u.smsSent;
    m.segments += u.smsSegments;
    m.geocodes += u.geocodeCalls;
    m.matrix += u.matrixElements;
    m.directions += u.directionsCalls;
    if (u.storageBytes !== null) m.storage = Number(u.storageBytes);
  }
  const rows = [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1));

  const access = atlasAccess(company);
  const free = freeBalance(company);
  const plan = planBalance(company);
  const accessChip =
    access.level === "full"
      ? { label: "Whitelisted — unmetered", tone: "primary" as const }
      : access.level === "off"
        ? { label: "Off", tone: "neutral" as const }
        : access.level === "plan"
          ? { label: "Paid plan", tone: "primary" as const }
          : access.level === "free"
            ? { label: "Free tier", tone: "neutral" as const }
            : { label: access.reason === "plan-spent" ? "Plan tokens spent" : "Free tier spent", tone: "warn" as const };

  return (
    <>
      <SectionTitle
        className="mt-8"
        info="The meters the tenant sees. Every account gets a free monthly token allowance refilled on the 1st; the paid plan is a bigger allowance anchored on its billing day. A whitelisted account is unmetered. 1 token = 0.01¢ of our Gemini cost. Change any of this on Controls."
      >
        Atlas
      </SectionTitle>
      <Card className="grid gap-6 p-5 lg:grid-cols-3">
        <div>
          <p className="ds-label">Access</p>
          <p className="mt-2">
            <Chip tone={accessChip.tone}>{accessChip.label}</Chip>
          </p>
          <p className="ds-small mt-3">
            Last 30 days: {summary.turns.toLocaleString()} turns · {summary.toolCalls.toLocaleString()} tool calls · {usdFine(summary.costCents)} our cost
            {summary.lastAt ? ` · last ${fullDate(summary.lastAt)}` : ""}
          </p>
        </div>
        <Meter label="Free tier" used={free.used} included={free.included} refillsAt={free.periodEnd} />
        {plan ? (
          <Meter label="Paid plan" used={plan.used} included={plan.included} refillsAt={plan.periodEnd} />
        ) : (
          <div>
            <p className="ds-label">Paid plan</p>
            <p className="ds-small mt-2">Not active.</p>
          </div>
        )}
      </Card>

      <SectionTitle className="mt-8" info="Twelve months of metered usage from CompanyUsageDaily. Storage is the month's latest nightly snapshot of photos, logos and avatars. Mapbox counts are the Route Manager's geocodes, matrix elements and directions calls.">
        By month
      </SectionTitle>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[13.5px]">
          <thead>
            <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
              <th className="px-4 py-2.5 font-medium">Month</th>
              <th className="px-3 py-2.5 text-right font-medium">Atlas turns</th>
              <th className="px-3 py-2.5 text-right font-medium">Tokens</th>
              <th className="px-3 py-2.5 text-right font-medium">AI cost</th>
              <th className="px-3 py-2.5 text-right font-medium">Emails</th>
              <th className="px-3 py-2.5 text-right font-medium">Texts</th>
              <th className="px-3 py-2.5 text-right font-medium">Geocodes</th>
              <th className="px-3 py-2.5 text-right font-medium">Matrix</th>
              <th className="px-3 py-2.5 text-right font-medium">Directions</th>
              <th className="px-3 py-2.5 text-right font-medium">Storage</th>
            </tr>
          </thead>
          <tbody className="ds-divide">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="ds-small px-4 py-8 text-center">
                  Nothing metered yet.
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.month} className="transition-colors hover:bg-[color:var(--ds-surface-2)]">
                <td className="ds-num px-4 py-2.5 font-medium text-[color:var(--ds-ink)]">{m.month}</td>
                <td className="ds-num px-3 py-2.5 text-right">{m.aiCalls}</td>
                <td className="ds-num px-3 py-2.5 text-right">{compact(m.aiTokens)}</td>
                <td className="ds-num px-3 py-2.5 text-right">{usdFine(m.aiCost)}</td>
                <td className="ds-num px-3 py-2.5 text-right">{m.emails}</td>
                <td className="ds-num px-3 py-2.5 text-right">
                  {m.sms}
                  {m.segments !== m.sms && <span className="ds-small block">{m.segments} segments</span>}
                </td>
                <td className="ds-num px-3 py-2.5 text-right">{m.geocodes}</td>
                <td className="ds-num px-3 py-2.5 text-right">{compact(m.matrix)}</td>
                <td className="ds-num px-3 py-2.5 text-right">{m.directions}</td>
                <td className="ds-num px-3 py-2.5 text-right">{m.storage !== null ? mb(m.storage) : <span className="ds-small">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
