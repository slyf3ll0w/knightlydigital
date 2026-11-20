"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip, InfoTip } from "@/components/ds";

/**
 * The company's client-pages look (AI page designer, Pro): what is live and
 * a Reset theme button that puts the portal, sign-in, booking page and forms
 * back on the default look (their colors + logo). History is kept, so the
 * owner can put a version back from Settings → Client pages.
 */
export function ThemeControl({ companyId, live, versions, hasDraft }: { companyId: string; live: { version: number; note: string | null; publishedAt: string | null } | null; versions: number; hasDraft: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    if (!window.confirm("Put this company's client pages back on the default look? Their history is kept.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "theme-reset" }),
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
    <Card className="p-5">
      <div className="flex items-center gap-1.5">
        <h2 className="ds-h2">Client pages look</h2>
        <InfoTip>The page-designer theme on their portal, sign-in, booking page and forms (Pro). Quotes, invoices and emails never use it.</InfoTip>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone={live ? "primary" : "neutral"}>{live ? `Version ${live.version} live${live.note ? `: ${live.note}` : ""}` : "Default look"}</Chip>
        {hasDraft && <Chip tone="neutral">Draft in progress</Chip>}
        <span className="ds-small">{versions} in history</span>
      </div>
      <div className="mt-4">
        <Button variant="outline" size="sm" disabled={busy || !live} onClick={reset}>
          {busy ? "Resetting…" : "Reset theme"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </Card>
  );
}
