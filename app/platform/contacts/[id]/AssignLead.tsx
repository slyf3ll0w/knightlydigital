"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/** Owner/admin control: route this lead to a team member. */
export default function AssignLead({
  contactId,
  assignedToId,
  users,
}: {
  contactId: string;
  assignedToId: string;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(assignedToId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(next: string) {
    setValue(next);
    setSaving(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/contacts/${contactId}`,
      { assignedToId: next || null },
      "PATCH"
    );
    setSaving(false);
    if (!ok) {
      setValue(value);
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={value}
          disabled={saving}
          onChange={(e) => save(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {saving && <Loader2 size={13} className="animate-spin text-gray-400 shrink-0" />}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
