"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { purgeRouterCache } from "@/lib/router-cache";

/**
 * Keeps an open invoice page honest about payments (David 2026-11-24: a
 * sandbox card charge left the page unpaid until a manual reload).
 *
 * The page refreshes itself when the invoice's status or the money paid on it
 * changes, from wherever the payment came from:
 *  - right after a charge made on this page (InvoiceActions / tap to pay fire
 *    `wb:invoice-payment`): a quick check every 1.5 s for ~20 s, which also
 *    catches a charge the processor confirms a moment later (webhook);
 *  - when the tab comes back into view (the client paid from the link in
 *    another tab, a teammate recorded a check);
 *  - while the page sits open and unpaid: a slow check every 20 s, for up to
 *    30 minutes, only while the tab is visible.
 * A refresh re-renders the server page, so the Paid stamp and celebration
 * play as they do for any payment. Reads GET /api/app/invoices/[id]/status.
 */
export default function InvoiceLiveStatus({
  invoiceId,
  status,
  paid,
}: {
  invoiceId: string;
  status: string;
  paid: number;
}) {
  const router = useRouter();
  const known = useRef({ status, paid });
  known.current = { status, paid };

  useEffect(() => {
    let alive = true;
    let fastUntil = 0;
    let fastTimer: ReturnType<typeof setTimeout> | null = null;
    const mountedAt = Date.now();

    const check = async (): Promise<boolean> => {
      try {
        const r = await fetch(`/api/app/invoices/${invoiceId}/status`, { cache: "no-store" });
        if (!r.ok || !alive) return false;
        const d = (await r.json()) as { status?: string; paid?: number };
        const k = known.current;
        const changed = d.status !== k.status || Math.abs((d.paid ?? 0) - k.paid) > 0.004;
        if (changed) {
          known.current = { status: d.status ?? k.status, paid: d.paid ?? k.paid };
          purgeRouterCache();
          router.refresh();
        }
        return d.status === "PAID";
      } catch {
        return false;
      }
    };

    // Fast checks after a charge on this page
    const fastLoop = async () => {
      if (!alive) return;
      const done = await check();
      if (done || Date.now() > fastUntil || !alive) return;
      fastTimer = setTimeout(fastLoop, 1500);
    };
    const onPayment = (e: Event) => {
      const id = (e as CustomEvent<{ invoiceId?: string }>).detail?.invoiceId;
      if (id && id !== invoiceId) return;
      fastUntil = Date.now() + 20_000;
      if (fastTimer) clearTimeout(fastTimer);
      // the charge route already wrote the payment: refresh now, then keep watching
      purgeRouterCache();
      router.refresh();
      fastTimer = setTimeout(fastLoop, 1500);
    };

    // Back in view: look once
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    // Slow checks while the page sits open, unpaid and visible
    const slow = setInterval(() => {
      if (Date.now() - mountedAt > 30 * 60_000) return clearInterval(slow);
      if (document.visibilityState !== "visible") return;
      if (known.current.status === "PAID" || known.current.status === "ARCHIVED") return;
      if (Date.now() < fastUntil) return;
      void check();
    }, 20_000);

    window.addEventListener("wb:invoice-payment", onPayment);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      if (fastTimer) clearTimeout(fastTimer);
      clearInterval(slow);
      window.removeEventListener("wb:invoice-payment", onPayment);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [invoiceId, router]);

  return null;
}

/** Tell an open invoice page that a payment was just taken on it. */
export function announceInvoicePayment(invoiceId: string) {
  window.dispatchEvent(new CustomEvent("wb:invoice-payment", { detail: { invoiceId } }));
}
