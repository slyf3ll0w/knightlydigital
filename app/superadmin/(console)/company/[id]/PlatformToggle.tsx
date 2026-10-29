"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ds";

/**
 * "WorkBench's own account" switch (Company.isPlatform): the company whose
 * Square connection plan billing runs through (lib/plan-billing-env.ts).
 * One at a time — marking this one clears any other.
 */
export default function PlatformToggle({ companyId, isPlatform }: { companyId: string; isPlatform: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip() {
    if (!isPlatform && !confirm("Make this WorkBench's own account? Plan billing will run through its Square connection.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isPlatform ? "unmark-platform" : "mark-platform" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Request failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-sm text-[color:var(--ds-bad)]">{error}</span>}
      <Button
        variant={isPlatform ? "primary" : "outline"}
        size="sm"
        icon={busy ? Loader2 : Building2}
        disabled={busy}
        onClick={flip}
        className={busy ? "[&>svg]:animate-spin" : ""}
        title={
          isPlatform
            ? "This is WorkBench's own account — plan billing runs through its Square connection"
            : "Make this WorkBench's own account (plan billing through its Square connection)"
        }
      >
        {isPlatform ? "WorkBench's account" : "Make WorkBench's account"}
      </Button>
    </span>
  );
}
