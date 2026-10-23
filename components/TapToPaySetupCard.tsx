"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Nfc, RefreshCw } from "lucide-react";
import { InfoTip } from "@/components/ds";
import { nativeTapToPay, tapToPayError, type TapToPayPlugin, type TapToPayStatus } from "@/lib/native-tap-to-pay";
import { tapToPayFailureText } from "@/lib/tap-to-pay-shared";
import { GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Settings → Online Payments → "Tap to Pay on this phone". Lives under the
 * Connected row and renders ONLY inside the phone app (no plugin = nothing,
 * so a desktop never sees a card it can't use). One-time setup per phone:
 * location permission → authorize the SDK with the seller's token → the
 * Apple ID terms sheet on iOS. Owners/admins only, per Square's guidance.
 * A grant that predates the in-person scope says so and offers Reconnect.
 */
export default function TapToPaySetupCard({
  inPerson,
  isManager,
  isOwner,
}: {
  /** The company's Square grant carries PAYMENTS_WRITE_IN_PERSON. */
  inPerson: boolean;
  isManager: boolean;
  isOwner: boolean;
}) {
  const [plugin, setPlugin] = useState<TapToPayPlugin | null>(null);
  const [status, setStatus] = useState<TapToPayStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    const p = nativeTapToPay();
    setPlugin(p);
    if (!p) return;
    p.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!plugin) return null;

  const ready = Boolean(status?.authorized && status.capable && status.appleLinked !== false);
  const line = !status
    ? "Checking this phone…"
    : !status.configured
      ? "Not available in this version of the app yet."
      : !status.capable
        ? "This phone can't take Tap to Pay."
        : !inPerson
          ? "Reconnect Square to turn on Tap to Pay."
          : ready
            ? "Ready — the client holds their card to the back of this phone."
            : status.authorized && status.appleLinked === false
              ? "One step left: link your Apple ID."
              : "Not set up on this phone yet.";

  async function setUp() {
    if (!plugin || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const perms = await plugin.requestPermissions();
      if (!perms.location) {
        setNote({ tone: "bad", text: tapToPayFailureText("LOCATION_DENIED") });
        return;
      }
      const res = await fetch("/api/app/square/mobile-token", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { accessToken?: string; locationId?: string; environment?: "sandbox" | "production"; error?: string }
        | null;
      if (!res.ok || !data?.accessToken || !data.locationId || !data.environment) {
        setNote({ tone: "bad", text: data?.error ?? GENERIC_ERROR });
        return;
      }
      if (status?.authorized) await plugin.deauthorize().catch(() => {});
      const auth = await plugin.authorize({ accessToken: data.accessToken, locationId: data.locationId, environment: data.environment });
      if (!auth.ok) {
        setNote({ tone: "bad", text: tapToPayFailureText("NOT_AUTHORIZED") });
        return;
      }
      let s = await plugin.status();
      if (s.platform === "ios" && s.appleLinked === false) {
        const link = await plugin.linkAppleAccount();
        if (!link.linked) {
          setStatus(s);
          setNote({ tone: "bad", text: tapToPayFailureText("APPLE_NOT_LINKED") });
          return;
        }
        s = await plugin.status();
      }
      setStatus(s);
      setNote({ tone: "good", text: "Tap to Pay is ready on this phone." });
    } catch (err) {
      const { code, message } = tapToPayError(err);
      setNote({ tone: "bad", text: tapToPayFailureText(code, message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <Nfc size={15} className="text-[color:var(--ds-primary)]" />
        Tap to Pay on this phone
        <InfoTip>
          Take a card in person: the client holds their card or phone to the back of yours. It runs through your Square account at Square&apos;s in-person rate. iPhone XS or newer, or a recent Android phone. Set it up once per phone; owners and admins only.
        </InfoTip>
      </div>
      <p className={`flex items-center gap-1.5 text-sm ${ready && inPerson ? "text-[color:var(--ds-good)]" : "text-gray-600"}`}>
        {ready && inPerson && <Check size={14} />}
        {line}
      </p>
      {note && (
        <p className={`text-xs ${note.tone === "good" ? "text-[color:var(--ds-good)]" : "text-[color:var(--ds-bad)]"}`}>{note.text}</p>
      )}
      {isManager && status?.configured && status.capable && (
        <div className="flex flex-wrap items-center gap-2">
          {!inPerson ? (
            isOwner ? (
              <a href="/api/app/square/connect" className="btn-secondary">
                <RefreshCw size={11} /> Reconnect Square
              </a>
            ) : (
              <span className="text-xs text-gray-500">Only the account owner can reconnect Square.</span>
            )
          ) : (
            <button type="button" onClick={setUp} disabled={busy} className={ready ? "btn-secondary" : "btn-primary"}>
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Nfc size={11} />}
              {ready ? "Set up again" : "Set up"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
