"use client";

import { usePathname } from "next/navigation";

/**
 * Re-mounts on every navigation (unlike layout), giving each page a quick
 * entrance. The variant is keyed to the section so navigation has texture —
 * lists sweep in from the right, the schedule settles into place, everything
 * else rises — while staying subtle enough to never slow anyone down.
 * Animations are from-only with no fill mode, so once they end there's no
 * lingering transform to break fixed/sticky descendants.
 */

// First path segment after /app → entrance flavor. Anything unlisted rises.
const SECTION_ANIM: Record<string, string> = {
  // Entity lists and their detail pages — sweep in from the right
  contacts: "page-enter-sweep",
  leads: "page-enter-sweep",
  requests: "page-enter-sweep",
  quotes: "page-enter-sweep",
  jobs: "page-enter-sweep",
  invoices: "page-enter-sweep",
  subscriptions: "page-enter-sweep",
  payments: "page-enter-sweep",
  contracts: "page-enter-sweep",
  expenses: "page-enter-sweep",
  // Big canvases — settle from a slight zoom
  schedule: "page-enter-settle",
  insights: "page-enter-settle",
  chat: "page-enter-settle",
};

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = pathname.split("/")[2] ?? "";
  return <div className={SECTION_ANIM[section] ?? "page-enter-rise"}>{children}</div>;
}
