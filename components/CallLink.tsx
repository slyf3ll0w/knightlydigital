"use client";

import { useState, type ReactNode } from "react";
import { telHref } from "@/lib/messaging";
import { useSoftphone } from "@/lib/softphone-client";
import { callFromLine, lineCallTitle, useLineCalling } from "@/lib/line-calling";

/**
 * A Call control that dials the right way for this company: a plain tel:
 * link (the device's own dialer, from the personal cell) until the company
 * has a business line on the voice app — then a button that places the call
 * from the line (lib/line-calling.ts), so the client sees the business
 * number and a phone never asks which app to dial with.
 *
 * Styling is the caller's: pass the same className an <a> got before. The
 * server renders the tel: shape (the flag is client-only), so a tap before
 * hydration still dials.
 */
export default function CallLink({
  phone,
  contactId,
  name,
  className,
  title,
  "aria-label": ariaLabel,
  children,
}: {
  phone: string;
  /** The client, when the number belongs to one — the server logs the call against them. */
  contactId?: string | null;
  /** Who is being called, for the tooltip and the "pick up your phone" banner. */
  name?: string;
  className?: string;
  /** Tooltip for the tel: shape; the line shape explains itself. */
  title?: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  const line = useLineCalling();
  const sp = useSoftphone();
  const [busy, setBusy] = useState(false);
  const who = name || phone;

  if (!line) {
    return (
      <a href={telHref(phone)} className={className} title={title} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      title={lineCallTitle(sp, who)}
      aria-label={ariaLabel}
      disabled={busy || (sp.status === "ready" && !!sp.call)}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          await callFromLine({ contactId: contactId ?? null, to: phone, label: who });
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}
