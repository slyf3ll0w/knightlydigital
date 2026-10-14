"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { alertSheet } from "@/components/ConfirmSheet";
import InfoTip from "@/components/ds/InfoTip";

/**
 * Settings → Company: bring the Get started checklist back to Home after
 * it was hidden (POST /api/app/setup/restore). It still leaves on its own
 * once every core item is done.
 */
export default function GetStartedRow() {
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
  }

  return (
    <div className="card-ledger mb-6 flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
        <ListChecks size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
          Get started checklist
          <InfoTip label="What is the Get started checklist?">
            The setup steps at the top of Home. Each one ticks itself off, and the card leaves on its own once they're all done.
          </InfoTip>
        </p>
      </div>
      {shown ? (
        <Link href="/app/dashboard" className="btn-tool-line shrink-0 text-sm">
          Open Home
        </Link>
      ) : (
        <button type="button" onClick={restore} disabled={busy} className="btn-tool-line shrink-0 text-sm">
          Show on Home
        </button>
      )}
    </div>
  );
}
