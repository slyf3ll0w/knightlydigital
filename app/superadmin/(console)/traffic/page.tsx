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
 *
 * Layout follows the other console pages (profitability): the section
 * title sits above a padding-free card, every cell carries its own
 * padding, numbers use .ds-num, rows divide with .ds-divide.
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

/** "2026-11-05" → "Wed, Nov 5". */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const regionNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/** Cloudflare reports countries as ISO codes ("US"); show the name. */
function countryLabel(code: string): string {
  if (!code) return "Unknown";
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const cap = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";

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
    count?: string;
    empty?: string;
  }[] = [
    {
      title: "Referrers",
      hint: "Where visits to the marketing pages start, from Cloudflare. Outside sites only; our own pages, sign-in and local addresses are left out.",
      rows: (cf?.byReferer ?? [])
        .slice(0, 15)
        .map((r) => ({ key: r.key || "(direct)", count: r.visits })),
      col: "Site",
      count: "Visits",
      empty: cf ? "No outside referrers yet." : "Cloudflare not connected.",
    },
    {
      title: "Countries",
      hint: "Where visitors are, from Cloudflare.",
      rows: (cf?.byCountry ?? [])
        .slice(0, 10)
        .map((r) => ({ key: countryLabel(r.key), count: r.visits })),
      col: "Country",
      count: "Visits",
      empty: cf ? "Nothing yet." : "Cloudflare not connected.",
    },
    {
      title: "Devices",
      hint: "Phone, desktop or tablet, from Cloudflare.",
      rows: (cf?.byDevice ?? []).map((r) => ({
        key: cap(r.key),
        count: r.visits,
      })),
      col: "Device",
      count: "Visits",
      empty: cf ? "Nothing yet." : "Cloudflare not connected.",
    },
    {
      title: "Sign-ups by source",
      hint: "UTM source / medium when the link carried one, else the referrer, else direct.",
      rows: tally(signups, source),
      col: "Source",
      count: "Sign-ups",
    },
    {
      title: "Get started clicks by source",
      hint: "UTM, referrer, or direct.",
      rows: tally(clicks, source),
      col: "Source",
      count: "Clicks",
    },
    {
      title: "Campaigns",
      hint: "utm_campaign on any event we recorded.",
      rows: tally(
        events.filter((e) => e.utmCampaign),
        (e) => e.utmCampaign,
      ),
      col: "Campaign",
      count: "Events",
    },
    {
      title: "Free tool downloads",
      hint: "PDFs rendered by the free invoice and estimate generators, by page.",
      rows: tally(pdfs, (e) => e.path),
      col: "Page",
      count: "PDFs",
    },
    {
      title: "Other CTA clicks",
      hint: "Log in, call and tool buttons; Get started has its own column above.",
      rows: tally(
        events.filter(
          (e) => e.name === "cta_click" && e.label !== "get_started",
        ),
        (e) => e.label,
      ),
      col: "Button",
      count: "Clicks",
    },
    {
      title: "Every event",
      hint: "Everything we recorded ourselves, by name.",
      rows: tally(events, (e) => e.name),
      col: "Event",
      count: "Count",
    },
  ];

  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;
  const th = "px-3 py-2.5 font-medium";
  const td = "px-3 py-2.5";

  return (
    <DsPage>
      <PageHeader
        eyebrow={`Last ${days} days`}
        title="Traffic"
        info="The marketing site in one place: visits from Cloudflare, search from Google, and the clicks and sign-ups we record ourselves, joined per page. Cloudflare's numbers are sampled estimates, so they come in multiples of ten."
        actions={
          <nav className="flex gap-1" aria-label="Range">
            {RANGES.map((d) => (
              <Link
                key={d}
                prefetch={false}
                href={`/superadmin/traffic?days=${d}`}
                className={`ds-btn ds-btn-sm ${d === days ? "ds-btn-soft" : "ds-btn-ghost"}`}
                aria-current={d === days ? "page" : undefined}
              >
                {d} d
              </Link>
            ))}
          </nav>
        }
      />

      {(!cloudflareAnalyticsConfigured() || !searchConsoleConfigured()) && (
        <>
          <SectionTitle
            className="mt-6"
            info="Each source is optional; set the variables on the production app service and this page fills in on the next load."
          >
            Connect the sources
          </SectionTitle>
          <Card className="p-5">
            <ul className="space-y-3 text-[13.5px] text-[color:var(--ds-ink-2)]">
              {!cloudflareAnalyticsConfigured() && (
                <li>
                  <strong className="text-[color:var(--ds-ink)]">
                    Cloudflare Web Analytics
                  </strong>{" "}
                  (visits, page views, referrers, countries, devices): set{" "}
                  <code>CLOUDFLARE_API_TOKEN</code> (an API token with Account
                  Analytics: Read and Account Settings: Read) and{" "}
                  <code>CLOUDFLARE_ACCOUNT_ID</code>. The site is matched from
                  the beacon token already in{" "}
                  <code>NEXT_PUBLIC_CF_BEACON_TOKEN</code>.
                </li>
              )}
              {!searchConsoleConfigured() && (
                <li>
                  <strong className="text-[color:var(--ds-ink)]">
                    Google Search Console
                  </strong>{" "}
                  (search clicks, impressions, queries, index status): set{" "}
                  <code>GSC_SERVICE_ACCOUNT_JSON</code> to a Google
                  service-account key (JSON or base64) that has been added as
                  a user on the <code>{GSC_SITE_URL}</code> property, and
                  optionally <code>GSC_SITE_URL</code>.
                </li>
              )}
            </ul>
          </Card>
        </>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          className="ds-rise"
          style={rise(1)}
          label="Visits"
          info={`Cloudflare's estimate of visits to the marketing pages${cf && !cf.scoped ? " (Cloudflare refused the page filter, so this is the whole domain)" : ""}. Sampled, so multiples of ten.`}
          value={cf ? n(cf.visits) : "—"}
          foot={cf ? `${n(cf.pageViews)} page views` : "not connected"}
        />
        <Stat
          className="ds-rise"
          style={rise(2)}
          label="Search clicks"
          info="Clicks from Google search results, from Search Console. Google reports about two days behind."
          value={gsc ? n(totalClicks) : "—"}
          foot={gsc ? `${n(totalImpr)} impressions` : "not connected"}
        />
        <Stat
          className="ds-rise"
          style={rise(3)}
          label="Get started"
          info="Clicks on any Get started button on the marketing site, recorded by our own code."
          value={n(clicks.length)}
          foot={
            cf && cf.visits
              ? `${pct(clicks.length / cf.visits)} of visits`
              : "clicks"
          }
        />
        <Stat
          className="ds-rise"
          style={rise(4)}
          label="Sign-ups"
          info="Applications submitted on /apply in the range."
          value={n(signups.length)}
          foot={
            clicks.length
              ? `${pct(signups.length / clicks.length)} of clicks`
              : "applications"
          }
        />
        <Stat
          className="ds-rise"
          style={rise(5)}
          label="Tool PDFs"
          info="PDFs rendered by the free invoice and estimate generators, and how many of those visitors went on to the sign-up form with their draft."
          value={n(pdfs.length)}
          foot={`${n(drafts.length)} went to sign-up`}
        />
        <Stat
          className="ds-rise"
          style={rise(6)}
          label="Indexed"
          info="Sitemap pages Google has indexed, checked a few pages an hour through Search Console's URL Inspection API."
          value={indexRows.length ? `${indexed} / ${indexRows.length}` : "—"}
          foot={
            indexRows.length
              ? `${notIndexed.length} not indexed`
              : "not checked yet"
          }
          tone={notIndexed.length ? "bad" : undefined}
        />
      </div>

      <SectionTitle
        className="mt-8"
        info={`Marketing pages only, every source side by side. Views and visits are Cloudflare's estimate; ${hasSearch ? "search clicks, impressions and position are Google's; " : ""}Get started and sign-ups are ours.`}
      >
        Pages
      </SectionTitle>
      <Card className="ds-rise overflow-x-auto" style={rise(7)}>
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
              <th className="px-4 py-2.5 font-medium">Page</th>
              <th className={`${th} text-right`}>Views</th>
              <th className={`${th} text-right`}>Visits</th>
              {hasSearch && (
                <>
                  <th className={`${th} text-right`}>Search clicks</th>
                  <th className={`${th} text-right`}>Impressions</th>
                  <th className={`${th} text-right`}>Position</th>
                </>
              )}
              <th className={`${th} text-right`}>Get started</th>
              <th className={`${th} text-right`}>Sign-ups</th>
              {hasIndex && <th className={th}>Google index</th>}
            </tr>
          </thead>
          <tbody className="ds-divide">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="ds-small px-4 py-8 text-center">
                  Nothing yet.
                </td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr
                key={r.path}
                className="transition-colors hover:bg-[color:var(--ds-surface-2)]"
              >
                <td className="max-w-[360px] truncate px-4 py-2.5">
                  <a
                    href={`https://workbenchfsm.com${r.path}`}
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-[color:var(--ds-ink)] hover:text-[color:var(--ds-primary)]"
                  >
                    {r.path}
                  </a>
                </td>
                <td className={`ds-num ${td} text-right`}>
                  {cf ? n(r.pageViews) : "—"}
                </td>
                <td className={`ds-num ${td} text-right`}>
                  {cf ? n(r.visits) : "—"}
                </td>
                {hasSearch && (
                  <>
                    <td className={`ds-num ${td} text-right`}>{n(r.clicks)}</td>
                    <td className={`ds-num ${td} text-right`}>
                      {n(r.impressions)}
                    </td>
                    <td className={`ds-num ${td} text-right`}>
                      {r.position != null ? r.position.toFixed(1) : "—"}
                    </td>
                  </>
                )}
                <td className={`ds-num ${td} text-right`}>{n(r.getStarted)}</td>
                <td
                  className={`ds-num ${td} text-right font-semibold`}
                  style={
                    r.signups ? { color: "var(--ds-good)" } : undefined
                  }
                >
                  {n(r.signups)}
                </td>
                {hasIndex && (
                  <td className={td}>
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
      </Card>

      <div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-2">
        <section>
          <SectionTitle
            info={`The last 14 days. Visits are Cloudflare's estimate${hasSearch ? ", search clicks Google's (about two days behind)" : ""}, the rest ours.`}
          >
            By day
          </SectionTitle>
          <Card className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
                  <th className="px-4 py-2.5 font-medium">Day</th>
                  <th className={`${th} text-right`}>Visits</th>
                  {hasSearch && (
                    <th className={`${th} text-right`}>Search</th>
                  )}
                  <th className={`${th} text-right`}>Get started</th>
                  <th className={`${th} text-right`}>Sign-ups</th>
                </tr>
              </thead>
              <tbody className="ds-divide">
                {dayRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ds-small px-4 py-8 text-center">
                      Nothing yet.
                    </td>
                  </tr>
                )}
                {dayRows.map((r) => (
                  <tr key={r.d}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-[color:var(--ds-ink)]">
                      {dayLabel(r.d)}
                    </td>
                    <td className={`ds-num ${td} text-right`}>
                      {cf ? n(r.visits) : "—"}
                    </td>
                    {hasSearch && (
                      <td className={`ds-num ${td} text-right`}>
                        {n(r.search)}
                      </td>
                    )}
                    <td className={`ds-num ${td} text-right`}>
                      {n(r.getStarted)}
                    </td>
                    <td
                      className={`ds-num ${td} text-right font-semibold`}
                      style={
                        r.signups ? { color: "var(--ds-good)" } : undefined
                      }
                    >
                      {n(r.signups)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        {gsc && (
          <section>
            <SectionTitle info="What people typed into Google to find the site, from Search Console.">
              Search queries
            </SectionTitle>
            <Card className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
                    <th className="px-4 py-2.5 font-medium">Query</th>
                    <th className={`${th} text-right`}>Clicks</th>
                    <th className={`${th} text-right`}>Impressions</th>
                    <th className={`${th} text-right`}>CTR</th>
                    <th className={`${th} text-right`}>Position</th>
                  </tr>
                </thead>
                <tbody className="ds-divide">
                  {gsc.queries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="ds-small px-4 py-8 text-center">
                        Nothing yet.
                      </td>
                    </tr>
                  )}
                  {gsc.queries.slice(0, 25).map((q) => (
                    <tr key={q.key}>
                      <td className="max-w-[260px] truncate px-4 py-2.5 font-medium text-[color:var(--ds-ink)]">
                        {q.key}
                      </td>
                      <td className={`ds-num ${td} text-right`}>{n(q.clicks)}</td>
                      <td className={`ds-num ${td} text-right`}>
                        {n(q.impressions)}
                      </td>
                      <td className={`ds-num ${td} text-right`}>{pct(q.ctr)}</td>
                      <td className={`ds-num ${td} text-right`}>
                        {q.position.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {searchConsoleConfigured() && (
          <section>
            <SectionTitle info="Sitemap pages Google has not indexed, with its reason. A few pages are checked each hour by the cron.">
              Not indexed
            </SectionTitle>
            <Card className="overflow-x-auto">
              {indexRows.length === 0 ? (
                <p className="ds-small px-4 py-8 text-center">
                  No pages checked yet; the first batch lands within the hour.
                </p>
              ) : notIndexed.length === 0 ? (
                <p className="ds-small px-4 py-8 text-center">
                  Every checked page is indexed.
                </p>
              ) : (
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
                      <th className="px-4 py-2.5 font-medium">Page</th>
                      <th className={th}>Google says</th>
                      <th className={`${th} text-right`}>Last crawl</th>
                    </tr>
                  </thead>
                  <tbody className="ds-divide">
                    {notIndexed.map((r) => (
                      <tr key={r.url}>
                        <td className="max-w-[240px] truncate px-4 py-2.5 font-medium text-[color:var(--ds-ink)]">
                          {r.path}
                        </td>
                        <td className={td}>{r.coverageState ?? r.verdict}</td>
                        <td className={`ds-num ${td} whitespace-nowrap text-right`}>
                          {r.lastCrawlTime
                            ? dayLabel(r.lastCrawlTime.toISOString().slice(0, 10))
                            : "never"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {gsc && gsc.sitemaps.length > 0 && (
                <p className="ds-small border-t border-[color:var(--ds-line)] px-4 py-3">
                  {gsc.sitemaps
                    .map(
                      (s) =>
                        `${s.path.replace(/^https?:\/\/[^/]+/, "")}: ${s.submitted} submitted, ${s.indexed} indexed${s.errors ? `, ${s.errors} errors` : ""}, last read ${s.lastDownloaded ? dayLabel(s.lastDownloaded.slice(0, 10)) : "never"}`,
                    )
                    .join(" · ")}
                </p>
              )}
            </Card>
          </section>
        )}

        {smallTables.map((t) => (
          <section key={t.title}>
            <SectionTitle info={t.hint}>{t.title}</SectionTitle>
            <Card className="overflow-x-auto">
              {t.rows.length === 0 ? (
                <p className="ds-small px-4 py-8 text-center">
                  {t.empty ?? "Nothing yet."}
                </p>
              ) : (
                <TwoCol rows={t.rows} col={t.col} count={t.count ?? "Count"} />
              )}
            </Card>
          </section>
        ))}
      </div>
    </DsPage>
  );
}

function TwoCol({
  rows,
  col,
  count,
}: {
  rows: Row[];
  col: string;
  count: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <table className="w-full text-[13.5px]">
      <thead>
        <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
          <th className="px-4 py-2.5 font-medium">{col}</th>
          <th className="w-28 px-3 py-2.5 text-right font-medium">{count}</th>
        </tr>
      </thead>
      <tbody className="ds-divide">
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="px-4 py-2.5">
              <span className="block max-w-[360px] truncate font-medium text-[color:var(--ds-ink)]">
                {r.key}
              </span>
              <span className="mt-1.5 block h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-[color:var(--ds-line)]">
                <span
                  className="block h-full rounded-full bg-[color:var(--ds-primary)]"
                  style={{ width: `${Math.max(3, Math.round((r.count / max) * 100))}%` }}
                />
              </span>
            </td>
            <td className="ds-num px-3 py-2.5 text-right align-top">
              {n(r.count)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
