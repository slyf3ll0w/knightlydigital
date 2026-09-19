"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Business line (lib/business-line.ts) as support sees it: the number, where
 * it forwards, and the 10DLC registration chain with Telnyx's raw statuses —
 * the thing to read before answering "why aren't my texts going out" — and
 * whether voice runs through Call Control (lib/voice.ts) or plain
 * forwarding. Actions: attach an owned number, move it onto the voice app,
 * call off a scheduled release, or Release it for good.
 */
export function LineControl({
  companyId,
  number,
  forwardTo,
  provisionedAt,
  releaseAt,
  voiceAppAt,
  voiceAvailable,
  callerIdName,
  registration,
}: {
  companyId: string;
  number: string | null;
  forwardTo: string | null;
  provisionedAt: string | null;
  /** Post-cancellation release date (lib/business-line.ts runLineReleaseSweep); null = keeping. */
  releaseAt: string | null;
  /** When the number moved onto the Call Control app (lib/voice.ts); null = number-level forwarding. */
  voiceAppAt: string | null;
  /** TELNYX_VOICE_APP_ID is set on this server. */
  voiceAvailable: boolean;
  /** CNAM listing on the number; null = none. */
  callerIdName: string | null;
  registration: {
    status: string;
    kind: string;
    entityType: string;
    legalName: string;
    brandStatus: string | null;
    campaignStatus: string | null;
    assignmentStatus: string | null;
    verificationStatus: string | null;
    rejectionReason: string | null;
    submittedAt: string;
    approvedAt: string | null;
    lastCheckedAt: string | null;
  } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attach, setAttach] = useState("");

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  async function release() {
    if (!number) return;
    if (!window.confirm(`Release ${number}? The number goes back to Telnyx and the texting registration is deleted. This cannot be undone.`)) return;
    await send({ action: "line-release" });
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const statusTone =
    registration?.status === "ACTIVE"
      ? "bg-green-100 text-green-700"
      : registration?.status === "REJECTED"
        ? "bg-red-100 text-red-700"
        : registration
          ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-600";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-gray-700">Business line (Telnyx)</h2>
      {!number ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-gray-500">
            No number provisioned. The company buys one from Settings → Features, or attach a number the
            Telnyx account already owns (a toll-free bought by hand, a ported number):
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={attach}
              onChange={(e) => setAttach(e.target.value)}
              placeholder="+1 833 555 0100"
              inputMode="tel"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => send({ action: "line-attach", phoneNumber: attach })}
              disabled={busy || attach.replace(/\D/g, "").length < 10}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Attach number
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-gray-500">Number</dt>
            <dd className="font-mono text-gray-800">{number}</dd>
            <dt className="text-gray-500">Calls ring</dt>
            <dd className="font-mono text-gray-800">{forwardTo ?? "nowhere (voicemail only)"}</dd>
            <dt className="text-gray-500">Caller ID name</dt>
            <dd className="font-mono text-gray-800">{callerIdName ?? "none"}</dd>
            <dt className="text-gray-500">Voice</dt>
            <dd className="text-gray-800">
              {voiceAppAt ? (
                <>Call Control (whisper, voicemail, app calls) since {fmt(voiceAppAt)}</>
              ) : voiceAvailable ? (
                <>
                  plain forwarding ·{" "}
                  <button type="button" onClick={() => send({ action: "line-voice-sync" })} disabled={busy} className="underline">
                    move onto the voice app
                  </button>
                </>
              ) : (
                "plain forwarding (TELNYX_VOICE_APP_ID not set)"
              )}
            </dd>
            <dt className="text-gray-500">Provisioned</dt>
            <dd className="text-gray-800">{fmt(provisionedAt)}</dd>
            {releaseAt && (
              <>
                <dt className="text-red-600">Release scheduled</dt>
                <dd className="text-red-700">
                  {fmt(releaseAt)} (add-on lapsed) ·{" "}
                  <button type="button" onClick={() => send({ action: "line-keep" })} disabled={busy} className="underline">
                    keep the number
                  </button>
                </dd>
              </>
            )}
            <dt className="text-gray-500">Texting</dt>
            <dd>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>
                {registration?.status ?? "NOT REGISTERED"}
              </span>
            </dd>
            {registration && (
              <>
                <dt className="text-gray-500">Registered as</dt>
                <dd className="text-gray-800">
                  {registration.legalName} · {registration.entityType === "SOLE_PROPRIETOR" ? "sole prop" : "EIN"} ·{" "}
                  {registration.kind === "TOLL_FREE" ? "toll-free verification" : "10DLC"}
                </dd>
                {registration.kind === "TOLL_FREE" ? (
                  <>
                    <dt className="text-gray-500">Telnyx verification</dt>
                    <dd className="font-mono text-gray-800">{registration.verificationStatus ?? "—"}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-gray-500">Brand / campaign / number</dt>
                    <dd className="font-mono text-gray-800">
                      {registration.brandStatus ?? "—"} / {registration.campaignStatus ?? "—"} / {registration.assignmentStatus ?? "—"}
                    </dd>
                  </>
                )}
                <dt className="text-gray-500">Submitted · checked · approved</dt>
                <dd className="text-gray-800">
                  {fmt(registration.submittedAt)} · {fmt(registration.lastCheckedAt)} · {fmt(registration.approvedAt)}
                </dd>
                {registration.rejectionReason && (
                  <>
                    <dt className="text-red-600">Rejected</dt>
                    <dd className="text-red-700">{registration.rejectionReason}</dd>
                  </>
                )}
              </>
            )}
          </dl>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={release}
              disabled={busy}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Release number
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
