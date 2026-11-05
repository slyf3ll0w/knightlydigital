"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution, ctaLabelFor, trackSiteEvent } from "@/lib/site-track";

/**
 * Mounted once in the marketing layout. Remembers how the visitor arrived
 * (UTM tags, outside referrer, landing page) and records a SiteEvent when
 * they click a call-to-action: Get started, Log in, the phone number, or a
 * free tool. Anything else on the site is Cloudflare Web Analytics' job.
 * Renders nothing.
 */
export default function WBAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    captureAttribution();
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      const el = target?.closest?.("a[href], [data-wb-event]") as HTMLElement | null;
      if (!el) return;
      const explicit = el.getAttribute("data-wb-event");
      if (explicit) {
        trackSiteEvent("cta_click", explicit);
        return;
      }
      const href = el.getAttribute("href") ?? "";
      const label = ctaLabelFor(href);
      if (label) trackSiteEvent("cta_click", label);
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
