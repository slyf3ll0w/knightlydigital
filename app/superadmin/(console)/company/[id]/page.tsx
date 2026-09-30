import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Chip, DsPage, PageHeader } from "@/components/ds";
import { accountStatus } from "@/lib/console-accounts";
import { latest, presenceOf, relativeSeen } from "@/lib/presence";
import { monthYear } from "@/lib/console-format";
import { PLANS, normalizeGrants } from "@/lib/plans";
import { atlasAccess } from "@/lib/assistant-access";
import { COMPANY_SELECT, TABS, TAB_LABELS, type Tab } from "./shared";
import TestToggle from "./TestToggle";
import OverviewTab from "./OverviewTab";
import TeamTab from "./TeamTab";
import MoneyTab from "./MoneyTab";
import UsageTab from "./UsageTab";
import ControlsTab from "./ControlsTab";

export const dynamic = "force-dynamic";

/**
 * One account. The header says the state of the business in one glance
 * (who is in the app, since when, who owns it); the tabs go deeper:
 * Overview (activation, activity), Team, Money, Usage, Controls.
 */
export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";

  const company = await prisma.company.findUnique({ where: { id }, select: COMPANY_SELECT });
  if (!company) notFound();

  const now = new Date();
  const status = accountStatus(company);
  const active = company.users.filter((u) => u.isActive);
  const lastSeenAt = latest(active.map((u) => u.lastSeenAt));
  const presence = presenceOf(lastSeenAt, company.timezone, now);
  const online = active.filter((u) => presenceOf(u.lastSeenAt, company.timezone, now) === "online").length;
  const owner = active.find((u) => u.role === "OWNER") ?? active[0];
  const place = [company.city, company.state].filter(Boolean).join(", ");
  const atlas = atlasAccess(company, now);
  const lineOn = Boolean(company.lineNumber && !company.lineNumber.startsWith("pending:"));

  const chips: { label: string; tone: "primary" | "secondary" | "good" | "warn" | "bad" | "neutral" }[] = [];
  if (company.isTest) chips.push({ label: "Test account", tone: "neutral" });
  for (const p of normalizeGrants(company.planGrants)) chips.push({ label: `${PLANS[p].name} granted`, tone: "primary" });
  if (company.addonActiveAt && company.addonLiverySubId) chips.push({ label: "Voice subscription", tone: "primary" });
  if (lineOn) chips.push({ label: company.lineReleaseAt ? "Line releasing" : `Line ${company.lineNumber}`, tone: company.lineReleaseAt ? "warn" : "good" });
  if (company.messagingRegistration) {
    const s = company.messagingRegistration.status;
    chips.push({ label: `Texting ${s.toLowerCase().replace(/_/g, " ")}`, tone: s === "ACTIVE" ? "good" : s === "REJECTED" ? "bad" : "warn" });
  }
  chips.push(
    atlas.level === "full"
      ? { label: "Atlas whitelisted", tone: "primary" }
      : atlas.level === "plan"
        ? { label: "Atlas paid plan", tone: "primary" }
        : atlas.level === "free"
          ? { label: "Atlas free tier", tone: "neutral" }
          : atlas.level === "locked"
            ? { label: "Atlas tokens spent", tone: "warn" }
            : { label: "Atlas off", tone: "neutral" }
  );
  if (company.paymentsWaived) chips.push({ label: "Payments waived", tone: "neutral" });
  if (company.finixOnboardingState === "APPROVED") chips.push({ label: "Payments live", tone: "good" });
  if (company.emailDomain) chips.push({ label: `Email ${company.emailDomainStatus === "verified" ? "domain verified" : "domain pending"}`, tone: company.emailDomainStatus === "verified" ? "good" : "warn" });

  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

  return (
    <DsPage>
      <PageHeader
        eyebrow={
          <Link prefetch={false} href="/superadmin" className="ds-link">
            ← Accounts
          </Link>
        }
        title={company.name}
        info={
          <>
            Everything the platform knows about this account. The band shows who is in the app right now and who owns
            the business; the tabs hold the activation checklist and recent activity, the team, money, usage, and
            every control. Mark test keeps this account out of every console total.
          </>
        }
        actions={<TestToggle companyId={company.id} isTest={company.isTest} />}
      />

      <div className="ds-hero ds-rise mt-6 p-5 lg:p-6" style={rise(1)}>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="ds-hero-pill">{status.label}</span>
            <p className="mt-4 text-[30px] font-semibold leading-none tracking-[-0.03em] lg:text-[36px]">
              {presence === "online" ? "Online now" : presence === "never" ? "Never signed in" : `Last seen ${relativeSeen(lastSeenAt, now)}`}
            </p>
            <p className="mt-3 text-[15px] font-medium opacity-90">
              {online > 0 ? `${online} of ${active.length} on the team in the app` : `${active.length} on the team`} · joined {monthYear(company.createdAt)}
            </p>
            <p className="mt-0.5 truncate text-[13.5px] opacity-80">
              /{company.slug}
              {company.industry ? ` · ${company.industry}` : ""}
              {place ? ` · ${place}` : ""}
            </p>
          </div>
          {owner && (
            <div className="text-[13.5px] lg:text-right">
              <p className="opacity-80">Owner</p>
              <p className="font-semibold">{owner.name}</p>
              <p className="opacity-90">{owner.email}</p>
              {owner.phone && <p className="opacity-90">{owner.phone}</p>}
            </div>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {chips.map((c) => (
            <Chip key={c.label} tone={c.tone}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}

      <nav className="mt-6 flex gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Sections">
        {TABS.map((t) => (
          <Link
            key={t}
            prefetch={false}
            href={`/superadmin/company/${company.id}?tab=${t}`}
            className={`ds-btn ds-btn-sm shrink-0 ${t === tab ? "ds-btn-soft" : "ds-btn-ghost"}`}
            aria-current={t === tab ? "page" : undefined}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab company={company} />}
      {tab === "team" && <TeamTab company={company} />}
      {tab === "money" && <MoneyTab company={company} rangeKey={sp.range} />}
      {tab === "usage" && <UsageTab company={company} />}
      {tab === "controls" && <ControlsTab company={company} />}
    </DsPage>
  );
}
