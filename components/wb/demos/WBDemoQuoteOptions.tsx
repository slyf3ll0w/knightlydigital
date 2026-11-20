"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Briefcase, CheckCircle, DollarSign, Eye, MoreHorizontal, Pencil } from "lucide-react";
import "@/app/client.css";
import PageTitle from "@/components/PageTitle";
import StatusChip from "@/components/StatusChip";
import { Chip as DsChip } from "@/components/ds";
import {
  ActionBar,
  Button,
  ClientRoot,
  Foot,
  ItemRow,
  ItemsHead,
  Letterhead,
  PreparedFor,
  Receipt,
  Sheet,
  Stamp as ClientStamp,
  Stub,
  TRow,
  Totals,
  money,
} from "@/components/client";
import WBAppFrame, { BRAND } from "./WBAppFrame";
import { Confetti, Fit, Phone, firstName, useDemoLoop } from "./kit";

/**
 * A quote with optional items, as the two real screens show it.
 *
 * LEFT, the client's phone: the real client quote page (app/quote/[token]
 * QuoteAcceptPage, built from components/client). Optional items arrive
 * ticked with a quiet "optional" tag; the client unticks one they don't
 * want (the row greys and strikes through, "Subtotal (n of m items)" and
 * the total follow), types their name to sign, taps "Approve · $total",
 * and the page scrolls back up as the Approved stamp slams onto the sheet
 * with the receipt lines underneath.
 *
 * RIGHT, the owner's desktop: the real quote detail page
 * (app/platform/quotes/[id]) in the real AppShell. The status chip goes
 * from Awaiting Response to Approved, the unticked item reads "Optional —
 * removed by client", the Approved fact and the Collect deposit banner
 * appear, the app's confetti falls (lib/celebrations), and once the
 * deposit invoice is paid the Deposit fact turns green: "$… · Paid (#…)".
 * The deposit is paid on its own invoice (the pay page), not on the quote.
 *
 * Phones show only the client's page. Rests on approved + deposit paid
 * under reduced motion.
 */

export type QuoteLine = { name: string; qty: number; unit: number };
export type QuoteOption = { name: string; unit: number };

const DEFAULTS = {
  client: "Grace Kim",
  title: "Ceiling fan install",
  lines: [
    { name: "Ceiling fan install", qty: 2, unit: 190 },
    { name: "Wiring + new fan-rated box", qty: 1, unit: 140 },
  ] as QuoteLine[],
  options: [
    { name: "Smart wall switch", unit: 85 },
    { name: "Third fan, patio", unit: 210 },
  ] as QuoteOption[],
};

const QUOTE_NO = 1051;
const DEPOSIT_INVOICE_NO = 2048;
const CREATED = "Nov 18, 2026";
const VIEWED = "Nov 19, 2026";
const VALID = "Dec 20, 2026";
const APPROVED_LONG = "November 19, 2026";

// beats: 1 scroll to the items · 2 untick an option · 3 scroll to sign ·
// 4 type the name · 5 press Approve · 6 approved · 7 deposit paid
const TIMES = [1300, 2300, 3500, 4100, 5900, 6400, 8800];
const CYCLE = 12500;

