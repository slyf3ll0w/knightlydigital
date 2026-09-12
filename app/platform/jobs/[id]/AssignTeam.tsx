"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Sidebar card: who's working this job. Drives the tech role's visibility,
 * the schedule's team filter, booking availability, and calendar sync. A
 * scheduled job can't be left with nobody on it — the API refuses — unless
 * it's outsourced (a subcontractor is doing it). A one-person company sees
 * itself pre-checked: its jobs are assigned automatically.
 */
export default function AssignTeam({
  jobId,
  users,
  assignedIds,
  outsourced: initialOutsourced,
  outsourcedTo: initialOutsourcedTo,
}: {
  jobId: string;
  users: { id: string; name: string }[];
  assignedIds: string[];
  outsourced: boolean;
  outsourcedTo: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedIds));
  const [outsourced, setOutsourced] = useState(initialOutsourced);
  const [outsourcedTo, setOutsourcedTo] = useState(initialOutsourcedTo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const solo = users.length === 1;

  async function save(body: Record<string, unknown>, revert: () => void) {
    setSaving(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/jobs/${jobId}`, body, "PATCH");
    setSaving(false);
    if (!ok) {
      revert();
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.refresh();
  }

  async function toggle(userId: string) {
    const prev = new Set(selected);
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelected(next);
    await save({ assigneeIds: Array.from(next) }, () => setSelected(prev));
  }

  async function toggleOutsourced(on: boolean) {
    const prevSel = new Set(selected);
    setOutsourced(on);
    if (on) setSelected(new Set());
    await save(
      on ? { outsourced: true, outsourcedTo: outsourcedTo.trim() || null, assigneeIds: [] } : { outsourced: false },
      () => {
        setOutsourced(!on);
        setSelected(prevSel);
      }
    );
  }

  async function saveOutsourcedTo() {
    if ((outsourcedTo.trim() || "") === (initialOutsourcedTo ?? "")) return;
    await save({ outsourcedTo: outsourcedTo.trim() || null }, () => setOutsourcedTo(initialOutsourcedTo ?? ""));
  }

  return (
    <div className="card-ledger p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-gray-500 flex items-center gap-1.5">
          <Users size={12} />
          Team
        </h2>
        {saving && <Loader2 size={12} className="animate-spin text-gray-400" />}
      </div>
      <div className={`space-y-1.5 ${outsourced ? "opacity-50" : ""}`}>
        {users.map((u) => (
          <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              checked={!outsourced && selected.has(u.id)}
              onChange={() => toggle(u.id)}
              disabled={saving || outsourced}
              className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            {u.name}
          </label>
        ))}
      </div>
      <label className="mt-2.5 flex items-center gap-2 text-sm text-gray-700 select-none border-t border-gray-100 pt-2.5">
        <input
          type="checkbox"
          checked={outsourced}
          onChange={(e) => toggleOutsourced(e.target.checked)}
          disabled={saving}
          className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        Outsourced to a subcontractor
      </label>
      {outsourced && (
        <input
          type="text"
          value={outsourcedTo}
          onChange={(e) => setOutsourcedTo(e.target.value)}
          onBlur={saveOutsourcedTo}
          disabled={saving}
          className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Who's doing it (optional)"
        />
      )}
      {solo && !outsourced && (
        <p className="mt-2 text-xs text-gray-400">It&apos;s just you — your jobs are assigned to you automatically.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
