"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip, InfoTip } from "@/components/ds";
import { Input } from "@/components/Input";
import { confirmSheet } from "@/components/ConfirmSheet";

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
    const ok = await confirmSheet({
      title: `Release ${number}?`,
      message: "The number goes back to Telnyx and the texting registration is deleted. This cannot be undone.",
      confirmLabel: "Release number",
      destructive: true,
    });
    if (ok) await send({ action: "line-release" });
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const statusTone =
    registration?.status === "ACTIVE" ? "good" : registration?.status === "REJECTED" ? "bad" : registration ? "warn" : "neutral";

  const row = (k: React.ReactNode, v: React.ReactNode, tone?: "bad") => (
    <>
      <dt className={`ds-small whitespace-nowrap ${tone === "bad" ? "!text-[color:var(--ds-bad)]" : ""}`}>{k}</dt>
      <dd className={`min-w-0 text-[13.5px] ${tone === "bad" ? "text-[color:var(--ds-bad)]" : "text-[color:var(--ds-ink)]"}`}>{v}</dd>
    </>
  );

  return (
    <Card className="p-5">
      <div className="flex items-center gap-1.5">
        <h2 className="ds-h2">Business line</h2>
        <InfoTip>
          The Telnyx number, where calls ring, and the texting registration chain with Telnyx&apos;s raw statuses — read
          this before answering &quot;why aren&apos;t my texts going out&quot;. Filing and re-filing spend carrier fees, so they
          are a person&apos;s click here. Appeal is free when only the flow or samples failed. Release gives the number
          back to Telnyx for good.
        </InfoTip>
      </div>
      {!number ? (
        <div className="mt-3 space-y-3">
          <p className="ds-small">
            No number provisioned. The company buys one from Settings → Phone &amp; texting, or attach a number the
            Telnyx account already owns (a toll-free bought by hand, a ported number):
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={attach}
              onChange={(e) => setAttach(e.target.value)}
              placeholder="+1 833 555 0100"
              inputMode="tel"
              aria-label="Number to attach"
              className="ds-num w-48"
            />
            <Button size="sm" onClick={() => send({ action: "line-attach", phoneNumber: attach })} disabled={busy || attach.replace(/\D/g, "").length < 10}>
              Attach number
            </Button>
          </div>
          {error && <p className="text-sm text-[color:var(--ds-bad)]">{error}</p>}
        </div>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-2">
            {row("Number", <span className="ds-num">{number}</span>)}
            {row("Calls ring", <span className="ds-num">{forwardTo ?? "nowhere (voicemail only)"}</span>)}
            {row("Caller ID name", callerIdName ?? "none")}
            {row(
              "Voice",
              voiceAppAt ? (
                <>Call Control (whisper, voicemail, app calls) since {fmt(voiceAppAt)}</>
              ) : voiceAvailable ? (
                <>
                  plain forwarding ·{" "}
                  <button type="button" onClick={() => send({ action: "line-voice-sync" })} disabled={busy} className="ds-link">
                    move onto the voice app
                  </button>
                </>
              ) : (
                "plain forwarding (TELNYX_VOICE_APP_ID not set)"
              )
            )}
            {row("Provisioned", fmt(provisionedAt))}
            {releaseAt &&
              row(
                "Release scheduled",
                <>
                  {fmt(releaseAt)} (add-on lapsed) ·{" "}
                  <button type="button" onClick={() => send({ action: "line-keep" })} disabled={busy} className="ds-link">
                    keep the number
                  </button>
                </>,
                "bad"
              )}
            {row("Texting", <Chip tone={statusTone}>{registration?.status ?? "NOT REGISTERED"}</Chip>)}
            {registration && (
              <>
                {row(
                  "Registered as",
                  <>
                    {registration.legalName} · {registration.entityType === "SOLE_PROPRIETOR" ? "sole prop" : "EIN"} ·{" "}
                    {registration.kind === "TOLL_FREE" ? "toll-free verification" : "10DLC"}
                  </>
                )}
                {registration.kind === "TOLL_FREE"
                  ? row("Telnyx verification", <span className="ds-num">{registration.verificationStatus ?? "—"}</span>)
                  : row(
                      "Brand / campaign / number",
                      <span className="ds-num">
                        {registration.brandStatus ?? "—"} / {registration.campaignStatus ?? "—"} / {registration.assignmentStatus ?? "—"}
                      </span>
                    )}
                {row(
                  "Submitted · checked · approved",
                  <>
                    {fmt(registration.submittedAt)} · {fmt(registration.lastCheckedAt)} · {fmt(registration.approvedAt)}
                  </>
                )}
                {registration.rejectionReason &&
                  row(registration.status === "AWAITING_REVIEW" ? "Previous rejection" : "Rejected", registration.rejectionReason, "bad")}
                {registration.kind === "10DLC" &&
                  registration.status === "REJECTED" &&
                  (registration.campaignStatus === "TELNYX_FAILED" || registration.campaignStatus === "MNO_REJECTED") &&
                  row(
                    "Appeal",
                    <span className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await confirmSheet({
                            title: "Appeal this campaign with Telnyx?",
                            message:
                              "The current message flow, samples and HELP reply are pushed into the campaign and Telnyx compliance re-reviews it by hand. No new campaign, no fee unless it passes. If the rejection names the description, the opt-in/opt-out replies or the privacy policy, an appeal can't fix it and this will say so: use Re-file.",
                            confirmLabel: "Appeal",
                          });
                          if (ok) void send({ action: "line-appeal" });
                        }}
                      >
                        Appeal with current copy
                      </Button>
                      <span className="ds-small">Free, when only the flow or samples failed. Description, keyword replies or privacy/terms → Re-file (new campaign, $15; the failed one is retired).</span>
                    </span>
                  )}
                {registration.kind === "10DLC" &&
                  row(
                    "STOP/HELP replies",
                    <span className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => void send({ action: "line-keywords" })} disabled={busy}>
                        Set brand-named replies
                      </Button>
                      <span className="ds-small">Free. Moves the number to its own messaging profile whose STOP / START / HELP replies name the business (filing does this too).</span>
                    </span>
                  )}
                {(registration.status === "AWAITING_REVIEW" || registration.status === "REJECTED" || registration.status === "QUEUED") &&
                  row(
                    "File with Telnyx",
                    <span className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          const fees =
                            registration.kind === "TOLL_FREE"
                              ? "Toll-free verification is free."
                              : registration.brandStatus === "VERIFIED" || registration.brandStatus === "VETTED_VERIFIED"
                                ? "Re-uses the verified brand; files a campaign: $15 review + $4.50."
                                : "Files a brand ($4.50), then a campaign once verified ($15 review + $4.50).";
                          const ok = await confirmSheet({
                            title: "Send this registration to Telnyx now?",
                            message: fees,
                            confirmLabel: registration.status === "AWAITING_REVIEW" ? "Approve and file" : "Re-file",
                          });
                          if (ok) void send({ action: "line-file" });
                        }}
                      >
                        {registration.status === "AWAITING_REVIEW" ? "Approve and file" : "Re-file now"}
                      </Button>
                      <span className="ds-small">
                        {registration.status === "AWAITING_REVIEW"
                          ? "The tenant is waiting on this — nothing has been sent to Telnyx yet."
                          : registration.status === "QUEUED"
                            ? "Queued for funds; the hourly sweep files it on its own, or file it now."
                            : "Only after the cause is fixed — each submission is a carrier fee."}
                      </span>
                    </span>
                  )}
              </>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={release} disabled={busy} className="!text-[color:var(--ds-bad)]">
              Release number
            </Button>
            {error && <span className="text-sm text-[color:var(--ds-bad)]">{error}</span>}
          </div>
        </>
      )}
    </Card>
  );
}
