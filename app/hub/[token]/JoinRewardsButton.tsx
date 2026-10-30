"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star } from "lucide-react";

/** "Join rewards" in the client hub → POST /api/hub/loyalty (hub-token authed). */
export default function JoinRewardsButton({ token, words }: { token: string; words: { one: string; other: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<number | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hub/loyalty", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't join just now — please try again.");
        return;
      }
      setJoined(Number(data?.balance ?? 0));
      router.refresh();
    } catch {
      setError("Couldn't join just now — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (joined !== null) {
    return (
      <p className="text-sm font-medium text-green-700">
        You&apos;re in — {joined} {joined === 1 ? words.one : words.other}.
      </p>
    );
  }
  return (
    <div className="text-right">
      <button
        type="button"
        onClick={join}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />} Join rewards
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
