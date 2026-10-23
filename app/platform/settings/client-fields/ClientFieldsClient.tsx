"use client";

import { useState } from "react";
import { inputClsAuto } from "@/components/Input";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ListPlus, Loader2, Pencil, Plus, X } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import SectionHeader from "@/components/SectionHeader";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
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

export default function ClientFieldsClient({ defs }: { defs: Def[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("TEXT");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);
  // Inline edit of an existing field (name, type, choices, required) — the
  // row turns into the same form the Add card uses. 2026-10-22: there was
  // no way to change a field once made (David).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ label: "", type: "TEXT", optionsText: "", required: false });

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

  function startEdit(def: Def) {
    setError("");
    setShowAdd(false);
    setEditingId(def.id);
    setEdit({ label: def.label, type: def.type, optionsText: def.options.join("\n"), required: def.required });
  }

  async function saveEdit(def: Def) {
    const options = edit.optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
    if (edit.type === "SELECT" && options.length < 2) {
      setError("A dropdown needs at least two choices.");
      return;
    }
    const ok = await call(
      `/api/app/contact-fields/${def.id}`,
      {
        label: edit.label,
        type: edit.type,
        required: edit.required,
        options: edit.type === "SELECT" ? options : [],
      },
      "PATCH"
    );
    if (ok) setEditingId(null);
  }

  async function move(def: Def, dir: -1 | 1) {
    if (busy) return;
    const idx = active.findIndex((d) => d.id === def.id);
    const other = active[idx + dir];
    if (!other) return;
    // Swap sort orders — two PATCHes, one after the other (there's no reorder
    // endpoint). If the second fails, put the first back so the list can't be
    // left with both rows on the same slot.
    setBusy(true);
    setError("");
    try {
      const first = await postJson(
        `/api/app/contact-fields/${def.id}`,
        { sortOrder: other.sortOrder },
        "PATCH"
      );
      if (!first.ok) {
        setError(first.data?.error ?? GENERIC_ERROR);
        return;
      }
      const second = await postJson(
        `/api/app/contact-fields/${other.id}`,
        { sortOrder: def.sortOrder },
        "PATCH"
      );
      if (!second.ok) {
        await postJson(`/api/app/contact-fields/${def.id}`, { sortOrder: def.sortOrder }, "PATCH");
        setError(second.data?.error ?? GENERIC_ERROR);
        return;
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BackLink href="/app/settings" />
          <PageTitle info="Custom fields show on every client — new-client form, client pages, and the CSV importer.">
            Client Fields
          </PageTitle>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="btn-primary"
        >
          <Plus size={15} />
          Add field
        </button>
      </div>

      {error && (
        <div role="alert" className="form-error mb-4 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-[color:var(--ds-bad)] opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {showAdd && (
        <div className="ds-card p-5 mb-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Field name *</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Gate code, Property size"
                className={`${inputClsAuto} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClsAuto} w-full`}>
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
                className={`${inputClsAuto} w-full`}
              />
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
            />
            Required when adding a client
          </label>
          <div className="flex gap-2">
            <button
              onClick={addField}
              disabled={busy || !label.trim()}
              className="btn-primary"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Add field
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="ds-card ds-divide mb-6">
        {active.length === 0 && (
          <EmptyState
            icon={ListPlus}
            title="No custom fields yet"
            body="Add one to start tailoring client records to your business."
          />
        )}
        {active.map((d, i) =>
          editingId === d.id ? (
            <div key={d.id} className="space-y-3 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Field name *</label>
                  <input
                    value={edit.label}
                    onChange={(e) => setEdit((s) => ({ ...s, label: e.target.value }))}
                    className={`${inputClsAuto} w-full`}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Type</label>
                  <select
                    value={edit.type}
                    onChange={(e) => setEdit((s) => ({ ...s, type: e.target.value }))}
                    className={`${inputClsAuto} w-full`}
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {edit.type === "SELECT" && (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Choices (one per line)</label>
                  <textarea
                    value={edit.optionsText}
                    onChange={(e) => setEdit((s) => ({ ...s, optionsText: e.target.value }))}
                    rows={3}
                    className={`${inputClsAuto} w-full`}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Renaming or removing a choice hides that value on clients who had it until it is picked again.
                  </p>
                </div>
              )}
              {edit.type !== d.type && (
                <p className="text-xs text-gray-500">
                  Changing the type keeps every saved value; a value that doesn&apos;t fit the new type is hidden until it&apos;s re-entered.
                </p>
              )}
              <label className="flex select-none items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={edit.required}
                  onChange={(e) => setEdit((s) => ({ ...s, required: e.target.checked }))}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
                />
                Required when adding a client
              </label>
              <div className="flex gap-2">
                <button onClick={() => saveEdit(d)} disabled={busy || !edit.label.trim()} className="btn-primary">
                  {busy && <Loader2 size={13} className="animate-spin" />}
                  Save changes
                </button>
                <button onClick={() => setEditingId(null)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
          <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => move(d, -1)}
                disabled={i === 0 || busy}
                aria-label={`Move ${d.label} up`}
                className="p-1 text-gray-300 hover:text-gray-600 active:text-gray-600 disabled:opacity-30"
              >
                <ArrowUp size={12} />
              </button>
              <button
                onClick={() => move(d, 1)}
                disabled={i === active.length - 1 || busy}
                aria-label={`Move ${d.label} down`}
                className="p-1 text-gray-300 hover:text-gray-600 active:text-gray-600 disabled:opacity-30"
              >
                <ArrowDown size={12} />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">
                {d.label}
                {d.required && <span className="text-[color:var(--ds-bad)]"> *</span>}
              </p>
              <p className="text-xs text-gray-500">
                {TYPE_LABELS[d.type] ?? d.type}
                {d.type === "SELECT" && d.options.length > 0 && ` · ${d.options.join(", ")}`}
              </p>
            </div>
            <button
              onClick={() => startEdit(d)}
              disabled={busy}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-primary)] hover:bg-[color:var(--ds-primary-soft)]"
            >
              <Pencil size={12} />
              Edit
            </button>
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
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[color:var(--ds-bad)] hover:bg-[color:var(--ds-bad-soft)]"
            >
              Archive
            </button>
          </div>
          )
        )}
      </div>

      {archived.length > 0 && (
        <div>
          <SectionHeader title="Archived (values are kept)" className="mb-2" />
          <div className="ds-card ds-divide">
            {archived.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5 opacity-70">
                <p className="text-sm text-gray-700">{d.label}</p>
                <button
                  onClick={() => call(`/api/app/contact-fields/${d.id}`, { isActive: true }, "PATCH")}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[color:var(--ds-primary)] hover:bg-[color:var(--ds-primary-soft)]"
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
