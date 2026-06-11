"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/** Sidebar card: check the team members working this job (drives the tech
 *  role's job visibility and the schedule's team filter). */
export default function AssignTeam({
  jobId,
  users,
  assignedIds,
}: {
  jobId: string;
  users: { id: string; name: string }[];
  assignedIds: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggle(userId: string) {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelected(next);
    setSaving(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/jobs/${jobId}`,
      { assigneeIds: Array.from(next) },
      "PATCH"
    );
    setSaving(false);
    if (!ok) {
      setSelected(selected); // revert
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <Users size={12} />
          Team
        </h2>
        {saving && <Loader2 size={12} className="animate-spin text-gray-400" />}
      </div>
      <div className="space-y-1.5">
        {users.map((u) => (
          <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              checked={selected.has(u.id)}
              onChange={() => toggle(u.id)}
              disabled={saving}
              className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            {u.name}
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
