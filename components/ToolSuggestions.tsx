"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import { postJson } from "@/lib/safe-fetch";
import type { EstimatorSpec } from "@/lib/estimator";

/**
 * "From your quotes" on a tool's Overview: changes the owner's own sent
 * quotes point to (lib/estimator-corrections.ts). Each one names what they
 * charge against what the tool says, lists the quotes behind it, and says
 * how many of those quotes the change would have priced right — the app
 * checked before offering it. Nothing changes until they press the button,
 * and the old rules stay under History. Renders nothing when there is
 * nothing proven to offer.
 */
type Row = {
  key: string;
  kind: "rate" | "minimum" | "rounding" | "price_book" | "add_line" | "drop_line";
  title: string;
  detail: string;
  action: string;
  quotes: { id: string; quoteNumber: number | null; at: string; tool: number; sent: number; outcome: "won" | "lost" | "open" }[];
  spec: EstimatorSpec | null;
  /** A price-book price to change (the tool takes this line's price from the price book). */
  priceBook: { workItemId: string; unitPrice: number } | null;
  request: string | null;
};

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ToolSuggestions({ toolId, version, busy, onApply }: { toolId: string; /** changes when the tool is saved — the list is read again */ version: string; busy: boolean; onApply: (spec: EstimatorSpec) => Promise<boolean> }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/app/estimators/${toolId}/suggestions`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { suggestions?: Row[] } | null;
      setRows(res.ok && Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch {
      setRows([]);
    }
  }, [toolId]);
  useEffect(() => void load(), [load, version]);

  async function answer(row: Row, a: "later" | "never") {
    setWorking(row.key);
    await postJson(`/api/app/estimators/${toolId}/suggestions`, { key: row.key, answer: a });
    setRows((rs) => rs.filter((r) => r.key !== row.key));
    setWorking(null);
  }

  async function apply(row: Row) {
    if (!row.spec && !row.priceBook) return;
    setWorking(row.key);
    const ok = row.spec ? await onApply(row.spec) : (await postJson(`/api/app/work-items/${row.priceBook!.workItemId}`, { unitPrice: row.priceBook!.unitPrice }, "PATCH")).ok;
    if (ok) setRows((rs) => rs.filter((r) => r.key !== row.key));
    setWorking(null);
  }

  if (rows.length === 0) return null;
  return (
    <div className="ds-card overflow-hidden">
      <SectionHeader className="px-4 pt-4 sm:px-5" title="From your quotes" hint="What you changed before sending, checked against your recent quotes. Nothing changes unless you say so." />
      <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
        {rows.map((row) => {
          const off = busy || working !== null;
          return (
            <li key={row.key} className="px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-gray-900">{row.title}</p>
              <p className="mt-1 text-sm text-gray-600">{row.detail}</p>
              <button type="button" onClick={() => setOpen(open === row.key ? null : row.key)} className="mt-2 text-xs font-medium text-gray-600 underline underline-offset-2">
                {open === row.key ? "Hide the quotes" : `See the ${row.quotes.length} quotes`}
              </button>
              {open === row.key && (
                <table className="mt-2 w-full max-w-md text-xs text-gray-600">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1 pr-3 font-medium">Quote</th>
                      <th className="py-1 pr-3 text-right font-medium">{row.kind === "add_line" ? "" : "Tool"}</th>
                      <th className="py-1 pr-3 text-right font-medium">{row.kind === "drop_line" ? "" : "You sent"}</th>
                      <th className="py-1 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {row.quotes.map((q) => (
                      <tr key={q.id}>
                        <td className="py-1 pr-3">
                          {q.quoteNumber != null ? `#${q.quoteNumber}` : "Quote"} · {day(q.at)}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">{row.kind === "add_line" ? "" : money(q.tool)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{row.kind === "drop_line" ? "removed" : money(q.sent)}</td>
                        <td className="py-1">{q.outcome === "won" ? "Approved" : q.outcome === "lost" ? "Archived" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {row.spec || row.priceBook ? (
                  <button type="button" disabled={off} onClick={() => void apply(row)} className="btn-primary h-9 justify-center">
                    {row.action}
                  </button>
                ) : row.request ? (
                  <Link href={`/app/estimates/${toolId}?prompt=${encodeURIComponent(row.request)}`} className="btn-primary h-9 justify-center">
                    Ask Atlas to change it
                  </Link>
                ) : null}
                <button type="button" disabled={off} onClick={() => void answer(row, "later")} className="btn-secondary h-9 justify-center">
                  Not now
                </button>
                <button type="button" disabled={off} onClick={() => void answer(row, "never")} className="h-9 px-2 text-sm text-gray-500 hover:text-gray-700">
                  Don&apos;t suggest this again
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
