"use client";

import { Check, Info, Pause, Pencil, Repeat, RotateCw, X } from "lucide-react";
import { Title } from "@/components/wb/WBAppJourney";
import "../wb-open.css";
import { money } from "@/lib/statuses";
import WBAppFrame, { PhoneApp } from "./WBAppFrame";
import { Fit, Phone, useNarrow, useDemoLoop } from "./kit";

/**
 * The real Recurring page (app/platform/subscriptions, nav Money →
 * Recurring) with the client's series on it, in the real AppShell; on
 * phones the same page in the phone tree.
 *
 * billing "visit" — a per-visit series ("$95.00 per visit · bills on
 * completion"): the owner opens the row's inline edit, sets the visit
 * schedule (Repeats, Next visit, Time, Length, who gets the visits),
 * saves, and the row reads "visits every 2 weeks · Next visit: …" with the
 * page's real flash "4 upcoming visits added to the schedule." (each visit
 * then bills itself when it is completed).
 *
 * billing "monthly" — per-visit price, one invoice a month ("billed
 * monthly", Bills: the 1st): as the month's visits are completed the
 * Ready to bill card counts them up; then Bill now → "Invoice generated."
 * and the next billing date moves on a month.
 *
 * Rests on the finished state under reduced motion.
 */

const DEFAULTS = {
  client: "Marcus Bell",
  service: "Lighting maintenance",
  cadence: "Every 2 weeks",
  price: 95,
  visits: ["Nov 4", "Nov 18", "Dec 2", "Dec 16"],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 4" → "Nov 4, 2026"; anything else ("Tue 4") → that day in November. */
function fullDate(label: string): string {
  const [w, d] = label.split(" ");
  if (MONTHS.includes(w) && d) return `${w} ${d}, 2026`;
  const n = label.match(/\d+/)?.[0] ?? "4";
  return `Nov ${n}, 2026`;
}
function isoOf(label: string): string {
  const [w, d] = fullDate(label).replace(",", "").split(" ");
  return `${String(MONTHS.indexOf(w) + 1).padStart(2, "0")}/${d.padStart(2, "0")}/2026`;
}

type Row = { name: string; client: string; sub: string; visits?: string; bills?: string; next?: string; billNow?: boolean };

const OTHERS: Row[] = [
  { name: "Maintenance plan", client: "Derek Olsen", sub: "Monthly plan · $49.00", bills: "Dec 1, 2026", billNow: true },
  { name: "Seasonal check-up", client: "Olivia Park", sub: "Quarterly plan · $189.00", bills: "Jan 12, 2027", billNow: true },
  { name: "Maintenance plan", client: "Hannah Brooks", sub: "Monthly plan · $49.00", bills: "Dec 3, 2026", billNow: true },
];

export default function WBDemoRecurring({
  client = DEFAULTS.client,
  service = DEFAULTS.service,
  cadence = DEFAULTS.cadence,
  price = DEFAULTS.price,
  billing = "visit",
  visits = DEFAULTS.visits,
  month = "November",
}: {
  client?: string;
  service?: string;
  cadence?: string;
  price?: number;
  billing?: "visit" | "monthly";
  /** date labels, "Nov 4" style; up to six are used */
  visits?: string[];
  /** the month the consolidated invoice is for (monthly billing) */
  month?: string;
} = {}) {
  const vs = visits.slice(0, 6);
  const n = Math.max(1, vs.length);
  // visit: 1 edit opens · 2 Repeats set · 3 Save pressed · 4 saved + flash
  // monthly: 1..n visits completed · n+1 Bill now pressed · n+2 billed
  const times =
    billing === "visit" ? [1200, 2600, 4200, 4700] : [...vs.map((_, k) => 1000 + k * 1100), 1000 + n * 1100 + 600, 1000 + n * 1100 + 1100];
  const cycle = billing === "visit" ? 10000 : 1000 + n * 1100 + 5200;
  const { ref, b } = useDemoLoop(times, cycle);

  const state: SeriesState =
    billing === "visit"
      ? { mode: "visit", editing: b >= 1 && b < 4, repeats: b >= 2, saving: b === 3, saved: b >= 4 }
      : { mode: "monthly", done: Math.min(n, b), pressing: b === n + 1, billed: b >= n + 2 };

  const props = { client, service, cadence, price, vs, month, state };
  const wide = useNarrow(560);
  return (
    <div ref={ref}>
      <div ref={wide.ref}>
      <div className={wide.narrow ? "hidden" : "max-lg:hidden"}>
        <WBAppFrame nav="Recurring" real height={500} designWidth={880}>
          <RecurringPage {...props} />
        </WBAppFrame>
      </div>
      <div className={wide.narrow ? "flex justify-center" : "flex justify-center lg:hidden"}>
        <Phone width={300} height={620} ios>
          <Fit width={390}>
            <PhoneApp height={Math.round(((620 - 74) * 390) / 282)}>
              <RecurringPage {...props} phone />
            </PhoneApp>
          </Fit>
        </Phone>
      </div>
      </div>
    </div>
  );
}

type SeriesState =
  | { mode: "visit"; editing: boolean; repeats: boolean; saving: boolean; saved: boolean }
  | { mode: "monthly"; done: number; pressing: boolean; billed: boolean };

function RecurringPage({
  client,
  service,
  cadence,
  price,
  vs,
  state,
  phone = false,
}: {
  client: string;
  service: string;
  cadence: string;
  price: number;
  vs: string[];
  month: string;
  state: SeriesState;
  phone?: boolean;
}) {
  const visitsLine = `visits ${cadence.toLowerCase()}`;
  const flash =
    state.mode === "visit"
      ? state.saved
        ? `${Math.min(4, vs.length)} upcoming visit${Math.min(4, vs.length) === 1 ? "" : "s"} added to the schedule.`
        : ""
      : state.billed
        ? "Invoice generated."
        : "";

  const mine: Row =
    state.mode === "visit"
      ? {
          name: service,
          client,
          sub: `${money(price)} per visit · bills on completion`,
          visits: state.saved ? visitsLine : undefined,
          next: state.saved ? fullDate(vs[0] ?? "Nov 4") : undefined,
        }
      : {
          name: service,
          client,
          sub: `${money(price)} per visit · billed monthly`,
          visits: visitsLine,
          bills: state.billed ? "Jan 1, 2027" : "Dec 1, 2026",
          next: fullDate(vs[Math.min(state.done, vs.length - 1)] ?? vs[0] ?? "Nov 4"),
          billNow: true,
        };
  const ready = state.mode === "monthly" && !state.billed ? state.done : 0;

  return (
    <div className={phone ? "p-4" : "wb-open mx-auto w-full max-w-6xl px-8 pb-10 pt-8"}>
      <div className="mb-6 flex items-start justify-between gap-3">
        {phone ? (
          <h1 className="ds-title flex items-center gap-2 !text-[28px]">
            Recurring
            <Info size={15} className="text-[color:var(--ds-faint)]" />
          </h1>
        ) : (
          <Title info eyebrow="4 plans · $1,860 a month">Recurring</Title>
        )}
        <div className="flex items-center gap-2">
          <span className="ds-btn ds-btn-outline shrink-0">
            <RotateCw size={14} />
            {phone ? "Run" : "Run due now"}
          </span>
          <span className="ds-btn ds-btn-primary shrink-0">
            <Repeat size={14} />
            {phone ? "New" : "New plan"}
          </span>
        </div>
      </div>

      {flash && (
        <div key={flash} className="wb-row-in mb-4 rounded-lg bg-[color:var(--ds-good-soft)] px-4 py-3 text-sm text-[color:var(--ds-good)]">
          {flash}
        </div>
      )}

      {ready > 0 && (
        <div className="ds-card wb-row-in mb-6 overflow-hidden">
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--ds-line)] bg-[color:var(--ds-primary-soft)] py-3.5 ${phone ? "px-4" : "px-5"}`}>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ds-ink)]">
                <span>
                  Ready to bill <span key={ready} className="numeral-ledger wb-pop-in inline-block">{money(ready * price)}</span>
                </span>
                <Info size={14} className="text-[color:var(--ds-faint)]" />
              </p>
              <p className="text-xs text-[color:var(--ds-muted)]">
                {ready} completed visit{ready === 1 ? "" : "s"} · 1 client
              </p>
            </div>
            <span className="ds-btn ds-btn-primary ds-btn-sm">Bill ready work</span>
          </div>
          <div className="divide-y divide-gray-100">
            <div className={`flex items-center gap-3 py-2.5 text-sm ${phone ? "px-4" : "px-5"}`}>
              <span className="min-w-0 flex-1 truncate text-gray-800">{client}</span>
              <span className="text-xs text-gray-500">
                {ready} visit{ready === 1 ? "" : "s"}
              </span>
              <span className="numeral-ledger text-sm font-semibold text-gray-900">{money(ready * price)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="ds-card overflow-hidden">
          <div className="divide-y divide-gray-100">
            {state.mode === "visit" && state.editing ? (
              <EditForm key="edit" service={service} price={price} cadence={cadence} first={vs[0] ?? "Nov 4"} repeats={state.repeats} saving={state.saving} phone={phone} />
            ) : (
              <SeriesRow row={mine} phone={phone} pressing={state.mode === "monthly" && state.pressing} />
            )}
            {OTHERS.filter((r) => r.client !== client)
              .slice(0, 2)
              .map((r) => (
                <SeriesRow key={r.client} row={r} phone={phone} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SeriesRow({ row, phone, pressing = false }: { row: Row; phone: boolean; pressing?: boolean }) {
  const amount = row.sub.match(/\$[\d,.]+/)?.[0] ?? "";
  if (phone) {
    const kind = row.sub.includes("per visit") ? "Per-job billing" : row.sub.split(" · ")[0];
    return (
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900">{row.name}</p>
          <p className="numeral-ledger shrink-0 text-sm font-semibold text-gray-900">{amount}</p>
        </div>
        <p className="mt-1 min-w-0 truncate text-xs text-gray-500">
          {row.client} · {kind}
          {row.visits && <span className="text-[color:var(--ds-primary)]"> · {row.visits}</span>}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {row.bills && (
            <>
              Bills <span className="font-medium text-gray-700">{row.bills}</span>
            </>
          )}
          {row.next && (
            <>
              {row.bills ? " · " : ""}Next visit <span className="font-medium text-gray-700">{row.next}</span>
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600">
            <Pencil size={13} />
            Edit
          </span>
          {row.billNow && (
            <span className={`relative flex h-10 items-center rounded-[10px] bg-[color:var(--ds-primary-soft)] px-3 text-xs font-medium text-[color:var(--ds-primary)] ${pressing ? "opacity-80" : ""}`}>
              Bill now
              {pressing && <span className="wb-demo-tap left-1/2 top-1/2" />}
            </span>
          )}
          <span className="flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600">
            <Pause size={13} />
            Pause
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400">
            <X size={16} />
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">
            {row.client} · {row.sub}
            {row.visits && <span key={row.visits} className="text-[color:var(--ds-primary)]"> · {row.visits}</span>}
          </p>
        </div>
        <div className="whitespace-nowrap text-right text-xs text-gray-500">
          {row.bills && (
            <div>
              Bills: <span key={row.bills} className="wb-pop-in inline-block font-medium text-gray-700">{row.bills}</span>
            </div>
          )}
          {row.next && (
            <div>
              Next visit: <span className="font-medium text-gray-700">{row.next}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-full p-1.5 text-gray-400">
            <Pencil size={14} />
          </span>
          {row.billNow && (
            <span className={`ds-btn ds-btn-soft ds-btn-sm relative ${pressing ? "scale-[0.97]" : ""}`}>
              Bill now
              {pressing && <span className="wb-demo-tap left-1/2 top-1/2" />}
            </span>
          )}
          <span className="rounded-full p-1.5 text-gray-400">
            <Pause size={14} />
          </span>
          <span className="rounded-full p-1.5 text-gray-400">
            <X size={14} />
          </span>
        </div>
      </div>
    </div>
  );
}

const FIELD = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900";

/** The row's inline edit form (SubscriptionsClient editId branch). */
function EditForm({
  service,
  price,
  cadence,
  first,
  repeats,
  saving,
  phone,
}: {
  service: string;
  price: number;
  cadence: string;
  first: string;
  repeats: boolean;
  saving: boolean;
  phone: boolean;
}) {
  return (
    <div className={`wb-row-in space-y-3 bg-gray-50/70 py-4 ${phone ? "px-4" : "px-5"}`}>
      <div className={`grid gap-2 ${phone ? "grid-cols-2" : "grid-cols-5"}`}>
        <div className="col-span-2">
          <label className="mb-0.5 block text-xs text-gray-500">Name</label>
          <div className={`${FIELD} truncate`}>{service}</div>
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-gray-500">Price per visit</label>
          <div className={FIELD}>{price}</div>
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-gray-500">Qty</label>
          <div className={FIELD}>1</div>
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block truncate text-xs text-gray-500">Autopay card</label>
          <div className={`${FIELD} truncate`}>Default card (Visa •••• 4242)</div>
        </div>
      </div>
      <div className="border-t border-gray-200 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-gray-500">
          Visit schedule
          {repeats && <Info size={14} className="text-[color:var(--ds-faint)]" />}
        </p>
        <div className={`grid gap-2 ${phone ? "grid-cols-2" : "grid-cols-4"}`}>
          <div className={phone ? "col-span-2" : ""}>
            <label className="mb-0.5 block text-xs text-gray-500">Repeats</label>
            <div key={String(repeats)} className={`${FIELD} ${repeats ? "wb-pop-in ring-2 ring-[color:var(--ds-primary)]" : ""}`}>{repeats ? cadence : "No repeating visits"}</div>
          </div>
          {repeats && (
            <>
              <div className="wb-row-in">
                <label className="mb-0.5 block text-xs text-gray-500">Next visit</label>
                <div className={FIELD}>{isoOf(first)}</div>
              </div>
              <div className="wb-row-in">
                <label className="mb-0.5 block text-xs text-gray-500">Time</label>
                <div className={FIELD}>9:00 AM</div>
              </div>
              <div className="wb-row-in">
                <label className="mb-0.5 block text-xs text-gray-500">Length</label>
                <div className={FIELD}>1 hour</div>
              </div>
            </>
          )}
        </div>
        {repeats && (
          <div className="wb-row-in mt-2">
            <label className="mb-1 block text-xs text-gray-500">Assign visits to</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {["Jordan Reyes", "Mike Delgado", "Sam Whitaker"].map((u) => (
                <span key={u} className="flex items-center gap-1.5 text-xs text-gray-700">
                  <input type="checkbox" checked={u === "Sam Whitaker"} readOnly tabIndex={-1} className="accent-[color:var(--ds-primary)]" />
                  {u}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">Changes apply from the next billing run — invoices already generated keep their amounts.</p>
      <div className="flex items-center gap-1.5">
        <span className={`ds-btn ds-btn-primary ds-btn-sm relative ${saving ? "scale-[0.97]" : ""}`}>
          <Check size={11} />
          Save
          {saving && <span className="wb-demo-tap left-1/2 top-1/2" />}
        </span>
        <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-gray-500">
          <X size={11} />
          Cancel
        </span>
      </div>
    </div>
  );
}
