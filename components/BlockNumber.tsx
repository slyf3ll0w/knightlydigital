"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { confirmSheet, alertSheet } from "@/components/ConfirmSheet";
import { fmtPhone } from "@/lib/format";

/**
 * Block / unblock a phone number (lib/blocked-numbers.ts, ticket #bwggje).
 * `useBlockedNumber` reads whether the number is blocked and flips it, with
 * the confirmation; `BlockNumberButton` is the quiet link the call page
 * shows, and menus build their own row from the hook.
 */
export function useBlockedNumber(number: string | null | undefined, who?: string) {
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const usable = Boolean(number && number !== "unknown" && number.replace(/\D/g, "").length >= 10);

  useEffect(() => {
    if (!usable || !number) return;
    let live = true;
    fetch(`/api/app/blocked-numbers?phone=${encodeURIComponent(number)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { isBlocked?: boolean } | null) => {
        if (live && j) setBlocked(Boolean(j.isBlocked));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [number, usable]);

  const toggle = useCallback(async () => {
    if (!usable || !number || busy) return;
    const pretty = fmtPhone(number) || number;
    const name = who && who !== pretty ? `${who} (${pretty})` : pretty;
    const next = !blocked;
    if (
      next &&
      !(await confirmSheet({
        title: `Block ${name}?`,
        message: "Calls from this number won't ring and can't leave a voicemail, and its texts won't reach Messages. You can still call and text them, and you can unblock the number any time.",
        confirmLabel: "Block number",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      const res = next
        ? await fetch("/api/app/blocked-numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: number, label: who && who !== pretty ? who : null }) })
        : await fetch(`/api/app/blocked-numbers?phone=${encodeURIComponent(number)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        alertSheet({ message: data?.error || "That didn't save. Try again." });
        return;
      }
      setBlocked(next);
    } catch {
      alertSheet({ message: "That didn't save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }, [usable, number, busy, blocked, who]);

  return { usable, blocked, busy, toggle };
}

export function BlockNumberButton({ number, who, className = "" }: { number: string; who?: string; className?: string }) {
  const b = useBlockedNumber(number, who);
  if (!b.usable || b.blocked === null) return null;
  return (
    <button
      type="button"
      onClick={() => void b.toggle()}
      disabled={b.busy}
      data-blocked={b.blocked ? "1" : "0"}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors disabled:opacity-60 ${
        b.blocked ? "text-[color:var(--ds-bad)] hover:bg-[color:var(--ds-bad-soft)]" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      } ${className}`}
    >
      <Ban size={13} />
      {b.blocked ? "Blocked · Unblock" : "Block this number"}
    </button>
  );
}
