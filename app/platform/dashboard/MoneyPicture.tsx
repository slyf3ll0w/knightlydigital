import Link from "next/link";
import { ChevronRight } from "lucide-react";
import Monogram from "@/components/Monogram";

/**
 * Home's money picture (heavy pilot round 6), replacing the row of three
 * number cards: the month drawn as a running total of what came in (last
 * month's pace as a faint dashed line behind it, today marked), then two
 * sentences that carry their own shapes — who owes you, as their circles,
 * and what's booked this week, as seven day bars.
 *
 * One hue per mark (dataviz rule): the primary line, a neutral ghost.
 * Styles: .hm-money* in app/ds-home.css.
 */

export type MoneyDay = { label: string; amount: number };
export type Owing = { id: string; name: string; amount: number };
export type BookedDay = { key: string; dow: string; amount: number; jobs: number; today: boolean; past: boolean; href: string };

const W = 1000;
const H = 200;

const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function cumulative(values: number[]): number[] {
  let s = 0;
  return values.map((v) => (s += v));
}

export default function MoneyPicture({
  monthName,
  days,
  todayIndex,
  lastMonth,
  owed,
  owedClients,
  owingCount,
  pastDue,
  booked,
  bookedJobs,
  week,
  phone = false,
}: {
  monthName: string;
  /** every day of this month; days after today are 0 */
  days: MoneyDay[];
  todayIndex: number;
  /** last month's daily takings, day 1 onward */
  lastMonth: number[];
  owed: number;
  owedClients: Owing[];
  owingCount: number;
  pastDue: number;
  booked: number;
  bookedJobs: number;
  week: BookedDay[];
  phone?: boolean;
}) {
  const run = cumulative(days.map((d) => d.amount));
  const so = cumulative(days.slice(0, todayIndex + 1).map((d) => d.amount));
  const total = so[so.length - 1] ?? 0;
  const ghost = cumulative(lastMonth.slice(0, days.length));
  const lastByNow = ghost[Math.min(todayIndex, ghost.length - 1)] ?? 0;
  const max = Math.max(1, total, ...ghost) * 1.12;
  const n = days.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = so.length > 0 ? `${line(so)} L${x(so.length - 1).toFixed(1)},${H} L0,${H} Z` : "";
  const dotX = (x(todayIndex) / W) * 100;
  const dotY = (y(total) / H) * 100;
  const dayOrd = todayIndex + 1;
  const ord = dayOrd % 10 === 1 && dayOrd !== 11 ? "st" : dayOrd % 10 === 2 && dayOrd !== 12 ? "nd" : dayOrd % 10 === 3 && dayOrd !== 13 ? "rd" : "th";
  const pace = lastByNow > 0 ? Math.round(((total - lastByNow) / lastByNow) * 100) : null;
  const weekMax = Math.max(1, ...week.map((d) => d.amount));

  return (
    <section className={`ds-pic ds-rise hm-money ${phone ? "is-phone" : ""}`} style={{ "--ds-i": 2 } as React.CSSProperties}>
      <div className="ds-pic-head">
        <h2 className="ds-pic-title">
          <Link prefetch={false} href="/app/invoices" className="hm-money-total">
            <b>{dollars(total)}</b>
          </Link>{" "}
          collected so far in {monthName}
        </h2>
        {lastMonth.some((v) => v > 0) && (
          <p className="hm-money-pace">
            <span className="hm-money-pace-key" aria-hidden />
            Last month by the {dayOrd}
            {ord}: <b>{dollars(lastByNow)}</b>
            {pace != null && pace !== 0 && (
              <span className={pace > 0 ? "is-up" : "is-down"}>
                {pace > 0 ? "▲" : "▼"} {Math.abs(pace)}%
              </span>
            )}
          </p>
        )}
      </div>

      <div className="hm-money-chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="hm-money-svg" aria-hidden>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="hm-money-grid" />
          ))}
          {ghost.length > 1 && <path d={line(ghost)} className="hm-money-ghost" />}
          {area && <path d={area} className="hm-money-area" />}
          {so.length > 1 && <path d={line(so)} className="hm-money-line" />}
          <line x1={x(todayIndex)} x2={x(todayIndex)} y1={y(total)} y2={H} className="hm-money-drop" />
        </svg>
        <span className="hm-money-dot" style={{ left: `${dotX}%`, top: `${dotY}%` }} aria-hidden />
        <span
          className={`hm-money-flag ${dotX > 70 ? "is-left" : ""}`}
          style={{ left: `${dotX}%`, top: `${dotY}%` }}
          aria-hidden
        >
          Today
        </span>
        {/* hover a day for its takings */}
        <span className="hm-money-cols" role="img" aria-label={`${dollars(total)} collected in ${monthName} through today`}>
          {days.map((d, i) => (
            <span
              key={i}
              className={`hm-money-col ${i > todayIndex ? "is-ahead" : ""}`}
              title={i > todayIndex ? d.label : `${d.label}: ${dollars(d.amount)} that day · ${dollars(run[i])} so far`}
            />
          ))}
        </span>
      </div>
      <div className="hm-money-axis" aria-hidden>
        <span>{days[0]?.label}</span>
        {!phone && <span>{days[Math.floor((n - 1) / 2)]?.label}</span>}
        <span>{days[n - 1]?.label}</span>
      </div>

      <div className="hm-money-foot">
        <Link prefetch={false} href="/app/invoices?status=AWAITING_PAYMENT" className="hm-money-read">
          <span className="hm-money-read-text">
            {owed > 0 ? (
              <>
                <b className={pastDue > 0 ? "is-bad" : ""}>{dollars(owed)}</b> owed by {owingCount}{" "}
                {owingCount === 1 ? "client" : "clients"}
                {pastDue > 0 && <span className="hm-money-late"> · {pastDue} past due</span>}
              </>
            ) : (
              <>Nobody owes you right now</>
            )}
            <ChevronRight size={14} strokeWidth={2.4} aria-hidden />
          </span>
          {owedClients.length > 0 && (
            <span className="hm-money-faces">
              {owedClients.map((c) => (
                <span key={c.id} className="hm-money-face" title={`${c.name}: ${dollars(c.amount)}`}>
                  <Monogram name={c.name} size={30} />
                </span>
              ))}
              {owingCount > owedClients.length && (
                <span className="hm-money-face hm-money-more">+{owingCount - owedClients.length}</span>
              )}
            </span>
          )}
        </Link>

        <div className="hm-money-read">
          <Link prefetch={false} href="/app/jobs" className="hm-money-read-text">
            <b>{dollars(booked)}</b> booked this week
            <span className="ds-pic-quiet">
              {" "}
              · {bookedJobs} {bookedJobs === 1 ? "job" : "jobs"}
            </span>
            <ChevronRight size={14} strokeWidth={2.4} aria-hidden />
          </Link>
          <span className="hm-money-week">
            {week.map((d) => (
              <Link
                key={d.key}
                prefetch={false}
                href={d.href}
                className={`hm-money-wday ${d.today ? "is-today" : ""} ${d.past ? "is-past" : ""}`}
                title={`${d.dow}: ${dollars(d.amount)} · ${d.jobs} ${d.jobs === 1 ? "job" : "jobs"}`}
                aria-label={`${d.dow}: ${dollars(d.amount)} booked`}
              >
                <span className="hm-money-wtrack">
                  <span
                    className="hm-money-wbar"
                    style={{ height: d.amount > 0 ? `${Math.max(12, (d.amount / weekMax) * 100)}%` : "2px" }}
                  />
                </span>
                <span className="hm-money-wdow">{d.dow.slice(0, 1)}</span>
              </Link>
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}
