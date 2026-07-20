"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ImportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/finix-import", { method: "POST", body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Import failed.");
      } else {
        setMessage(
          `Imported ${body.imported} merchant row${body.imported === 1 ? "" : "s"} for ${body.month}` +
            (body.unmatched > 0 ? ` (${body.unmatched} not linked to any company yet)` : "")
        );
        form.reset();
        router.refresh();
      }
    } catch {
      setError("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-800 bg-stone-900 p-4"
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs text-stone-400">Report month</span>
        <input
          type="month"
          name="month"
          required
          className="rounded border border-stone-700 bg-stone-950 px-2 py-1.5 text-sm text-white"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-stone-400">Net Profit CSV</span>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block text-sm text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-stone-700 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-stone-600"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
      >
        {busy ? "Importing…" : "Import"}
      </button>
      {message && <span className="text-sm text-emerald-400">{message}</span>}
      {error && <span className="text-sm text-red-400">{error}</span>}
    </form>
  );
}
