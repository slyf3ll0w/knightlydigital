import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import {
  Card,
  Chip,
  DsPage,
  PageHeader,
  SectionTitle,
  Stat,
} from "@/components/ds";
import {
  cloudflareAnalyticsConfigured,
  cloudflareWebAnalytics,
  isMarketingPath,
} from "@/lib/cloudflare-analytics";
import {
  pathOf,
  searchConsoleConfigured,
  searchConsoleSnapshot,
  GSC_SITE_URL,
} from "@/lib/search-console";
import { indexLabel, searchIndexRows } from "@/lib/search-index";

export const dynamic = "force-dynamic";

/**
 * The marketing site in one place: visits from Cloudflare Web Analytics,
 * search clicks and index status from Google Search Console, and our own
 * conversion events (SiteEvent), joined per page. Each source is optional;
 * an unconfigured one shows what to set instead of a blank.
 */

const RANGES = [7, 30, 90] as const;

type Row = { key: string; count: number };

function tally<T>(
  rows: T[],
  pick: (r: T) => string | null | undefined,
  limit = 15,
): Row[] {
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

function source(r: {
  utmSource: string | null;
  utmMedium: string | null;
  referrer: string | null;
}): string {
  if (r.utmSource)
    return [r.utmSource, r.utmMedium].filter(Boolean).join(" / ");
  if (r.referrer)
    return r.referrer.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return "direct";
}

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireSuperadminPage();
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days) as (typeof RANGES)[number])
    ? Number(params.days)
    : 30;
  const since = new Date(Date.now() - days * 86_400_000);

  const [events, cf, gsc, indexRows] = await Promise.all([
    prisma.siteEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 20_000,
      select: {
        name: true,
        label: true,
        path: true,
        referrer: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        visitorId: true,
        createdAt: true,
      },
    }),
    cloudflareWebAnalytics(days),
    searchConsoleSnapshot(days),
    searchIndexRows(),
  ]);

  const clicks = events.filter(
    (e) => e.name === "cta_click" && e.label === "get_started",
  );
  const signups = events.filter((e) => e.name === "signup");
  const pdfs = events.filter((e) => e.name === "tool_pdf");
  const drafts = events.filter((e) => e.name === "tool_draft");

  // ── The joined page table ──
  const clicksByPath = new Map(
    tally(clicks, (e) => e.path, 1000).map((r) => [r.key, r.count]),
  );
  const signupsByPath = new Map(
    tally(signups, (e) => e.path, 1000).map((r) => [r.key, r.count]),
  );
  const visitsByPath = new Map(
    (cf?.byPath ?? []).map((r) => [r.key.replace(/\/$/, "") || "/", r]),
  );
  const searchByPath = new Map(
    (gsc?.pages ?? []).map((r) => [pathOf(r.key), r]),
  );
  const indexByPath = new Map(indexRows.map((r) => [r.path, r]));
  const allPaths = new Set<string>([
    ...visitsByPath.keys(),
    ...searchByPath.keys(),
    ...clicksByPath.keys(),
    ...signupsByPath.keys(),
  ]);
  const hasSearch = Boolean(gsc);
  const hasIndex = indexRows.length > 0;
  const pageRows = [...allPaths]
    .filter(isMarketingPath)
    .map((p) => ({
      path: p,
      visits: visitsByPath.get(p)?.visits ?? 0,
      pageViews: visitsByPath.get(p)?.pageViews ?? 0,
      clicks: searchByPath.get(p)?.clicks ?? 0,
      impressions: searchByPath.get(p)?.impressions ?? 0,
      position: searchByPath.get(p)?.position ?? null,
      getStarted: clicksByPath.get(p) ?? 0,
      signups: signupsByPath.get(p) ?? 0,
      index: indexLabel(indexByPath.get(p)),
    }))
    .sort(
      (a, b) =>
        b.pageViews - a.pageViews ||
        b.visits - a.visits ||
        b.clicks - a.clicks ||
        b.impressions - a.impressions ||
        b.getStarted - a.getStarted,
    )
    .slice(0, 60);

  const totalClicks = (gsc?.pages ?? []).reduce((s, r) => s + r.clicks, 0);
  const totalImpr = (gsc?.pages ?? []).reduce((s, r) => s + r.impressions, 0);
  const notIndexed = indexRows.filter((r) => r.verdict && r.verdict !== "PASS");
  const indexed = indexRows.filter((r) => r.verdict === "PASS").length;

  // ── Per-day series: visits (Cloudflare) · search clicks (Google) · sign-ups (ours) ──
  const dayKeys = new Set<string>();
  const cfByDate = new Map((cf?.byDate ?? []).map((r) => [r.key, r.visits]));
  const gscByDate = new Map((gsc?.dates ?? []).map((r) => [r.key, r.clicks]));
  const suByDate = new Map(
    tally(signups, (e) => e.createdAt.toISOString().slice(0, 10), 1000).map(
      (r) => [r.key, r.count],
    ),
  );
  const gsByDate = new Map(
    tally(clicks, (e) => e.createdAt.toISOString().slice(0, 10), 1000).map(
      (r) => [r.key, r.count],
    ),
  );
  for (const k of [...cfByDate.keys(), ...gscByDate.keys(), ...suByDate.keys()])
    dayKeys.add(k);
  const dayRows = [...dayKeys]
    .sort()
    .reverse()
    .slice(0, 14)
    .map((d) => ({
      d,
      visits: cfByDate.get(d) ?? 0,
      search: gscByDate.get(d) ?? 0,
      getStarted: gsByDate.get(d) ?? 0,
      signups: suByDate.get(d) ?? 0,
    }));

  const smallTables: {
    title: string;
    hint: string;
    rows: Row[];
    col: string;
  }[] = [
    {
      title: "Sign-ups by source",
      hint: "UTM source / medium, else the referrer",
      rows: tally(signups, source),
      col: "Source",
    },
    {
      title: "Get started clicks by source",
      hint: "UTM, referrer, or direct",
      rows: tally(clicks, source),
      col: "Source",
    },
    {
      title: "Campaigns",
      hint: "utm_campaign on any event",
      rows: tally(
        events.filter((e) => e.utmCampaign),
        (e) => e.utmCampaign,
      ),
      col: "Campaign",
    },
    {
      title: "Free tool downloads by page",
      hint: "PDFs rendered",
      rows: tally(pdfs, (e) => e.path),
      col: "Page",
    },
    {
      title: "Other CTA clicks",
      hint: "Log in, call, tool buttons",
      rows: tally(
        events.filter(
          (e) => e.name === "cta_click" && e.label !== "get_started",
        ),
        (e) => e.label,
      ),
      col: "Label",
    },
    {
      title: "Every event",
      hint: "By name",
      rows: tally(events, (e) => e.name),
      col: "Event",
    },
  ];

  return (
    <DsPage>
      <PageHeader
        title="Traffic"
        info="The marketing site in one place: visits from Cloudflare, search from Google, and the clicks and sign-ups we record ourselves, joined per page."
        actions={
          <div className="flex gap-1">
            {RANGES.map((d) => (
              <Link
                key={d}
                href={`/superadmin/traffic?days=${d}`}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${d === days ? "bg-[var(--ds-primary)] text-white" : "text-[var(--ds-ink-2)] hover:bg-[var(--ds-surface-2)]"}`}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      {(!cloudflareAnalyticsConfigured() || !searchConsoleConfigured()) && (
        <Card className="mb-4">
          <SectionTitle info="Each source is optional; set the variables on the production app service and this page fills in on the next load.">
            Connect the sources
          </SectionTitle>
          <ul className="mt-2 space-y-2 text-[13.5px] text-[var(--ds-ink-2)]">
            {!cloudflareAnalyticsConfigured() && (
              <li>
                <strong>Cloudflare Web Analytics</strong> (visits, page views,
                referrers, countries, devices): set{" "}
                <code>CLOUDFLARE_API_TOKEN</code> (an API token with Account
                Analytics: Read and Account Settings: Read) and{" "}
                <code>CLOUDFLARE_ACCOUNT_ID</code>. The site is matched from the
                beacon token already in <code>NEXT_PUBLIC_CF_BEACON_TOKEN</code>
                .
              </li>
            )}
            {!searchConsoleConfigured() && (
              <li>
                <strong>Google Search Console</strong> (search clicks,
                impressions, queries, index status): set{" "}
                <code>GSC_SERVICE_ACCOUNT_JSON</code> to a Google
                service-account key (JSON or base64) that has been added as a
                user on the <code>{GSC_SITE_URL}</code> property, and optionally{" "}
                <code>GSC_SITE_URL</code>.
              </li>
            )}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat
          label="Visits"
          value={cf ? n(cf.visits) : "—"}
          foot={
            cf
              ? `${n(cf.pageViews)} page views · Cloudflare estimate${cf.scoped ? "" : " (whole domain)"}`
              : "Cloudflare not connected"
          }
        />
        <Stat
          label="Search clicks"
          value={gsc ? n(totalClicks) : "—"}
          foot={
            gsc
              ? `${n(totalImpr)} impressions · Google`
              : "Search Console not connected"
          }
        />
        <Stat
          label="Get started clicks"
          value={n(clicks.length)}
          foot={
            cf && cf.visits
              ? `${pct(clicks.length / cf.visits)} of visits`
              : `${days} days`
          }
        />
        <Stat
          label="Sign-ups"
          value={n(signups.length)}
          foot={
            clicks.length
              ? `${pct(signups.length / clicks.length)} of clicks`
              : "—"
          }
        />
        <Stat
          label="Tool PDFs"
          value={n(pdfs.length)}
          foot={`${n(drafts.length)} went to sign-up`}
        />
        <Stat
          label="Indexed pages"
          value={indexRows.length ? `${indexed} / ${indexRows.length}` : "—"}
          foot={
            indexRows.length
              ? `${notIndexed.length} not indexed`
              : "checked by the hourly cron"
          }
          tone={notIndexed.length ? "bad" : undefined}
        />
      </div>

      <Card className="mt-6">
        <SectionTitle
          info={`Marketing pages only, every source side by side. Views and visits are Cloudflare's estimate (sampled, so multiples of ten); ${hasSearch ? "search is Google's; " : ""}Get started and sign-ups are ours.`}
        >
          Pages
        </SectionTitle>
        {pageRows.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-[var(--ds-muted)]">
            Nothing yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[640px] text-[13px]">
              <thead className="text-left text-[11.5px] font-bold uppercase tracking-wide text-[var(--ds-muted)]">
                <tr>
                  <th className="py-1.5 font-bold">Page</th>
                  <th className="py-1.5 text-right font-bold">Views</th>
                  <th className="py-1.5 text-right font-bold">Visits</th>
                  {hasSearch && (
                    <>
                      <th className="py-1.5 text-right font-bold">
                        Search clicks
                      </th>
                      <th className="py-1.5 text-right font-bold">
                        Impressions
                      </th>
                      <th className="py-1.5 text-right font-bold">Position</th>
                    </>
                  )}
                  <th className="py-1.5 text-right font-bold">Get started</th>
                  <th className="py-1.5 text-right font-bold">Sign-ups</th>
                  {hasIndex && (
                    <th className="py-1.5 pl-3 font-bold">Google index</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.path} className="border-t border-[var(--ds-line)]">
                    <td className="max-w-[320px] truncate py-1.5 pr-3">
                      <a
                        href={`https://workbenchfsm.com${r.path}`}
                        target="_blank"
                        rel="noopener"
                        className="hover:underline"
                      >
                        {r.path}
                      </a>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {cf ? n(r.pageViews) : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {cf ? n(r.visits) : "—"}
                    </td>
                    {hasSearch && (
                      <>
                        <td className="py-1.5 text-right tabular-nums">
                          {n(r.clicks)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {n(r.impressions)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {r.position != null ? r.position.toFixed(1) : "—"}
                        </td>
                      </>
                    )}
                    <td className="py-1.5 text-right tabular-nums">
                      {n(r.getStarted)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">
                      {n(r.signups)}
                    </td>
                    {hasIndex && (
                      <td className="py-1.5 pl-3">
                        <Chip
                          tone={
                            r.index.ok === true
                              ? "good"
                              : r.index.ok === false
                                ? "bad"
                                : "neutral"
                          }
                        >
                          {r.index.text}
                        </Chip>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle
            info={`Last 14 days. Visits are Cloudflare's estimate${hasSearch ? ", search clicks Google's (about two days behind)" : ""}, the rest ours.`}
          >
            By day
          </SectionTitle>
          <table className="mt-2 w-full text-[13px]">
            <thead className="text-left text-[11.5px] font-bold uppercase tracking-wide text-[var(--ds-muted)]">
              <tr>
                <th className="py-1.5 font-bold">Day</th>
                <th className="py-1.5 text-right font-bold">Visits</th>
                {hasSearch && (
                  <th className="py-1.5 text-right font-bold">Search clicks</th>
                )}
                <th className="py-1.5 text-right font-bold">Get started</th>
                <th className="py-1.5 text-right font-bold">Sign-ups</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map((r) => (
                <tr key={r.d} className="border-t border-[var(--ds-line)]">
                  <td className="py-1.5">{r.d}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {cf ? n(r.visits) : "—"}
                  </td>
                  {hasSearch && (
                    <td className="py-1.5 text-right tabular-nums">
                      {n(r.search)}
                    </td>
                  )}
                  <td className="py-1.5 text-right tabular-nums">
                    {n(r.getStarted)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">
                    {n(r.signups)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {gsc && (
          <Card>
            <SectionTitle info="What people typed into Google to find the site. From Search Console.">
              Search queries
            </SectionTitle>
            {gsc.queries.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-[var(--ds-muted)]">
                Nothing yet.
              </p>
            ) : (
              <table className="mt-2 w-full text-[13px]">
                <thead className="text-left text-[11.5px] font-bold uppercase tracking-wide text-[var(--ds-muted)]">
                  <tr>
                    <th className="py-1.5 font-bold">Query</th>
                    <th className="py-1.5 text-right font-bold">Clicks</th>
                    <th className="py-1.5 text-right font-bold">Impr.</th>
                    <th className="py-1.5 text-right font-bold">CTR</th>
                    <th className="py-1.5 text-right font-bold">Pos.</th>
                  </tr>
                </thead>
                <tbody>
                  {gsc.queries.slice(0, 25).map((q) => (
                    <tr
                      key={q.key}
                      className="border-t border-[var(--ds-line)]"
                    >
                      <td className="max-w-[260px] truncate py-1.5 pr-3">
                        {q.key}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {n(q.clicks)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {n(q.impressions)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {pct(q.ctr)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {q.position.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {searchConsoleConfigured() && (
          <Card>
            <SectionTitle info="Sitemap pages Google has not indexed, with its reason. Checked a few pages an hour by the cron.">
              Not indexed
            </SectionTitle>
            {indexRows.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-[var(--ds-muted)]">
                No pages checked yet; the first batch lands within the hour.
              </p>
            ) : notIndexed.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-[var(--ds-muted)]">
                Every checked page is indexed.
              </p>
            ) : (
              <table className="mt-2 w-full text-[13px]">
                <thead className="text-left text-[11.5px] font-bold uppercase tracking-wide text-[var(--ds-muted)]">
                  <tr>
                    <th className="py-1.5 font-bold">Page</th>
                    <th className="py-1.5 font-bold">Google says</th>
                    <th className="py-1.5 text-right font-bold">Last crawl</th>
                  </tr>
                </thead>
                <tbody>
                  {notIndexed.map((r) => (
                    <tr
                      key={r.url}
                      className="border-t border-[var(--ds-line)]"
                    >
                      <td className="max-w-[240px] truncate py-1.5 pr-3">
                        {r.path}
                      </td>
                      <td className="py-1.5 pr-3">
                        {r.coverageState ?? r.verdict}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.lastCrawlTime
                          ? r.lastCrawlTime.toISOString().slice(0, 10)
                          : "never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {gsc && gsc.sitemaps.length > 0 && (
              <p className="mt-3 text-[12.5px] text-[var(--ds-muted)]">
                Sitemap:{" "}
                {gsc.sitemaps
                  .map(
                    (s) =>
                      `${s.path.replace(/^https?:\/\/[^/]+/, "")} · ${s.submitted} submitted, ${s.indexed} indexed${s.errors ? `, ${s.errors} errors` : ""}, last read ${s.lastDownloaded ? s.lastDownloaded.slice(0, 10) : "never"}`,
                  )
                  .join(" · ")}
              </p>
            )}
          </Card>
        )}

        <Card>
          <SectionTitle info="Where visits to the marketing pages start, from Cloudflare. Outside sites only; sign-in and local addresses are left out.">
            Referrers
          </SectionTitle>
          {!cf ? (
            <p className="mt-2 text-[13.5px] text-[var(--ds-muted)]">
              Cloudflare not connected.
            </p>
          ) : (
            <TwoCol
              rows={cf.byReferer
                .slice(0, 15)
                .map((r) => ({ key: r.key || "(direct)", count: r.visits }))}
              col="Site"
            />
          )}
          {cf && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-[var(--ds-muted)]">
                  Countries
                </p>
                <TwoCol
                  rows={cf.byCountry
                    .slice(0, 6)
                    .map((r) => ({ key: r.key, count: r.visits }))}
                  col=""
                />
              </div>
              <div>
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-[var(--ds-muted)]">
                  Devices
                </p>
                <TwoCol
                  rows={cf.byDevice.map((r) => ({
                    key: r.key,
                    count: r.visits,
                  }))}
                  col=""
                />
              </div>
            </div>
          )}
        </Card>

        {smallTables.map((t) => (
          <Card key={t.title}>
            <SectionTitle info={t.hint}>{t.title}</SectionTitle>
            {t.rows.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-[var(--ds-muted)]">
                Nothing yet.
              </p>
            ) : (
              <TwoCol rows={t.rows} col={t.col} />
            )}
          </Card>
        ))}
      </div>
    </DsPage>
  );
}

function TwoCol({ rows, col }: { rows: Row[]; col: string }) {
  return (
    <table className="mt-2 w-full text-[13.5px]">
      {col && (
        <thead className="text-left text-[11.5px] font-bold uppercase tracking-wide text-[var(--ds-muted)]">
          <tr>
            <th className="py-1.5 font-bold">{col}</th>
            <th className="py-1.5 text-right font-bold">Count</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-[var(--ds-line)]">
            <td className="max-w-[360px] truncate py-1.5 pr-3">{r.key}</td>
            <td className="py-1.5 text-right tabular-nums">{n(r.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