export default function WBDemoQuoteOptions({
  client = DEFAULTS.client,
  title = DEFAULTS.title,
  lines = DEFAULTS.lines,
  options = DEFAULTS.options,
  pick = 0,
  depositPct = 25,
}: {
  client?: string;
  title?: string;
  lines?: QuoteLine[];
  options?: QuoteOption[];
  /** index into `options` of the one the client KEEPS; with two or more
   *  options the client unticks another one (the first that isn't `pick`). */
  pick?: number;
  depositPct?: number;
} = {}) {
  const { ref, b } = useDemoLoop(TIMES, CYCLE);
  // Which optional item the client leaves out (real quotes arrive with every
  // optional item ticked; the client unticks what they don't want).
  const dropIdx = options.length > 1 ? (pick === 0 ? 1 : 0) : -1;
  const dropped = b >= 2 && dropIdx >= 0;
  const approved = b >= 6;
  const depositPaid = b >= 7;

  const optionTotal = options.reduce((a, o, k) => a + (dropped && k === dropIdx ? 0 : o.unit), 0);
  const total = lines.reduce((a, l) => a + l.qty * l.unit, 0) + optionTotal;
  const deposit = Math.round(total * (depositPct / 100) * 100) / 100;
  // The owner's page shows the quote as sent until the client approves it
  const fullTotal = lines.reduce((a, l) => a + l.qty * l.unit, 0) + options.reduce((a, o) => a + o.unit, 0);
  const appTotal = approved ? total : fullTotal;
  const appDeposit = Math.round(appTotal * (depositPct / 100) * 100) / 100;
  const [first, ...rest] = client.split(" ");
  const last = rest.join(" ");

  return (
    <div ref={ref} className="flex items-start justify-center gap-8" aria-hidden>
      <Phone width={290} height={600} className="flex-none">
        <ClientQuotePhone
          b={b}
          person={{ firstName: first, lastName: last }}
          title={title}
          lines={lines}
          options={options}
          dropIdx={dropped ? dropIdx : -1}
          tapIdx={b === 2 ? dropIdx : -1}
          total={total}
          deposit={deposit}
          approved={approved}
        />
      </Phone>

      <div className="min-w-0 flex-1 max-lg:hidden">
        <WBAppFrame nav="Quotes" real height={760} designWidth={1060}>
          <QuoteDetail
            client={client}
            title={title}
            lines={lines}
            options={options}
            dropIdx={approved ? dropIdx : -1}
            total={appTotal}
            deposit={appDeposit}
            depositPct={depositPct}
            approved={approved}
            depositPaid={depositPaid}
          />
          {b === 6 && <Confetti />}
        </WBAppFrame>
      </div>
    </div>
  );
}

/* ── The client's page (app/quote/[token]) ─────────────────────────────── */

const PHONE_VIEW = 754; // visible page height inside the 290×600 phone, in 390-wide px

