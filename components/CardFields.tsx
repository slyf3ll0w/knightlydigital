"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { FINIX_JS_SRC, type FinixForm } from "@/lib/finix-js";
import type { ClientPayConfig, FinixClientConfig } from "@/lib/pay-config";
import SquareCardFields from "@/components/SquareCardFields";

/**
 * Hosted card fields — the one tokenizer for public pages that take a card
 * without an invoice in hand (online booking). Picks the live processor's
 * form from `pay` (lib/pay-config.ts): Square's Web Payments SDK card, or
 * finix.js. Either way the processor's CDN script mounts iframe fields
 * (never self-hosted: PCI) and hands back a one-time token on `tokenize()`.
 * Card data never touches this page or our servers.
 */
export type CardFieldsHandle = {
  /** Resolve a one-time token, or null when the form has errors / isn't ready. */
  tokenize: () => Promise<string | null>;
  /** Why the last tokenize() returned null. */
  lastError: () => string;
};

type CardFieldsProps = {
  pay: NonNullable<ClientPayConfig>;
  /** Called as the hosted form's validity / readiness changes. */
  onValidity?: (valid: boolean) => void;
  dark?: boolean;
  accent?: string;
};

const CardFields = forwardRef<CardFieldsHandle, CardFieldsProps>(function CardFields(props, ref) {
  if (props.pay.processor === "square") {
    return (
      <SquareCardFields
        ref={ref}
        config={props.pay}
        dark={props.dark}
        accent={props.accent}
        onReady={props.onValidity}
      />
    );
  }
  return <FinixCardFields ref={ref} {...props} finix={props.pay} />;
});

export default CardFields;

const FinixCardFields = forwardRef<
  CardFieldsHandle,
  CardFieldsProps & { finix: FinixClientConfig }
>(function FinixCardFields({ finix, onValidity, dark = false, accent = "#22C55E" }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<FinixForm | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const onValidityRef = useRef(onValidity);
  onValidityRef.current = onValidity;

  useEffect(() => {
    if (window.Finix) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector(`script[src="${FINIX_JS_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => setScriptReady(true);
    script.addEventListener("load", onLoad);
    if (!existing) {
      (script as HTMLScriptElement).src = FINIX_JS_SRC;
      document.head.appendChild(script);
    }
    return () => script.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    if (!scriptReady || !window.Finix || !containerRef.current) return;
    containerRef.current.innerHTML = "";
    onValidityRef.current?.(false);
    formRef.current = window.Finix.PaymentForm(containerRef.current, finix.environment, finix.applicationId, {
      paymentMethods: ["card"],
      showLabels: true,
      showPlaceholders: true,
      showAddress: false,
      requiredFields: ["card_holder_name"],
      onUpdate: (_state: unknown, _bin: unknown, hasErrors: boolean) => {
        onValidityRef.current?.(!hasErrors);
      },
      styles: {
        default: {
          input: {
            default: {
              border: `1px solid ${dark ? "rgba(255,255,255,0.15)" : "#D1D5DB"}`,
              borderRadius: "8px",
              fontSize: "14px",
              ...(dark ? { backgroundColor: "rgba(255,255,255,0.05)", color: "#ffffff" } : {}),
            },
            focused: { border: `1px solid ${accent}`, boxShadow: `0 0 0 2px ${accent}40` },
            error: { border: "1px solid #F87171" },
          },
          ...(dark ? { label: { color: "#D1D5DB" } } : {}),
        },
      },
    });
    setMounted(true);
  }, [scriptReady, finix.environment, finix.applicationId, dark, accent]);

  useImperativeHandle(
    ref,
    () => ({
      tokenize: () =>
        new Promise<string | null>((resolve) => {
          if (!formRef.current) return resolve(null);
          formRef.current.submit((err, res) => {
            const token = res?.data?.id;
            resolve(err || !token ? null : token);
          });
        }),
      lastError: () => "Please check your card details and try again.",
    }),
    []
  );

  return (
    <div>
      {!mounted && (
        <p className={`flex items-center gap-2 text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>
          <Loader2 size={14} className="animate-spin" /> Loading secure card form…
        </p>
      )}
      <div ref={containerRef} />
      {finix.environment === "sandbox" && (
        <p className="mt-1 text-[11px] text-amber-600">Test mode — no real charges.</p>
      )}
    </div>
  );
});
