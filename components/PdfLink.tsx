"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * A link to one of the app's own files (/api/app/.../pdf, a CSV export).
 *
 * On a desk it is a plain link. In the phone app a link out of /app is
 * handed to the outside browser, which has no sign-in cookie, so the file
 * never showed (ticket 2026-11-06, Preview PDF on a job's work report — same
 * cause as the chat photo ticket of 2026-11-04). There the tap fetches the
 * file with the app's own session and hands it to the phone's share sheet,
 * which previews it and offers Save to Files, Print and Mail. A phone app
 * without the share sheet keeps the plain link.
 *
 * `data-in-app` tells the shell's link interceptor (NativeShell.tsx) to
 * leave the tap alone: it listens in the capture phase, ahead of this
 * handler, and used to open the outside browser as well.
 */

/** True inside the iOS/Android shell when the share sheet can take files. */
function shellCanShare(): boolean {
  if (typeof navigator === "undefined" || !navigator.userAgent.includes("StreamflaireHubShell")) return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return typeof nav.share === "function" && typeof nav.canShare === "function";
}

/**
 * In the phone app: fetch one of the app's own files with the session and
 * hand it to the share sheet. Returns false when not in the phone app (the
 * caller opens the link the ordinary way), true when it was handled here.
 */
export async function shareAppFile(href: string, fallbackName: string, mime: string): Promise<boolean> {
  if (!shellCanShare()) return false;
  const nav = navigator as Navigator & { canShare: (d: ShareData) => boolean };
  try {
    const res = await fetch(href, { credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const named = /filename="?([^";]+)"?/i.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
    const file = new File([blob], named || fallbackName, { type: mime });
    if (nav.canShare({ files: [file] })) {
      await nav.share({ files: [file] });
    } else {
      alert("This phone can't open the file here. Open it from WorkBench on a computer.");
    }
  } catch (err) {
    // A closed share sheet throws AbortError — nothing to do.
    if (!(err instanceof Error && err.name === "AbortError")) alert("Couldn't open the file. Check your connection and try again.");
  }
  return true;
}

export default function PdfLink({
  href,
  className,
  children,
  fallbackName = "document.pdf",
  mime = "application/pdf",
  newTab = true,
  title,
  ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  fallbackName?: string;
  /** The file's type — "text/csv" for an export. */
  mime?: string;
  /** PDFs open in a new tab on a desk; a download (CSV) stays on the page. */
  newTab?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!shellCanShare()) return;
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await shareAppFile(href, fallbackName, mime);
    } finally {
      setBusy(false);
    }
  }

  return (
    <a
      href={href}
      data-in-app=""
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={onClick}
      className={className}
      title={title}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : null}
      {children}
    </a>
  );
}
