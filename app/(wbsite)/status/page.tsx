import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBHero from "@/components/wb/WBHero";
import { loadPlatformStatus, type ComponentState } from "@/lib/platform-status";
import { WB_EMAIL, WB_EMAIL_HREF } from "@/lib/wb-site";

export const metadata: Metadata = {
  title: "Status",
  description: "Live status of WorkBench: the web app, the database and the hourly automations.",
};

// Every view is a fresh check — never a cached "all good".
export const dynamic = "force-dynamic";

/* Public status page. It is served by WorkBench itself, which is the honest
   limit: it can tell you about a slow database or stalled automations while
   the site is up, and if the site is down this page is down with it (the copy
   says so and gives the way to reach us). An off-platform monitor is the
   complement, not a replacement — see docs/runbook.md. */

const ACCENT = "#0B57D8";

const LOOK: Record<ComponentState, { label: string; dot: string; pill: string }> = {
  operational: { label: "Operational", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  degraded: { label: "Degraded", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  down: { label: "Down", dot: "bg-red-500", pill: "bg-red-50 text-red-700 ring-red-200" },
};

const HEADLINE: Record<ComponentState, { lead: string; accent: string; sub: string }> = {
  operational: { lead: "All systems", accent: "operational", sub: "Everything we check is responding normally." },
  degraded: { lead: "Some systems", accent: "need attention", sub: "WorkBench is up, but part of it is slower or later than it should be. We are on it." },
  down: { lead: "Part of WorkBench", accent: "is down", sub: "Something we depend on is not responding. We are on it." },
};

function stamp(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default async function StatusPage() {
  const status = await loadPlatformStatus();
  const head = HEADLINE[status.overall];

  return (
    <>
      {/* Re-check every minute while the tab is open */}
      <meta httpEquiv="refresh" content="60" />

      {/* ── Hero ── */}
      <WBHero>
        <div className="max-w-3xl">
          <AnimateIn>
            <p className="wb-label mb-4" style={{ color: ACCENT }}>
              Status
            </p>
            <h1 className="flex flex-wrap items-center gap-x-3 text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              <span className={`inline-block h-4 w-4 rounded-full ${LOOK[status.overall].dot}`} aria-hidden />
              <span>
                {head.lead} <span style={{ color: ACCENT }}>{head.accent}</span>
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-gray-600">{head.sub}</p>
            <p className="mt-3 text-sm text-gray-500">
              Checked {stamp(status.checkedAt)} · refreshes every minute
            </p>
          </AnimateIn>
        </div>
      </WBHero>

      {/* ── Components ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <AnimateIn>
            <ul className="divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200">
              {status.components.map((c) => {
                const look = LOOK[c.state];
                return (
                  <li key={c.key} className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-gray-900">{c.name}</p>
                      <p className="mt-1 text-sm leading-relaxed text-gray-500">{c.description}</p>
                      <p className="mt-2 text-sm text-gray-600">{c.detail}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full px-3 py-1 text-xs font-bold ring-1 ${look.pill}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${look.dot}`} aria-hidden />
                      {look.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </AnimateIn>

          <AnimateIn>
            <div className="mt-10 rounded-2xl border border-blue-100 bg-blue-50/60 px-5 py-4">
              <p className="text-[15px] leading-relaxed text-gray-700">
                <span className="font-bold text-gray-900">If this page will not load,</span> WorkBench is down
                and so is this page — it runs on the same servers. Email{" "}
                <a href={WB_EMAIL_HREF} className="font-semibold underline underline-offset-2" style={{ color: ACCENT }}>
                  {WB_EMAIL}
                </a>{" "}
                and we will answer with what we know. Machine-readable:{" "}
                <Link href="/api/health" className="font-semibold underline underline-offset-2" style={{ color: ACCENT }}>
                  /api/health
                </Link>
                .
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
