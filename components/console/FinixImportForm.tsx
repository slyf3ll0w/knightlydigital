"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ds";
import { Input } from "@/components/Input";

/** Monthly Finix Net Profit CSV → FinixCostSnapshot rows (POST /api/superadmin/finix-import). */
export default function FinixImportForm() {
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
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="ds-label mb-1 block">Report month</span>
        <Input type="month" name="month" required className="w-44" />
      </label>
      <label className="text-sm">
        <span className="ds-label mb-1 block">Net Profit CSV</span>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block text-sm text-[color:var(--ds-ink-2)] file:mr-3 file:rounded-[10px] file:border-0 file:bg-[color:var(--ds-primary-soft)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[color:var(--ds-primary)]"
        />
      </label>
      <Button type="submit" disabled={busy} icon={busy ? Loader2 : Upload} className={busy ? "[&>svg]:animate-spin" : ""}>
        {busy ? "Importing…" : "Import"}
      </Button>
      {message && <span className="text-sm text-[color:var(--ds-good)]">{message}</span>}
      {error && <span className="text-sm text-[color:var(--ds-bad)]">{error}</span>}
    </form>
  );
}
