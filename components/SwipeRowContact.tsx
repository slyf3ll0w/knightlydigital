"use client";

import { Navigation, Phone } from "lucide-react";
import { telHref } from "@/lib/messaging";
import { callFromLine, useLineCalling } from "@/lib/line-calling";
import SwipeRow, { type SwipeRowAction } from "./SwipeRow";

/**
 * SwipeRow with the standard contact actions (Call / Directions) built from
 * plain strings — usable straight from server components (component refs
 * can't cross the server→client boundary, strings can). Call dials from the
 * business line when the company has one (lib/line-calling.ts), tel: otherwise.
 */
export default function SwipeRowContact({
  phone,
  contactId,
  name,
  address,
  children,
}: {
  phone?: string | null;
  contactId?: string | null;
  name?: string;
  address?: string | null;
  children: React.ReactNode;
}) {
  const line = useLineCalling();
  const actions: SwipeRowAction[] = [
    ...(phone
      ? [
          line
            ? { key: "call", label: "Call", icon: Phone, onClick: () => void callFromLine({ contactId: contactId ?? null, to: phone, label: name || phone }), bg: "var(--ds-good, #16A34A)" }
            : { key: "call", label: "Call", icon: Phone, href: telHref(phone), bg: "var(--ds-good, #16A34A)" },
        ]
      : []),
    ...(address
      ? [
          {
            key: "nav",
            label: "Directions",
            icon: Navigation,
            href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
            external: true,
            bg: "var(--ds-primary, #2563EB)",
          },
        ]
      : []),
  ];
  return <SwipeRow actions={actions}>{children}</SwipeRow>;
}
