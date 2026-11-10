"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * A link to one of the app's own PDFs (/api/app/.../pdf).
 *
 * On a desk it is a plain new-tab link. In the phone app a new tab is handed
 * to the outside browser, which has no sign-in cookie, so the PDF never
 * showed (ticket 2026-11-06, Preview PDF on a job's work report — same cause
 * as the chat photo ticket of 2026-11-04). There the tap fetches the PDF with
 * the app's own session and hands it to the phone's share sheet, which
 * previews it and offers Save to Files, Print and Mail. A phone app without
 * the share sheet keeps the plain link.
 */
export default function PdfLink({
  href,
  className,
  children,
  fallbackName = "document.pdf",
}: {
  href: string;
  className?: string;
  children: ReactNode;
  fallbackName?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (typeof navigator === "undefined" || !navigator.userAgent.includes("StreamflaireHubShell")) return;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return;
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const named = /filename="?([^";]+)"?/i.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
      const file = new File([blob], named || fallbackName, { type: "application/pdf" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file] });
      } else {
        alert("This phone can't open the PDF here. Open it from WorkBench on a computer.");
      }
    } catch (err) {
      // A closed share sheet throws AbortError — nothing to do.
      if (!(err instanceof Error && err.name === "AbortError")) alert("Couldn't open the PDF. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className} aria-busy={busy || undefined}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : null}
      {children}
    </a>
  );
}
