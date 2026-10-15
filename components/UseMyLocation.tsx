"use client";

import { useEffect, useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import type { AddressSuggestion } from "@/lib/geocoding";

/**
 * "Use my location" — fills an address form from the phone's GPS. Reads the
 * position in the browser (the OS asks for permission the first time), then
 * /api/app/geocode/reverse turns it into street / city / state / ZIP and
 * `onFill` writes those into the form. Nothing is stored server-side; this is
 * a one-shot convenience for a tech standing at a new client's door.
 *
 * Renders nothing where the browser has no geolocation (SSR, very old
 * webviews). Errors show inline under the button and clear on the next try.
 */
export default function UseMyLocation({
  onFill,
  className = "",
  size = "sm",
}: {
  onFill: (address: AddressSuggestion) => void;
  className?: string;
  /** `sm` = text link style (form headers); `xs` = compact, for tight sheets. */
  size?: "sm" | "xs";
}) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAvailable(typeof navigator !== "undefined" && "geolocation" in navigator);
  }, []);

  if (!available) return null;

  async function locate() {
    setError("");
    setBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 30_000,
        })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      const res = await fetch(`/api/app/geocode/reverse?lat=${lat}&lng=${lng}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { address?: AddressSuggestion | null; error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Couldn't look up that location — type the address instead.");
      } else if (!data?.address) {
        setError("Couldn't match your location to a street address — type it instead.");
      } else {
        onFill(data.address);
      }
    } catch (err) {
      const code = (err as GeolocationPositionError | null)?.code;
      setError(
        code === 1
          ? "Location is turned off for WorkBench. Allow it in your phone's settings, then try again."
          : code === 3
            ? "Your phone couldn't get a fix in time — try again outside or type the address."
            : "Couldn't read your location — type the address instead."
      );
    } finally {
      setBusy(false);
    }
  }

  const text = size === "xs" ? "text-xs" : "text-sm";
  return (
    <div className={className}>
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        className={`ds-link inline-flex items-center gap-1 ${text} font-medium disabled:opacity-60`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
        {busy ? "Finding you…" : "Use my location"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-[color:var(--ds-bad,#B91C1C)]">
          {error}
        </p>
      )}
    </div>
  );
}