function ClientQuotePhone({
  b,
  person,
  title,
  lines,
  options,
  dropIdx,
  tapIdx,
  total,
  deposit,
  approved,
}: {
  b: number;
  person: { firstName: string; lastName: string };
  title: string;
  lines: QuoteLine[];
  options: QuoteOption[];
  dropIdx: number;
  tapIdx: number;
  total: number;
  deposit: number;
  approved: boolean;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const stubRef = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);
  const name = `${person.firstName} ${person.lastName}`.trim();
  const typed = useTyping(b >= 4 && !approved, name);

  // Where the page is scrolled for each beat (measured, so any number of lines fits)
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const max = Math.max(0, page.scrollHeight - PHONE_VIEW);
    let target = 0;
    if (!approved && b >= 3 && stubRef.current) target = stubRef.current.offsetTop - 260;
    else if (!approved && b >= 1 && itemsRef.current) target = itemsRef.current.offsetTop - 120;
    setY(Math.max(0, Math.min(max, target)));
  }, [b, approved]);

  const items = [
    ...lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, optional: false, k: -1 })),
    ...options.map((o, k) => ({ name: o.name, qty: 1, unit: o.unit, optional: true, k })),
  ];
  const included = items.filter((it) => !(it.optional && it.k === dropIdx)).length;
  const subtotal = total;

  return (
    <div className="wb-demo-phone h-full overflow-hidden">
      <Fit width={390}>
        <div
          ref={pageRef}
          className="transition-[translate] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ translate: `0 ${-y}px` }}
        >
          <ClientRoot brand={{ name: BRAND.name, brandColor: BRAND.primary, brandColorSecondary: BRAND.secondary, documentColor: BRAND.primary }}>
            <Sheet>
              <Letterhead
                company={{ name: BRAND.name, city: "Plano", state: "TX", zip: "75074" }}
                docType="Quote"
                docNumber={QUOTE_NO}
                meta={["Nov 18, 2026", `Valid through ${VALID}`]}
              />
              <div className="mt-6 flex items-start justify-between gap-4">
                <PreparedFor person={{ ...person, address: "1840 Ridgeview Ln", city: "Plano", state: "TX", zip: "75093", email: `${person.firstName.toLowerCase()}.demo@example.com` }} />
                {approved && (
                  <div className="shrink-0 pt-1">
                    <ClientStamp text="Approved" slam />
                  </div>
                )}
              </div>
              <p className="c-title mt-6">{title}</p>
              <p className="c-body mt-3 whitespace-pre-wrap">
                Thanks for having us out, {person.firstName}. Here is the {title.toLowerCase()} we talked about.
              </p>
              <div className="mt-6" ref={itemsRef}>
                <ItemsHead />
                {items.map((it, i) => {
                  const off = it.optional && it.k === dropIdx;
                  return (
                    <ItemRow
                      key={i}
                      name={it.name}
                      qty={it.qty}
                      unit={it.unit}
                      amount={it.qty * it.unit}
                      off={off}
                      tag={it.optional ? (off ? "optional, not included" : "optional") : null}
                      leading={
                        it.optional && !approved ? (
                          <span className="relative flex-none">
                            <input type="checkbox" className="c-check" checked={!off} readOnly tabIndex={-1} />
                            {tapIdx === it.k && <span className="wb-demo-tap left-1/2 top-1/2" />}
                          </span>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
              <Totals>
                <TRow label={options.length ? `Subtotal (${included} of ${items.length} items)` : "Subtotal"} value={money(subtotal)} />
                <TRow label="Total" value={money(total)} kind="total" />
                {deposit > 0 && <TRow label="Deposit to get started" value={money(deposit)} />}
              </Totals>

              {approved && (
                <Receipt>
                  <p className="c-receipt-line">
                    <strong>Approved</strong> — signed by <strong>{name}</strong> on {APPROVED_LONG}.
                  </p>
                  <p className="c-receipt-line">
                    {BRAND.name} will be in touch to schedule the work.{deposit > 0 ? ` A deposit of ${money(deposit)} gets things started.` : ""}
                  </p>
                </Receipt>
              )}

              {!approved && (
                <div ref={stubRef}>
                  <Stub title="Approve this quote">
                    <label className="c-fieldlabel">Sign by typing your full name</label>
                    <div className={`c-field is-signature flex max-w-md items-center ${b >= 4 ? "border-[color:var(--c-accent)] shadow-[0_0_0_3px_var(--c-accent-soft)]" : ""}`}>
                      {typed ? <span>{typed}</span> : <span style={{ color: "var(--c-faint)" }}>{name}</span>}
                      {b >= 4 && typed.length < name.length && <span className="ml-px h-6 w-px animate-pulse bg-gray-900" />}
                    </div>
                    <p className="c-hint">
                      Signing as {name}. Approving confirms the items and total above{deposit > 0 ? ` and the ${money(deposit)} deposit` : ""}.
                    </p>
                    <ActionBar>
                      <span className="relative block">
                        <Button block className={b === 5 ? "scale-[0.985] !bg-[color:var(--c-accent-strong)]" : ""}>
                          Approve · {money(total)}
                        </Button>
                        {b === 5 && <span className="wb-demo-tap left-1/2 top-1/2" />}
                      </span>
                      <Button variant="outline">Request changes</Button>
                    </ActionBar>
                  </Stub>
                </div>
              )}
              <Foot docType="Quote" docNumber={QUOTE_NO} companyName={BRAND.name} pdfHref="#" />
            </Sheet>
          </ClientRoot>
        </div>
      </Fit>
    </div>
  );
}

/** A name typed into the signature field, one letter at a time. */
function useTyping(active: boolean, text: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) {
      setN(0);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    setN(0);
    const t = setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), 85);
    return () => clearInterval(t);
  }, [active, text]);
  return text.slice(0, n);
}

/* ── The owner's quote page (app/platform/quotes/[id]) ─────────────────── */

function QuoteDetail({
  client,
  title,
  lines,
  options,
  dropIdx,
  total,
  deposit,
  depositPct,
  approved,
  depositPaid,
}: {
  client: string;
  title: string;
  lines: QuoteLine[];
  options: QuoteOption[];
  dropIdx: number;
  total: number;
  deposit: number;
  depositPct: number;
  approved: boolean;
  depositPaid: boolean;
}) {
  const first = firstName(client);
  const rows = [
    ...lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, optional: false, out: false })),
    ...options.map((o, k) => ({ name: o.name, qty: 1, unit: o.unit, optional: true, out: k === dropIdx })),
  ];
  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-gray-400">
          <ArrowLeft size={18} />
        </span>
        <StatusChip key={approved ? "a" : "w"} kind="quote" status={approved ? "APPROVED" : "AWAITING_RESPONSE"} className={approved ? "wb-pop-in" : ""} />
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageTitle sub={<span className="ds-link">{client}</span>}>{title}</PageTitle>
        <div className="flex items-center gap-2">
          {approved ? (
            <span className="btn-primary">
              <Briefcase size={13} />
              Convert to job
            </span>
          ) : (
            <>
              <span className="btn-primary">
                <CheckCircle size={13} />
                Mark approved
              </span>
              <span className="ds-btn-outline block rounded-[10px] p-2 text-[color:var(--ds-ink-2)]">
                <Pencil size={15} />
              </span>
            </>
          )}
          <span className="ds-btn-outline rounded-[10px] p-2 text-[color:var(--ds-ink-2)]">
            <MoreHorizontal size={16} />
          </span>
        </div>
      </div>

      {approved && deposit > 0 && !depositPaid && (
        <div className="wb-row-in mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-r)] bg-[color:var(--ds-primary-soft)] px-4 py-3">
          <p className="text-sm font-medium text-[color:var(--ds-ink)]">
            This quote was approved with a {money(deposit)} required deposit — collect it before the work starts.
          </p>
          <div className="flex items-center gap-3">
            <span className="btn-primary">
              <DollarSign size={13} />
              Collect deposit
            </span>
          </div>
        </div>
      )}

      <div className="ds-card mb-6 flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-sm">
        <Fact label="Quote #">{QUOTE_NO}</Fact>
        <Fact label="Created">{CREATED}</Fact>
        <div>
          <span className="block text-xs font-medium text-gray-500">Viewed</span>
          <span className="inline-flex items-center gap-1 font-medium text-green-700">
            <Eye size={13} />
            {VIEWED}
          </span>
        </div>
        <Fact label="Valid until">{VALID}</Fact>
        {deposit > 0 && (
          <div>
            <span className="block text-xs font-medium text-gray-500">{depositPaid ? "Deposit" : "Required deposit"}</span>
            {depositPaid ? (
              <span key="paid" className="wb-pop-in inline-block font-medium text-[color:var(--ds-good)]">
                {money(deposit)} · Paid (#{DEPOSIT_INVOICE_NO})
              </span>
            ) : (
              <span className="font-semibold text-gray-800">{money(deposit)}</span>
            )}
          </div>
        )}
        {approved && (
          <div className="wb-pop-in">
            <span className="block text-xs font-medium text-gray-500">Approved</span>
            <span className="text-gray-800">
              {VIEWED} by {client}
            </span>
          </div>
        )}
      </div>

      <div className="ds-card overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4">
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            Thanks for having us out, {first}. Here is the {title.toLowerCase()} we talked about.
          </p>
        </div>
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2 text-left text-xs font-semibold text-gray-500">Product / Service</th>
                <th className="w-16 py-2 text-right text-xs font-semibold text-gray-500">Qty</th>
                <th className="w-24 py-2 text-right text-xs font-semibold text-gray-500">Unit Price</th>
                <th className="w-24 py-2 text-right text-xs font-semibold text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((it, i) => (
                <tr key={i} className={`transition-opacity duration-500 ${it.out ? "opacity-40" : ""}`}>
                  <td className="py-3">
                    <p className="font-medium text-gray-900">
                      {it.name}
                      {it.optional && " "}
                      {it.optional && <DsChip>Optional{it.out ? " — removed by client" : ""}</DsChip>}
                    </p>
                  </td>
                  <td className="ds-num py-3 text-right text-gray-600">{it.qty}</td>
                  <td className="ds-num py-3 text-right text-gray-600">{money(it.unit)}</td>
                  <td className="ds-num py-3 text-right font-medium text-gray-900">{money(it.qty * it.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[color:var(--ds-line)] bg-[color:var(--ds-surface-2)] px-6 py-4">
          <div className="ml-auto w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="ds-num text-gray-800">{money(total)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-bold">
              <span className="text-gray-900">Total</span>
              <span className="ds-num text-gray-900">{money(total)}</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between text-[color:var(--ds-primary)]">
                <span>Required deposit ({depositPct}%)</span>
                <span className="ds-num font-semibold">{money(deposit)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-xs font-medium text-gray-500">{label}</span>
      <span className="text-gray-800">{children}</span>
    </div>
  );
}
