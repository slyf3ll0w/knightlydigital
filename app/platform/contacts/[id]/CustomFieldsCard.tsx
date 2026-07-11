"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type Def = {
  id: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
};

const inputCls =
  "w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

/** Company-defined fields on the client page; edit-in-place, full-map save. */
export default function CustomFieldsCard({
  contactId,
  defs,
  values,
}: {
  contactId: string;
  defs: Def[];
  values: Record<string, string>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (defs.length === 0) return null;

  async function save() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/contacts/${contactId}`,
      { customFields: draft, replaceCustomFields: true },
      "PATCH"
    );
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="card-ledger p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</h2>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              onClick={save}
              disabled={busy}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-full"
              title="Save"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              onClick={() => {
                setDraft(values);
                setEditing(false);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600"
            title="Edit details"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {defs.map((d) => (
          <div key={d.id}>
            <p className="text-xs text-gray-500">{d.label}</p>
            {editing ? (
              d.type === "SELECT" ? (
                <select
                  value={draft[d.id] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [d.id]: e.target.value })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {d.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={d.type === "NUMBER" ? "number" : d.type === "DATE" ? "date" : "text"}
                  value={draft[d.id] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [d.id]: e.target.value })}
                  className={inputCls}
                />
              )
            ) : (
              <p className="text-sm text-gray-800">{values[d.id] || "—"}</p>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
