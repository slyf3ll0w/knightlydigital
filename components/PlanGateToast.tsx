"use client";

import { useEffect } from "react";
import { toast } from "@/lib/toast";

/**
 * The one client-side answer to a plan-gate refusal. Every Pro feature's API
 * route answers 402 `{ error, code: "PLAN_REQUIRED", plan, feature }` once
 * PLAN_GATING is live (lib/plan-gate.ts), and the seat cap answers 402
 * `{ error, code: "SEATS_REQUIRED" }`. No form in the app knows those codes,
 * so without this they would all surface as "Something went wrong".
 *
 * Mounted once by AppShell. It wraps window.fetch exactly once (a window flag
 * survives re-mounts and Fast Refresh) and watches same-origin /api/app/*
 * responses: a 402 whose body carries one of the two codes becomes a quiet
 * toast — the body's own `error` sentence ("The Estimator is part of the Pro
 * plan.") — that opens Settings → Plans when tapped. Identical toasts within
 * DEDUPE_MS collapse (a page that fires three gated requests at once says it
 * once). Background beats (location pings, presence) are skipped: a 402 there
 * is the gate doing its job, not something the person just asked for.
 *
 * The wrapper never throws and never alters the response: the original
 * promise is returned as-is and the body is read from a clone.
 */

const FLAG = "__wbPlanGateToast";
const DEDUPE_MS = 5_000;
const CODES = new Set(["PLAN_REQUIRED", "SEATS_REQUIRED"]);
/** Pollers and beats that run on their own — never the person's action, so never a toast. */
const SKIP = /^\/api\/app\/(location|presence|nav-counts|notifications|softphone|telemetry|assistant\/live)(\/|$)/;
const PLANS_HREF = "/app/settings/plans";

type FlaggedWindow = Window & { [FLAG]?: boolean };

export function installPlanGateToast(): void {
  if (typeof window === "undefined") return;
  const w = window as FlaggedWindow;
  if (w[FLAG]) return;
  w[FLAG] = true;

  const original = window.fetch;
  const recent = new Map<string, number>();

  const show = (message: string) => {
    const now = Date.now();
    const last = recent.get(message);
    if (last !== undefined && now - last < DEDUPE_MS) return;
    recent.set(message, now);
    // keep the dedupe map small
    for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
    toast(message, { tone: "neutral", href: PLANS_HREF });
  };

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const pending = original.call(window, input, init);
    try {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.href);
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/app/") && !SKIP.test(url.pathname)) {
        pending
          .then((res) => {
            if (!res || res.status !== 402) return;
            return res
              .clone()
              .json()
              .then((body: unknown) => {
                const b = body as { code?: unknown; error?: unknown } | null;
                if (!b || typeof b !== "object" || typeof b.code !== "string" || !CODES.has(b.code)) return;
                const message =
                  typeof b.error === "string" && b.error.trim() ? b.error.trim() : "This is part of a paid plan.";
                show(message);
              });
          })
          .catch(() => {
            // a failed request, or a 402 that wasn't JSON: nothing to say
          });
      }
    } catch {
      // never let the watcher break a request
    }
    return pending;
  } as typeof window.fetch;
}

export default function PlanGateToast() {
  useEffect(() => {
    installPlanGateToast();
  }, []);
  return null;
}
