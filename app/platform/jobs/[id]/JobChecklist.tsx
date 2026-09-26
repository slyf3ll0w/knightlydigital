"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Loader2 } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { Chip } from "@/components/ds";
import { sendOrQueue } from "@/lib/outbox";

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
  const [queued, setQueued] = useState(false);
  // Ticks made offline, shown over the server-rendered props until reconnect
  const [overrides, setOverrides] = useState<
    Record<string, { done: boolean; doneByName: string | null; skipReason: string | null }>
  >({});

  const view = items.map((i) => (overrides[i.id] ? { ...i, ...overrides[i.id] } : i));
  const resolved = view.filter((i) => i.done || i.skipReason).length;

  async function update(itemId: string, action: "done" | "skip" | "reopen", skipReason?: string) {
    setBusyId(itemId);
    setError("");
    try {
      // Action-based (not toggle), so an offline tick replayed at flush time
      // lands exactly once no matter how many times it's retried.
      const res = await sendOrQueue({
        url: `/api/app/jobs/${jobId}/checklist`,
        method: "PATCH",
        body: { itemId, action, reason: skipReason },
        label: "Checklist",
      });
      if (res.queued) {
        setOverrides((o) => ({
          ...o,
          [itemId]: {
            done: action === "done",
            doneByName: null,
            skipReason: action === "skip" ? (skipReason ?? null) : null,
          },
        }));
        setQueued(true);
        setSkippingId(null);
        setReason("");
        return;
      }
      if (!res.ok) {
        setError(res.data?.error ?? "Something went wrong. Please try again.");
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
  const sources = [...new Set(view.map((i) => i.sourceName))];

  return (
    <div className="ds-card p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Checklist" />
        <Chip tone={resolved === items.length ? "good" : "neutral"}>
          {resolved}/{view.length} done
        </Chip>
      </div>
      {error && (
        <div role="alert" className="form-error mb-3">
          {error}
        </div>
      )}
      {queued && !error && (
        <p className="mb-3 text-xs text-[color:var(--ds-warn)]">
          Saved — checklist changes will sync when you&apos;re back online.
        </p>
      )}
      <div className="space-y-4">
        {sources.map((source) => (
          <div key={source}>
            {sources.length > 1 && (
              <p className="text-xs font-medium text-gray-500 mb-1.5">
                {source}
              </p>
            )}
            <ul className="space-y-1">
              {view
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
                              ? "border-[color:var(--ds-good)] bg-[color:var(--ds-good)] text-white"
                              : item.skipReason
                                ? "border-[color:var(--ds-warn)] bg-[color:var(--ds-warn-soft)] text-[color:var(--ds-warn)]"
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
                            <p className="text-[11px] text-[color:var(--ds-warn)]">
                              <span className="font-semibold">Not done</span> —{" "}
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
                            className="shrink-0 text-xs text-gray-500 hover:text-gray-600 opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-opacity"
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
                            className="min-w-0 flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)] bg-white"
                          />
                          <button
                            type="button"
                            disabled={!reason.trim() || busy}
                            onClick={() => update(item.id, "skip", reason.trim())}
                            className="ds-btn ds-btn-sm bg-[color:var(--ds-warn)] text-white hover:opacity-90 disabled:opacity-50"
                          >
                            Skip task
                          </button>
                          <button
                            type="button"
                            onClick={() => setSkippingId(null)}
                            className="ds-btn ds-btn-outline ds-btn-sm"
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
