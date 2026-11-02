"use client";

import { useEffect } from "react";
import { resizeKeys } from "@/lib/embed-query";

/**
 * Reports the embed's content height to the host page so the iframe can hug
 * the form instead of using a fixed height (cut-off form or dead gap). The
 * copy-paste snippet in Settings listens for this message and resizes the
 * matching iframe. The slug rides along so multiple embeds on one page don't
 * fight over each other's heights.
 *
 * A business that renamed its web address still has the OLD slug in the
 * `<iframe data-jobflow>` snippets copied before 2026-10-24, and those filter
 * the message on the slug they were copied with — while SlugRedirect lands
 * this page on the new one. So the height is posted once per key: the
 * current slug and every `Company.previousSlugs` entry (`previousSlugs`),
 * each with the same `path` (item or estimate/tool).
 */
export default function EmbedAutoResize({ slug, previousSlugs = [], path = "" }: { slug: string; previousSlugs?: string[]; path?: string }) {
  const keys = resizeKeys(slug, previousSlugs, path).join("\n");
  useEffect(() => {
    const slugs = keys.split("\n").filter(Boolean);
    const post = () => {
      const height = document.documentElement.scrollHeight;
      // "jobflow:height" is the wire protocol name from before the
      // WorkBench rename — keep it: copied snippets on customer
      // sites (e.g. Excellent PC Building) listen for exactly this type.
      for (const key of slugs) window.parent?.postMessage({ type: "jobflow:height", slug: key, height }, "*");
    };

    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    // Fonts/Turnstile load late and shift layout without resizing the root
    const interval = window.setInterval(post, 1500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [keys]);

  return null;
}
