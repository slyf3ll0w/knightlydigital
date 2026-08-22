"use client";

import { Navigation, Phone } from "lucide-react";
import { telHref } from "@/lib/messaging";
import SwipeRow, { type SwipeRowAction } from "./SwipeRow";

/**
 * SwipeRow with the standard contact actions (Call / Directions) built from
 * plain strings — usable straight from server components (component refs
 * can't cross the server→client boundary, strings can).
 */
export default function SwipeRowContact({
  phone,
  address,
  children,
}: {
  phone?: string | null;
  address?: string | null;
  children: React.ReactNode;
}) {
  const actions: SwipeRowAction[] = [
    ...(phone
      ? [{ key: "call", label: "Call", icon: Phone, href: telHref(phone), bg: "#16A34A" }]
      : []),
    ...(address
      ? [
          {
            key: "nav",
            label: "Directions",
            icon: Navigation,
            href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
            external: true,
            bg: "#2563EB",
          },
        ]
      : []),
  ];
  return <SwipeRow actions={actions}>{children}</SwipeRow>;
}
