"use client";

import { useEffect } from "react";

/**
 * Pins a page to the LIGHT theme regardless of the viewer's device/system
 * dark preference or the company's chosen theme. Used on onboarding
 * (register/login/setup) and every client-facing surface (quotes, invoices,
 * the client hub, payments, contracts, booking) — none of those should ever
 * inherit the operator's dark mode.
 *
 * The dark bridge in globals.css is entirely gated on html[data-mode="dark"],
 * so stamping data-mode="light" here neutralizes it for the whole subtree.
 * A matching pathname check in the pre-paint script (app/layout.tsx) forces
 * light before first paint on full loads so there's no dark flash; this
 * component covers client-side (SPA) navigation and, on unmount, hands
 * control back to the device theme so returning to the themed app restores
 * dark mode.
 */
export default function ForceLightTheme() {
  useEffect(() => {
    document.documentElement.dataset.mode = "light";
    return () => {
      const applyHubTheme = (window as unknown as { applyHubTheme?: () => void })
        .applyHubTheme;
      if (typeof applyHubTheme === "function") applyHubTheme();
    };
  }, []);
  return null;
}
