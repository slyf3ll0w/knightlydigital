"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { SquareClientConfig } from "@/lib/pay-config";
import {
  loadSquareJs,
  squareCardStyle,
  squareTokenError,
  type SquareCardInstance,
  type SquarePaymentsInstance,
} from "@/lib/square-js";

/**
 * Square Web Payments SDK card fields — the one Square tokenizer behind every
 * card form (pay page, booking, client hub, staff card forms). Loads
 * square.js from Square's CDN (never bundled: PCI), mounts the hosted card
 * iframe into our container, and hands back a one-time `cnon:…` token on
 * `tokenize()`. Card data never touches this page or our servers.
 *
 * Same handle as the finix.js CardFields so callers don't care which
 * processor is live: `tokenize()` resolves the token, or null (with the
 * reason in `lastError`) when the form has errors / isn't ready.
 */
export type SquareCardFieldsHandle = {
  tokenize: () => Promise<string | null>;
  /** Why the last tokenize() returned null (shown by the caller). */
  lastError: () => string;
};

const SquareCardFields = forwardRef<
  SquareCardFieldsHandle,
  {
    config: SquareClientConfig;
    /** The card iframe is mounted and can be tokenized. */
    onReady?: (ready: boolean) => void;
    dark?: boolean;
    accent?: string;
    /** Extra classes on the loading line (lets dark pages tint it). */
    className?: string;
  }
>(function SquareCardFields({ config, onReady, dark = false, accent = "#22C55E", className }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<SquareCardInstance | null>(null);
  const paymentsRef = useRef<SquarePaymentsInstance | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loadError, setLoadError] = useState("");
  const lastErrorRef = useRef("");
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    let card: SquareCardInstance | null = null;
    setMounted(false);
    setLoadError("");
    onReadyRef.current?.(false);
    (async () => {
      try {
        await loadSquareJs(config.environment);
        if (cancelled || !window.Square || !containerRef.current) return;
        const payments = paymentsRef.current ?? window.Square.payments(config.applicationId, config.locationId);
        paymentsRef.current = payments;
        try {
          card = await payments.card({ style: squareCardStyle({ dark, accent }) });
        } catch (styleErr) {
          // Square validates the style against its own whitelist and throws
          // for anything it doesn't know. A rejected style must never cost a
          // payment: mount plain and log what it disliked.
          if ((styleErr as { name?: string })?.name !== "InvalidStylesError") throw styleErr;
          console.error("[square] card style rejected, mounting unstyled", styleErr);
          card = await payments.card();
        }
        if (cancelled) {
          await card.destroy().catch(() => {});
          return;
        }
        containerRef.current.innerHTML = "";
        await card.attach(containerRef.current);
        if (cancelled) {
          await card.destroy().catch(() => {});
          return;
        }
        cardRef.current = card;
        setMounted(true);
        onReadyRef.current?.(true);
      } catch (err) {
        if (cancelled) return;
        console.error("[square] card form failed to mount", err);
        setLoadError("The secure card form couldn't load. Please refresh and try again.");
      }
    })();
    return () => {
      cancelled = true;
      onReadyRef.current?.(false);
      const c = cardRef.current ?? card;
      cardRef.current = null;
      if (c) c.destroy().catch(() => {});
    };
    // The SDK instance is keyed on app + location; restyling re-mounts.
  }, [config.applicationId, config.locationId, config.environment, dark, accent]);

  useImperativeHandle(
    ref,
    () => ({
      tokenize: async () => {
        const card = cardRef.current;
        if (!card) {
          lastErrorRef.current = squareTokenError(null);
          return null;
        }
        try {
          const result = await card.tokenize();
          if (result.status === "OK" && result.token) {
            lastErrorRef.current = "";
            return result.token;
          }
          lastErrorRef.current = squareTokenError(result);
          return null;
        } catch (err) {
          console.error("[square] tokenize failed", err);
          lastErrorRef.current = "Please check your card details and try again.";
          return null;
        }
      },
      lastError: () => lastErrorRef.current,
    }),
    []
  );

  return (
    <div>
      {!mounted && !loadError && (
        <p className={`flex items-center gap-2 text-sm ${dark ? "text-gray-400" : "text-gray-500"} ${className ?? ""}`}>
          <Loader2 size={14} className="animate-spin" /> Loading secure card form…
        </p>
      )}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {/* Square renders its hosted card iframe into this container */}
      <div ref={containerRef} className="wb-square-card" />
      {config.environment === "sandbox" && mounted && (
        <p className="mt-1 text-[11px] text-amber-600">Test mode — no real charges.</p>
      )}
    </div>
  );
});

export default SquareCardFields;
