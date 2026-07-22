"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trophy, XCircle, SquareKanban } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Right-rail pipeline card on the client page: which board stage the lead
 * sits in (changeable inline), how long it's been there, and Won/Lost
 * shortcuts — the same actions as the board's drop zones.
 */
export default function PipelineCard({
  contactId,
  contactName,
  stages,
  currentStageId,
  daysInStage,
  isLead,
}: {
  contactId: string;
  contactName: string;
  stages: { id: string; name: string }[];
  currentStageId: string;
  daysInStage: number;
  isLead: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/contacts/${contactId}/stage`, payload, "PATCH");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="card-ledger p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline</h2>
        <Link href="/app/leads" className="text-gray-400 hover:text-gray-600" title="Open the board">
          <SquareKanban size={14} />
        </Link>
      </div>
      <select
        value={currentStageId}
        disabled={busy}
        onChange={(e) => send({ stageId: e.target.value })}
        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/30 mb-1.5"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-gray-400 mb-3">
        {daysInStage <= 0 ? "Moved here today" : `${daysInStage}d in this stage`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            if (window.confirm(`Mark ${contactName} as won? They become an active client.`))
              send({ action: "won" });
          }}
          disabled={busy}
          className="rounded-[10px] flex items-center justify-center gap-1 px-2 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold"
        >
          <Trophy size={13} />
          Won
        </button>
        <button
          onClick={() => {
            const reason = window.prompt(
              isLead
                ? `Mark ${contactName} as lost? The lead is archived.\n\nReason (optional):`
                : `Take ${contactName} off the board? They stay an active client.\n\nReason (optional):`
            );
            if (reason !== null) send({ action: "lost", reason: reason || undefined });
          }}
          disabled={busy}
          className="rounded-full flex items-center justify-center gap-1 px-2 py-2 bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white text-xs font-bold"
        >
          <XCircle size={13} />
          Lost
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
