"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ds";

/** The Test / Live switch, same action as the accounts table's button. */
export default function TestToggle({ companyId, isTest }: { companyId: string; isTest: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isTest ? "mark-live" : "mark-test" }),
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
        variant="outline"
        size="sm"
        icon={busy ? Loader2 : FlaskConical}
        disabled={busy}
        onClick={flip}
        className={busy ? "[&>svg]:animate-spin" : ""}
        title={isTest ? "Move back to the Live list" : "Move to the Test list (out of every total)"}
      >
        {isTest ? "Mark live" : "Mark test"}
      </Button>
    </span>
  );
}
