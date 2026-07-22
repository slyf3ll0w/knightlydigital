"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Manage company-defined custom fields on clients. Fields appear on the
 * new-client form, the client page, the CSV importer, and (for booking
 * forms) as mapping targets. Archiving hides a field without destroying
 * already-saved values.
 */

type Def = {
  id: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  sortOrder: number;
  isActive: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  SELECT: "Dropdown",
};

const inputCls =
  "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export default function ClientFieldsClient({ defs }: { defs: Def[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("TEXT");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);

  const active = defs.filter((d) => d.isActive);
  const archived = defs.filter((d) => !d.isActive);

  async function call(url: string, body: Record<string, unknown>, method: "POST" | "PATCH") {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(url, body, method);
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return false;
    }
    router.refresh();
    return true;
  }

  async function addField() {
    const ok = await call(
      "/api/app/contact-fields",
      {
        label,
        type,
        required,
        options: optionsText.split("\n").map((o) => o.trim()).filter(Boolean),
      },
      "POST"
    );
    if (ok) {
      setLabel("");
      setOptionsText("");
      setRequired(false);
      setShowAdd(false);
    }
  }

  function move(def: Def, dir: -1 | 1) {
    const idx = active.findIndex((d) => d.id === def.id);
    const other = active[idx + dir];
    if (!other) return;
    // swap sort orders
    call(`/api/app/contact-fields/${def.id}`, { sortOrder: other.sortOrder }, "PATCH");
    call(`/api/app/contact-fields/${other.id}`, { sortOrder: def.sortOrder }, "PATCH");
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Link href="/app/contacts" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Client Fields</h1>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
        >
          <Plus size={15} />
          Add Field
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-8">
        Custom fields show on every client — new-client form, client pages, and the CSV importer.
      </p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {showAdd && (
        <div className="card-ledger p-5 mb-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Field name *</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Gate code, Property size"
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} w-full`}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {type === "SELECT" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Choices (one per line)</label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={3}
                className={`${inputCls} w-full`}
              />
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Required when adding a client
          </label>
          <div className="flex gap-2">
            <button
              onClick={addField}
              disabled={busy || !label.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] btn-tool disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Add Field
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card-ledger divide-y divide-gray-100 mb-6">
        {active.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            No custom fields yet — add one to start tailoring client records to your business.
          </p>
        )}
        {active.map((d, i) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => move(d, -1)}
                disabled={i === 0 || busy}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
              >
                <ArrowUp size={12} />
              </button>
              <button
                onClick={() => move(d, 1)}
                disabled={i === active.length - 1 || busy}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
              >
                <ArrowDown size={12} />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">
                {d.label}
                {d.required && <span className="text-red-500"> *</span>}
              </p>
              <p className="text-xs text-gray-500">
                {TYPE_LABELS[d.type] ?? d.type}
                {d.type === "SELECT" && d.options.length > 0 && ` · ${d.options.join(", ")}`}
              </p>
            </div>
            <button
              onClick={() => call(`/api/app/contact-fields/${d.id}`, { required: !d.required }, "PATCH")}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              {d.required ? "Make optional" : "Make required"}
            </button>
            <button
              onClick={() => call(`/api/app/contact-fields/${d.id}`, { isActive: false }, "PATCH")}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Archive
            </button>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Archived (values are kept)
          </h2>
          <div className="card-ledger divide-y divide-gray-100">
            {archived.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5 opacity-70">
                <p className="text-sm text-gray-700">{d.label}</p>
                <button
                  onClick={() => call(`/api/app/contact-fields/${d.id}`, { isActive: true }, "PATCH")}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 hover:bg-green-50"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
