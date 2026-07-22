"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Loader2 } from "lucide-react";

export type ChecklistItemView = {
  id: string;
  label: string;
  sourceName: string;
  done: boolean;
  doneByName: string | null;
  skipReason: string | null;
};

/**
 * The job's close-out checklist — tasks from the price-book services on this
 * job. Every task must be checked off or skipped with a reason before the
 * job can be completed/closed (enforced server-side in the status route).
 */
export default function JobChecklist({
  jobId,
  items,
  readOnly,
}: {
  jobId: string;
  items: ChecklistItemView[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const resolved = items.filter((i) => i.done || i.skipReason).length;

  async function update(itemId: string, action: "done" | "skip" | "reopen", skipReason?: string) {
    setBusyId(itemId);
    setError("");
    try {
      const res = await fetch(`/api/app/jobs/${jobId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action, reason: skipReason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSkippingId(null);
      setReason("");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  // Group under the service each task came from — only label the groups
  // when more than one service contributes tasks.
  const sources = [...new Set(items.map((i) => i.sourceName))];

  return (
    <div className="card-ledger p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist</h2>
        <span
          className={`stamp ${resolved === items.length ? "text-green-700" : "text-gray-500"}`}
        >
          {resolved}/{items.length} done
        </span>
      </div>
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="space-y-4">
        {sources.map((source) => (
          <div key={source}>
            {sources.length > 1 && (
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {source}
              </p>
            )}
            <ul className="space-y-1">
              {items
                .filter((i) => i.sourceName === source)
                .map((item) => {
                  const busy = busyId === item.id;
                  return (
                    <li key={item.id} className="group">
                      <div className="flex items-start gap-3 py-1">
                        <button
                          type="button"
                          disabled={readOnly || busy}
                          onClick={() =>
                            update(item.id, item.done || item.skipReason ? "reopen" : "done")
                          }
                          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
                            item.done
                              ? "border-green-600 bg-green-500 text-white"
                              : item.skipReason
                                ? "border-amber-400 bg-amber-50 text-amber-500"
                                : "border-gray-300 bg-white hover:border-gray-400"
                          } ${readOnly ? "cursor-default" : ""}`}
                          aria-label={
                            item.done || item.skipReason
                              ? `Reopen "${item.label}"`
                              : `Check off "${item.label}"`
                          }
                        >
                          {busy ? (
                            <Loader2 size={11} className="animate-spin text-gray-400" />
                          ) : item.done ? (
                            <Check size={12} strokeWidth={3} />
                          ) : item.skipReason ? (
                            <RotateCcw size={10} className="opacity-0 group-hover:opacity-100" />
                          ) : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${
                              item.done
                                ? "text-gray-400 line-through"
                                : item.skipReason
                                  ? "text-gray-500"
                                  : "text-gray-800"
                            }`}
                          >
                            {item.label}
                          </p>
                          {item.done && item.doneByName && (
                            <p className="text-[11px] text-gray-400">by {item.doneByName}</p>
                          )}
                          {item.skipReason && (
                            <p className="text-[11px] text-amber-700">
                              <span className="font-semibold uppercase">Not done</span> —{" "}
                              {item.skipReason}
                            </p>
                          )}
                        </div>
                        {!readOnly && !item.done && !item.skipReason && skippingId !== item.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setSkippingId(item.id);
                              setReason("");
                            }}
                            className="shrink-0 text-xs text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-opacity"
                          >
                            Can&apos;t do it?
                          </button>
                        )}
                      </div>
                      {skippingId === item.id && (
                        <div className="ml-[30px] mb-2 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && reason.trim())
                                update(item.id, "skip", reason.trim());
                              if (e.key === "Escape") setSkippingId(null);
                            }}
                            placeholder="Why couldn't this be done?"
                            className="min-w-0 flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                          />
                          <button
                            type="button"
                            disabled={!reason.trim() || busy}
                            onClick={() => update(item.id, "skip", reason.trim())}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-[8px] btn-tool transition-colors disabled:opacity-50"
                          >
                            Skip task
                          </button>
                          <button
                            type="button"
                            onClick={() => setSkippingId(null)}
                            className="px-3 py-1.5 border border-gray-300 text-xs font-medium text-gray-600 rounded-[8px] hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
