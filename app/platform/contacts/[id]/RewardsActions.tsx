"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal, UserPlus } from "lucide-react";
import Modal from "@/components/Modal";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { toast } from "@/lib/toast";

/** Enroll (not yet a member) or Adjust points (a member) on the contact page's rewards card. Managers only. */
export default function RewardsActions({ contactId, enrolled, canManage, words }: { contactId: string; enrolled: boolean; canManage: boolean; words: { one: string; other: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!canManage) return null;

  async function enroll() {
    setBusy(true);
    try {
      const { ok, data } = await postJson<{ account: { balance: number } }>("/api/app/payments/square/loyalty/enroll", { contactId });
      if (!ok || !data) return toast(data?.error ?? GENERIC_ERROR, { tone: "bad" });
      toast(`Enrolled — ${data.account.balance} ${data.account.balance === 1 ? words.one : words.other}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function adjust() {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await postJson<{ account: { balance: number } }>("/api/app/payments/square/loyalty/adjust", { contactId, points: Number(points), reason });
      if (!ok || !data) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      toast(`Now ${data.account.balance} ${data.account.balance === 1 ? words.one : words.other}`);
      setOpen(false);
      setPoints("");
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!enrolled) {
    return (
      <button type="button" className="btn-secondary btn-sm" onClick={enroll} disabled={busy}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Enroll in rewards
      </button>
    );
  }
  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";
  return (
    <>
      <button type="button" className="btn-secondary btn-sm" onClick={() => (setError(null), setOpen(true))}>
        <SlidersHorizontal size={13} /> Adjust {words.other}
      </button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} size="sm">
        {open && (
          <div className="ds">
            <h2 className="ds-h2">Adjust {words.other}</h2>
            <p className="ds-body mt-1">A plus number adds, a minus number removes. The reason shows in Square&apos;s history.</p>
            <div className="mt-4 space-y-3">
              <input value={points} onChange={(e) => setPoints(e.target.value)} inputMode="numeric" className={`${field} numeral-ledger`} placeholder="+50 or -20" aria-label="Points" autoFocus />
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={field} placeholder="Why (e.g. counter sale, make-good)" aria-label="Reason" />
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-[color:var(--ds-bad)]">
                {error}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={adjust} disabled={busy || !Number(points) || !reason.trim()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
