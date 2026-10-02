import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, Chip, DsPage, ListRow, PageHeader, SectionTitle, Stat } from "@/components/ds";
import PresenceDot from "@/components/console/PresenceDot";
import { roleLabel } from "@/lib/permissions";
import AccountsClient from "@/components/console/AccountsClient";
import { loadAccounts, type GrowthWeek } from "@/lib/console-accounts";

export const dynamic = "force-dynamic";

/**
 * Accounts — the console's home. Who is on WorkBench, who is online, who
 * needs a hand, and how the account list is growing. Money lives on
 * /superadmin/profitability; this page is about usage.
 */

const RANGES = [7, 30, 90] as const;

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days) as (typeof RANGES)[number]) ? Number(params.days) : 30;
  const data = await loadAccounts(days);
  const { stats, attention, growth, rows, online } = data;
  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

  return (
    <DsPage>
      <PageHeader
        eyebrow={`${stats.live} live account${stats.live === 1 ? "" : "s"}`}
        title="Accounts"
        info={
          <>
            Every business on WorkBench, with who is in the app right now, when each one was last seen, how many
            clients they have added and what they have done in the last {days} days. Test accounts are listed
            separately and never counted. Money is on Profitability.
          </>
        }
        actions={
          <nav className="flex gap-1" aria-label="Range">
            {RANGES.map((r) => (
              <Link
                key={r}
                prefetch={false}
                href={`/superadmin?days=${r}`}
                className={`ds-btn ds-btn-sm ${r === days ? "ds-btn-soft" : "ds-btn-ghost"}`}
                aria-current={r === days ? "page" : undefined}
              >
                {r} d
              </Link>
            ))}
          </nav>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat className="ds-rise" style={rise(1)} label="Live accounts" value={stats.live} foot="not suspended" />
        <Stat className="ds-rise" style={rise(2)} label="Online now" value={stats.online} foot="people in the app" tone={stats.online > 0 ? "good" : undefined} href={online.length > 0 ? "#online" : undefined} />
        <Stat className="ds-rise" style={rise(3)} label="Active this week" value={stats.active7d} foot="accounts seen in 7 days" />
        <Stat className="ds-rise" style={rise(4)} label="New this month" value={stats.newThisMonth} foot="accounts opened" />
        <Stat className="ds-rise" style={rise(5)} label="Pending sign-ups" value={stats.pending} foot="waiting on you" href="/superadmin/signups" tone={stats.pending > 0 ? "bad" : undefined} />
        <Stat className="ds-rise" style={rise(6)} label="Open feedback" value={stats.openFeedback} foot="tickets" href="/superadmin/feedback" />
      </div>

      {online.length > 0 && (
        <div id="online" className="scroll-mt-20">
          <SectionTitle
            className="mt-8"
            info="People with the app open and in front of them in the last 3 minutes. A background tab or a phone app in the pocket does not count, and someone with one login at several companies shows only at the company they are using."
          >
            Online now <span className="ds-small ml-1 font-normal">{online.length}</span>
          </SectionTitle>
          <Card className="ds-divide ds-rise overflow-hidden" style={rise(7)}>
            {online.map((p) => (
              <ListRow
                key={p.userId}
                href={`/superadmin/company/${p.companyId}?tab=team`}
                lead={<PresenceDot state="online" />}
                title={
                  <>
                    {p.name} <span className="ds-small font-normal">· {roleLabel[p.role] ?? p.role}</span>
                  </>
                }
                sub={[p.companyName, p.via, p.email].filter(Boolean).join(" · ")}
                trail={p.isTest ? <Chip tone="neutral">Test</Chip> : undefined}
              />
            ))}
          </Card>
        </div>
      )}

      {attention.length > 0 && (
        <>
          <SectionTitle className="mt-8" info="Accounts that are stuck, blocked or about to lose something. This list disappears when there is nothing to do.">
            Needs attention <span className="ds-small ml-1 font-normal">{attention.length}</span>
          </SectionTitle>
          <Card className="ds-divide ds-rise overflow-hidden" style={rise(7)}>
            {attention.map((a) => (
              <Link key={a.key} prefetch={false} href={a.href} className="ds-row">
                <AlertTriangle
                  size={16}
                  className="shrink-0"
                  style={{ color: a.tone === "bad" ? "var(--ds-bad)" : "var(--ds-warn)" }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">{a.label}</span>
                  <span className="ds-small block truncate">{a.detail}</span>
                </span>
                <ChevronRight size={16} className="text-[color:var(--ds-faint)]" />
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle className="mt-8" info="Accounts opened each week for the last twelve weeks (test accounts excluded). The line at the right is the running total.">
        Growth
      </SectionTitle>
      <GrowthStrip weeks={growth} />

      <AccountsClient rows={rows} days={days} />
    </DsPage>
  );
}

/** Twelve weekly bars, drawn on the server — no chart library for one small strip. */
function GrowthStrip({ weeks }: { weeks: GrowthWeek[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.created));
  const total = weeks[weeks.length - 1]?.total ?? 0;
  const opened = weeks.reduce((n, w) => n + w.created, 0);
  const w = 12 * 28;
  const h = 56;
  return (
    <Card className="ds-rise flex flex-wrap items-end gap-6 p-5" style={{ "--ds-i": 8 } as React.CSSProperties}>
      <div className="min-w-0 flex-1">
        <svg viewBox={`0 0 ${w} ${h}`} className="block h-14 w-full max-w-[420px]" role="img" aria-label={`${opened} accounts opened in the last 12 weeks`}>
          {weeks.map((wk, i) => {
            const bh = Math.max(2, Math.round((wk.created / max) * (h - 4)));
            const last = i === weeks.length - 1;
            return (
              <g key={wk.label}>
                <title>{`Week of ${wk.label}: ${wk.created} opened, ${wk.total} total`}</title>
                <rect x={i * 28 + 4} y={h - bh} width={20} height={bh} rx={4} fill={last ? "var(--ds-secondary)" : "var(--ds-primary)"} opacity={wk.created === 0 ? 0.18 : 1} />
              </g>
            );
          })}
        </svg>
        <div className="ds-small mt-1.5 flex justify-between text-[11.5px]">
          <span>{weeks[0]?.label}</span>
          <span>this week</span>
        </div>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="ds-label">Opened, 12 weeks</p>
          <p className="ds-value mt-1 text-[24px]">{opened}</p>
        </div>
        <div>
          <p className="ds-label">Accounts</p>
          <p className="ds-value mt-1 text-[24px]">{total}</p>
        </div>
      </div>
    </Card>
  );
}
