"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { getCapacitor } from "@/components/NativeShell";
import { GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Start the Square consent flow — the one way every "Connect Square" /
 * "Reconnect Square" button opens it (Settings → Online Payments, the
 * payment-setup step, the Tap to Pay card, the Payments page).
 *
 * On the web a plain navigation to /api/app/square/connect redirects to
 * Square. Inside the phone app that link is thrown to the system browser
 * WITHOUT the session (the shell keeps only /app paths in its webview), so
 * owners saw the route's `{"error":"Unauthorized"}` instead of Square
 * (Knight Light, 2026-11-09). Same fix as QuickBooks: fetch the consent URL
 * with the app's cookies, then open it in the system browser via
 * Capacitor's Browser plugin. Square's own sign-in page misbehaves inside
 * webviews, so the browser sheet is the right place for it; the callback
 * finishes there off the signed state and lands on /square-connected.
 * Returns an error line, or null.
 */
export async function startSquareConnect(): Promise<string | null> {
  const browser = getCapacitor()?.Plugins?.Browser;
  if (!browser?.open) {
    window.location.assign("/api/app/square/connect");
    return null;
  }
  try {
    const res = await fetch("/api/app/square/connect?mode=url&native=1", { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!res.ok || !data?.url) return data?.error ?? GENERIC_ERROR;
    await browser.open({ url: data.url });
    return null;
  } catch {
    return "Couldn't reach Square. Check your connection and try again.";
  }
}

export default function ConnectSquareButton({
  className,
  children,
  onError,
}: {
  className?: string;
  children: ReactNode;
  /** Where the error line shows; without it the button renders its own. */
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    if (busy) return;
    setBusy(true);
    setError("");
    const err = await startSquareConnect();
    // On the web the page is navigating away by now; in the shell the
    // browser sheet is up and the button must come back for a retry.
    setBusy(false);
    if (err) {
      if (onError) onError(err);
      else setError(err);
    }
  }

  return (
    <>
      <button type="button" onClick={go} disabled={busy} className={className} aria-busy={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        {children}
      </button>
      {error && !onError && <p className="text-xs text-[color:var(--ds-bad)]">{error}</p>}
    </>
  );
}
