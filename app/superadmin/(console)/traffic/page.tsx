import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import { Card, DsPage, PageHeader, SectionTitle, Stat } from "@/components/ds";

export const dynamic = "force-dynamic";

/**
 * Marketing-site conversions (SiteEvent, lib/site-events.ts): which pages
 * produce Get started clicks and sign-ups, where those visitors came from,
 * and how the free tools are used. Page views live in Cloudflare Web
 * Analytics; this is the part Cloudflare can't see.
 */

const RANGES = [7, 30, 90] as const;

type Row = { key: string; count: number };

function tally<T>(rows: T[], pick: (r: T) => string | null | undefined, limit = 15): Row[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (pick(r) ?? "").trim() || "(none)";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function source(r: { utmSource: string | null; utmMedium: string | null; referrer: string | null }): string {
  if (r.utmSource) return [r.utmSource, r.utmMedium].filter(Boolean).join(" / ");
  if (r.referrer) return r.referrer.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return "direct";
}

export default async function TrafficPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireSuperadminPage();
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days) as (typeof RANGES)[number]) ? Number(params.days) : 30;
  const since = new Date(Date.now() - days * 86_400_000);

  const events = await prisma.siteEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 20_000,
    select: { name: true, label: true, path: true, referrer: true, utmSource: true, utmMedium: true, utmCampaign: true, visitorId: true, createdAt: true },
  });

  const clicks = events.filter((e) => e.name === "cta_click" && e.label === "get_started");
  const signups = events.filter((e) => e.name === "signup");
  const pdfs = events.filter((e) => e.name === "tool_pdf");
  const drafts = events.filter((e) => e.name === "tool_draft");
  const visitors = new Set(events.map((e) => e.visitorId).filter(Boolean)).size;

  const tables: { title: string; hint: string; rows: Row[]; col: string }[] = [
    { title: "Get started clicks by page", hint: "Where the click happened", rows: tally(clicks, (e) => e.path), col: "Page" },
    { title: "Sign-ups by source", hint: "UTM source / medium, else the referrer", rows: tally(signups, source), col: "Source" },
    { title: "Sign-ups by landing page", hint: "The first page of that visitor's session", rows: tally(signups, (e) => e.path), col: "Landing page" },
    { title: "Get started clicks by source", hint: "UTM, referrer, or direct", rows: tally(clicks, source), col: "Source" },
    { title: "Campaigns", hint: "utm_campaign on any event", rows: tally(events.filter((e) => e.utmCampaign), (e) => e.utmCampaign), col: "Campaign" },
    { title: "Free tool downloads by page", hint: "PDFs rendered", rows: tally(pdfs, (e) => e.path), col: "Page" },
    { title: "Every event", hint: "By name", rows: tally(events, (e) => e.name), col: "Event" },
    { title: "Other CTA clicks", hint: "Log in, call, tool buttons", rows: tally(events.filter((e) => e.name === "cta_click" && e.label !== "get_started"), (e) => e.label), col: "Label" },
  ];

  return (
    <DsPage>
      <PageHeader
        title="Traffic"
        info="Conversions on the marketing site. Page views are in Cloudflare Web Analytics; this is what Cloudflare can't see."
        actions={
          <div className="flex gap-1">
            {RANGES.map((d) => (
              <Link key={d} href={`/superadmin/traffic?days=${d}`} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${d === days ? "bg-[var(--ds-primary)] text-white" : "text-[var(--ds-ink-2)] hover:bg-[var(--ds-surface-2)]"}`}>
                {d}d
              </Link>
            ))}
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Get started clicks" value={String(clicks.length)} foot={`${days} days`} />
        <Stat label="Sign-ups" value={String(signups.length)} foot={clicks.length ? `${Math.round((signups.length / clicks.length) * 100)}% of clicks` : "—"} />
        <Stat label="Tool PDFs" value={String(pdfs.length)} foot="invoice + estimate" />
        <Stat label="Tool → sign-up" value={String(drafts.length)} foot="Get paid online clicks" />
        <Stat label="Visitors with an event" value={String(visitors)} foot="distinct browsers" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {tables.map((t) => (
          <Card key={t.title}>
            <SectionTitle info={t.hint}>{t.title}</SectionTitle>
            {t.rows.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-[var(--ds-muted)]">Nothing yet.</p>
            ) : (
              <table className="mt-2 w-full text-[13.5px]">
                <thead className="text-left text-[11.5px] font-bold uppercase tracking-wide text-[var(--ds-muted)]">
                  <tr>
                    <th className="py-1.5 font-bold">{t.col}</th>
                    <th className="py-1.5 text-right font-bold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r) => (
                    <tr key={r.key} className="border-t border-[var(--ds-line)]">
                      <td className="max-w-[360px] truncate py-1.5 pr-3">{r.key}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))}
      </div>
    </DsPage>
  );
}
