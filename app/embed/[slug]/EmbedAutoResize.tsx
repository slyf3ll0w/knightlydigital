"use client";

import { useEffect } from "react";

/**
 * Reports the embed's content height to the host page so the iframe can hug
 * the form instead of using a fixed height (cut-off form or dead gap). The
 * copy-paste snippet in Settings listens for this message and resizes the
 * matching iframe. The slug rides along so multiple embeds on one page don't
 * fight over each other's heights.
 */
export default function EmbedAutoResize({ slug }: { slug: string }) {
  useEffect(() => {
    const post = () => {
      const height = document.documentElement.scrollHeight;
      // "jobflow:height" is the wire protocol name from before the
      // Streamflaire Hub rename — keep it: copied snippets on customer
      // sites (e.g. Excellent PC Building) listen for exactly this type.
      window.parent?.postMessage({ type: "jobflow:height", slug, height }, "*");
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
  }, [slug]);

  return null;
}
