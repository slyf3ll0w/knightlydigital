"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { FINIX_JS_SRC, type FinixConfig, type FinixForm } from "@/lib/finix-js";

/**
 * finix.js hosted card fields — the one tokenizer for public pages that take
 * a card without an invoice in hand (online booking). Loads finix.js from
 * Finix's CDN (self-hosting breaks PCI scope), mounts the hosted iframe
 * fields, and hands back a one-time token on `tokenize()`. Card data never
 * touches this page or our servers. Same options and styling as the pay
 * page's mount so the two read as one form.
 */
export type CardFieldsHandle = {
  /** Resolve a TK… token, or null when the form has errors / isn't ready. */
  tokenize: () => Promise<string | null>;
};

const CardFields = forwardRef<
  CardFieldsHandle,
  {
    finix: NonNullable<FinixConfig>;
    /** Called as the hosted form's validity changes. */
    onValidity?: (valid: boolean) => void;
    dark?: boolean;
    accent?: string;
  }
>(function CardFields({ finix, onValidity, dark = false, accent = "#22C55E" }, ref) {
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

export default CardFields;
