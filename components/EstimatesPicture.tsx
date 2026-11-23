import Link from "next/link";
import { Picture, PicLink } from "@/components/ListBands";

/**
 * Estimates (round 7, 2026-11-23): every quote your tools priced in the last
 * 60 days, as one dot each on a price line — low to high — stacked where
 * prices sit close. Green = won, blue = out with the client, hollow = still a
 * draft, grey = changes asked / archived. The picture is the work the tools
 * did, not a count of them.
 */
export type PricedQuote = { id: string; total: number; status: string; client: string; tool: string; number: string };

const LANES = 5;
const BINS = 48;

function money(n: number) {
  return n >= 10000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n).toLocaleString("en-US")}`;
}

function tone(status: string) {
  if (status === "APPROVED" || status === "CONVERTED") return "won";
  if (status === "AWAITING_RESPONSE") return "out";
  if (status === "DRAFT") return "draft";
  return "quiet";
}

const TONE_WORD: Record<string, string> = { won: "won", out: "waiting on the client", draft: "draft", quiet: "changes asked or archived" };

export default function EstimatesPicture({ quotes, leads, days = 60 }: { quotes: PricedQuote[]; leads: number; days?: number }) {
  const priced = quotes.filter((q) => q.total > 0);
  const won = priced.filter((q) => tone(q.status) === "won");
  const sorted = [...priced].sort((a, b) => a.total - b.total);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].total : 0;

  const title =
    priced.length === 0 ? (
      <>
        Nothing priced by your tools in the last {days} days
      </>
    ) : (
      <>
        <b>{priced.length}</b> {priced.length === 1 ? "job" : "jobs"} priced by your tools
        <span className="ds-pic-quiet"> · {days} days · typical {money(median)}</span>
      </>
    );

  const aside = (
    <>
      {won.length > 0 && <span className="ds-pic-quiet"><b className="text-[color:var(--ds-good)]">{won.length}</b> won</span>}
      {leads > 0 && <PicLink href="/app/requests">{leads} website {leads === 1 ? "lead" : "leads"}</PicLink>}
    </>
  );

  if (priced.length === 0) {
    return (
      <Picture title={title} aside={aside}>
        <div className="ds-eprice is-empty" aria-hidden>
          <div className="ds-eprice-axis" />
        </div>
        <p className="ds-small mt-2">Run a tool on a job and the quote it starts lands here, placed by its price.</p>
      </Picture>
    );
  }

  // log scale when prices spread wide (a $90 gutter clean next to a $14k roof), else linear
  const lo = sorted[0].total;
  const hi = sorted[sorted.length - 1].total;
  const useLog = hi / Math.max(lo, 1) > 15;
  const f = (v: number) => (useLog ? Math.log(Math.max(v, 1)) : v);
  const span = f(hi) - f(lo);
  const x = (v: number) => (span === 0 ? 50 : 3 + ((f(v) - f(lo)) / span) * 94);

  // stack dots that land in the same bin; past the top lane they fold into "+n"
  const bins = new Map<number, PricedQuote[]>();
  for (const q of sorted) {
    const b = Math.round((x(q.total) / 100) * BINS);
    bins.set(b, [...(bins.get(b) ?? []), q]);
  }

  return (
    <Picture title={title} aside={aside}>
      <div className="ds-eprice" role="list" aria-label="Quotes from your tools, by price">
        <div className="ds-eprice-axis" aria-hidden />
        <span className="ds-eprice-mid" style={{ left: `${x(median)}%` }} aria-hidden>
          <span>typical</span>
        </span>
        {[...bins.values()].flatMap((group) =>
          group.slice(0, LANES).map((q, lane) => (
            <Link
              key={q.id}
              href={`/app/quotes/${q.id}`}
              prefetch={false}
              role="listitem"
              className={`ds-eprice-dot is-${tone(q.status)}`}
              style={{ left: `${x(q.total)}%`, "--lane": lane } as React.CSSProperties}
              title={`${money(q.total)} · ${q.client} · ${q.tool} · ${TONE_WORD[tone(q.status)]} (#${q.number})`}
              aria-label={`${money(q.total)}, ${q.client}, ${TONE_WORD[tone(q.status)]}`}
            />
          )).concat(
            group.length > LANES
              ? [
                  <span key={`${group[0].id}-more`} className="ds-eprice-more" style={{ left: `${x(group[0].total)}%` }}>
                    +{group.length - LANES}
                  </span>,
                ]
              : [],
          ),
        )}
        <span className="ds-eprice-end is-lo">{money(lo)}</span>
        <span className="ds-eprice-end is-hi">{money(hi)}</span>
      </div>
      <div className="ds-eprice-key" aria-hidden>
        <span><i className="is-won" />Won</span>
        <span><i className="is-out" />Waiting</span>
        <span><i className="is-draft" />Draft</span>
        <span><i className="is-quiet" />Changes / archived</span>
      </div>
    </Picture>
  );
}
