"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { alertSheet } from "@/components/ConfirmSheet";
import InfoTip from "@/components/ds/InfoTip";

/**
 * Home, under the page (moved from Settings 2026-11-21): bring the Get started checklist back after
 * it was hidden (POST /api/app/setup/restore). It still leaves on its own
 * once every core item is done.
 */
export default function GetStartedRow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

  async function restore() {
    setBusy(true);
    const { ok, data } = await postJson("/api/app/setup/restore");
    setBusy(false);
    if (!ok) {
      alertSheet({ title: "That didn't go through", message: data?.error ?? GENERIC_ERROR });
      return;
    }
    setShown(true);
    router.refresh();
  }

  return (
    <div className="ds-card flex items-center gap-3 p-4">
      <ListChecks size={19} strokeWidth={2.3} className="shrink-0 text-[color:var(--ds-primary)]" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ds-ink)]">
          Get started checklist
          <InfoTip label="What is the Get started checklist?">
            The setup steps at the top of Home. Each one ticks itself off, and the card leaves on its own once they're all done.
          </InfoTip>
        </p>
      </div>
      {shown ? (
        <span className="shrink-0 text-sm font-semibold text-[color:var(--ds-good)]">It's back at the top</span>
      ) : (
        <button type="button" onClick={restore} disabled={busy} className="ds-btn ds-btn-outline ds-btn-sm shrink-0">
          Show on Home
        </button>
      )}
    </div>
  );
}
